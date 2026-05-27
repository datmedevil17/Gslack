package ai

import (
	"context"
	"fmt"
	"net/http"
	"strings"

	"github.com/datmedevil/slack/backend/internal/models"
	"github.com/gin-gonic/gin"
	"github.com/google/generative-ai-go/genai"
	"github.com/google/uuid"
	openai "github.com/sashabaranov/go-openai"
	"google.golang.org/api/option"
	"gorm.io/gorm"
)

// Handler holds two AI clients:
//   - Groq (llama-3.3-70b via openai-compat API) → ultra-fast, used for real-time chat
//   - Gemini (1.5-pro)                            → long-context, used for summarisation
type Handler struct {
	db          *gorm.DB
	groq        *openai.Client  // fast inference
	gemini      *genai.GenerativeModel // smart reasoning
}

const (
	groqBaseURL  = "https://api.groq.com/openai/v1"
	groqModel    = "llama-3.3-70b-versatile" // best balance of speed + quality on Groq
	geminiModel  = "gemini-1.5-flash"
)

func New(db *gorm.DB, geminiKey, groqKey string) *Handler {
	h := &Handler{db: db}

	// Groq client (OpenAI-compatible)
	if groqKey != "" {
		cfg := openai.DefaultConfig(groqKey)
		cfg.BaseURL = groqBaseURL
		h.groq = openai.NewClientWithConfig(cfg)
	}

	// Gemini client
	if geminiKey != "" {
		ctx := context.Background()
		client, err := genai.NewClient(ctx, option.WithAPIKey(geminiKey))
		if err == nil {
			m := client.GenerativeModel(geminiModel)
			m.SystemInstruction = &genai.Content{
				Parts: []genai.Part{genai.Text(systemPrompt)},
			}
			h.gemini = m
		}
	}
	return h
}

const systemPrompt = `You are an AI assistant embedded in a team workspace (like Slack).
You have access to recent channel messages. Be concise, direct, and helpful.
Use plain text. Reference specific messages when relevant.`

// ─── POST /api/v1/ai/chat ─────────────────────────────────────────────────────
// Uses Groq (fast) with channel history as context.
func (h *Handler) Chat(c *gin.Context) {
	if h.groq == nil && h.gemini == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "AI not configured"})
		return
	}

	var req struct {
		Message      string `json:"message" binding:"required"`
		ChannelID    string `json:"channel_id"`
		ContextLimit int    `json:"context_limit"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if req.ContextLimit <= 0 || req.ContextLimit > 100 {
		req.ContextLimit = 40
	}

	contextBlock := h.buildChannelContext(req.ChannelID, req.ContextLimit)

	// Prefer Groq (faster), fall back to Gemini
	if h.groq != nil {
		reply, err := h.groqChat(c.Request.Context(), req.Message, contextBlock)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"reply": reply, "model": groqModel, "provider": "groq"})
		return
	}

	reply, err := h.geminiChat(c.Request.Context(), req.Message, contextBlock)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"reply": reply, "model": geminiModel, "provider": "gemini"})
}

// ─── POST /api/v1/ai/summarize/:channelID ─────────────────────────────────────
// Uses Gemini (better long-context reasoning).
func (h *Handler) Summarize(c *gin.Context) {
	if h.gemini == nil && h.groq == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "AI not configured"})
		return
	}

	cid, err := uuid.Parse(c.Param("channelID"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid channel id"})
		return
	}

	var msgs []models.Message
	h.db.Where("channel_id = ? AND is_deleted = false AND parent_id IS NULL", cid).
		Preload("Sender").Order("created_at DESC").Limit(80).Find(&msgs)

	if len(msgs) == 0 {
		c.JSON(http.StatusOK, gin.H{"summary": "No messages to summarise yet."})
		return
	}
	msgs = reverseMessages(msgs)

	prompt := fmt.Sprintf(`Summarise the following team conversation in 3-5 bullet points.
Focus on: decisions made, open questions, and action items. Be concise, plain text.

Conversation:
%s`, formatMessages(msgs))

	var summary string
	// Prefer Gemini for summarise; fall back to Groq
	if h.gemini != nil {
		resp, err := h.gemini.GenerateContent(c.Request.Context(), genai.Text(prompt))
		if err == nil {
			summary = extractGeminiText(resp)
		}
	}
	if summary == "" && h.groq != nil {
		summary, _ = h.groqChat(c.Request.Context(), prompt, "")
	}

	c.JSON(http.StatusOK, gin.H{"summary": summary, "message_count": len(msgs)})
}

// ─── POST /api/v1/ai/reply-suggest/:messageID ─────────────────────────────────
// Smart reply suggestions — uses Groq for speed.
func (h *Handler) SuggestReplies(c *gin.Context) {
	if h.groq == nil && h.gemini == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "AI not configured"})
		return
	}

	mid, err := uuid.Parse(c.Param("messageID"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid message id"})
		return
	}

	var msg models.Message
	if err := h.db.Preload("Sender").First(&msg, "id = ?", mid).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}

	var thread []models.Message
	h.db.Where("channel_id = ? AND is_deleted = false", msg.ChannelID).
		Preload("Sender").Order("created_at DESC").Limit(8).Find(&thread)
	thread = reverseMessages(thread)

	prompt := fmt.Sprintf(`Given this team conversation, suggest 3 short reply options for the last message.
Each on its own line prefixed with "- ". Under 10 words each. Natural and contextual.

Conversation:
%s

Last message: "%s"`, formatMessages(thread), msg.Content)

	var raw string
	if h.groq != nil {
		raw, _ = h.groqChat(c.Request.Context(), prompt, "")
	} else if h.gemini != nil {
		resp, _ := h.gemini.GenerateContent(c.Request.Context(), genai.Text(prompt))
		raw = extractGeminiText(resp)
	}

	c.JSON(http.StatusOK, gin.H{"suggestions": parseBullets(raw)})
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

func (h *Handler) groqChat(ctx context.Context, userMsg, contextBlock string) (string, error) {
	messages := []openai.ChatCompletionMessage{
		{Role: openai.ChatMessageRoleSystem, Content: systemPrompt},
	}
	if contextBlock != "" {
		messages = append(messages, openai.ChatCompletionMessage{
			Role:    openai.ChatMessageRoleSystem,
			Content: "Recent channel messages:\n" + contextBlock,
		})
	}
	messages = append(messages, openai.ChatCompletionMessage{
		Role:    openai.ChatMessageRoleUser,
		Content: userMsg,
	})

	resp, err := h.groq.CreateChatCompletion(ctx, openai.ChatCompletionRequest{
		Model:       groqModel,
		Messages:    messages,
		MaxTokens:   1024,
		Temperature: 0.7,
	})
	if err != nil {
		return "", fmt.Errorf("groq: %w", err)
	}
	if len(resp.Choices) == 0 {
		return "", fmt.Errorf("groq: no choices returned")
	}
	return strings.TrimSpace(resp.Choices[0].Message.Content), nil
}

func (h *Handler) geminiChat(ctx context.Context, userMsg, contextBlock string) (string, error) {
	prompt := userMsg
	if contextBlock != "" {
		prompt = "Recent channel messages:\n" + contextBlock + "\n\nQuestion: " + userMsg
	}
	resp, err := h.gemini.GenerateContent(ctx, genai.Text(prompt))
	if err != nil {
		return "", fmt.Errorf("gemini: %w", err)
	}
	return extractGeminiText(resp), nil
}

func (h *Handler) buildChannelContext(channelID string, limit int) string {
	if channelID == "" {
		return ""
	}
	cid, err := uuid.Parse(channelID)
	if err != nil {
		return ""
	}
	var msgs []models.Message
	h.db.Where("channel_id = ? AND is_deleted = false", cid).
		Preload("Sender").Order("created_at DESC").Limit(limit).Find(&msgs)
	return formatMessages(reverseMessages(msgs))
}

func formatMessages(msgs []models.Message) string {
	var sb strings.Builder
	for _, m := range msgs {
		name := "Unknown"
		if m.Sender.Username != "" {
			name = m.Sender.Username
		} else if m.Sender.Email != "" {
			name = strings.Split(m.Sender.Email, "@")[0]
		}
		sb.WriteString(fmt.Sprintf("[%s] %s: %s\n", m.CreatedAt.Format("15:04"), name, m.Content))
	}
	return sb.String()
}

func reverseMessages(msgs []models.Message) []models.Message {
	for i, j := 0, len(msgs)-1; i < j; i, j = i+1, j-1 {
		msgs[i], msgs[j] = msgs[j], msgs[i]
	}
	return msgs
}

func extractGeminiText(resp *genai.GenerateContentResponse) string {
	if resp == nil || len(resp.Candidates) == 0 {
		return ""
	}
	var sb strings.Builder
	for _, part := range resp.Candidates[0].Content.Parts {
		if t, ok := part.(genai.Text); ok {
			sb.WriteString(string(t))
		}
	}
	return strings.TrimSpace(sb.String())
}

func parseBullets(raw string) []string {
	var out []string
	for _, line := range strings.Split(raw, "\n") {
		line = strings.TrimSpace(line)
		line = strings.TrimPrefix(line, "- ")
		line = strings.TrimPrefix(line, "• ")
		if line != "" {
			out = append(out, line)
		}
	}
	return out
}
