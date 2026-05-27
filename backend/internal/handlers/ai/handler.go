package ai

import (
	"context"
	"fmt"
	"net/http"
	"strings"

	"github.com/datmedevil/slack/backend/internal/middleware"
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
//   - Gemini (1.5-flash)                          → long-context, used for summarisation
type Handler struct {
	db     *gorm.DB
	groq   *openai.Client
	gemini *genai.GenerativeModel
}

const (
	groqBaseURL = "https://api.groq.com/openai/v1"
	groqModel   = "llama-3.3-70b-versatile"
	geminiModel = "gemini-1.5-flash"
)

func New(db *gorm.DB, geminiKey, groqKey string) *Handler {
	h := &Handler{db: db}

	if groqKey != "" {
		cfg := openai.DefaultConfig(groqKey)
		cfg.BaseURL = groqBaseURL
		h.groq = openai.NewClientWithConfig(cfg)
	}

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
You have been given the full workspace context: all channels with their recent messages,
direct messages, and member list. Use this context to give accurate, specific answers.
Be concise, direct, and helpful. Use plain text. Reference specific messages or people when relevant.`

// ─── POST /api/v1/ai/chat ─────────────────────────────────────────────────────
func (h *Handler) Chat(c *gin.Context) {
	if h.groq == nil && h.gemini == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "AI not configured"})
		return
	}

	var req struct {
		Message     string `json:"message" binding:"required"`
		WorkspaceID string `json:"workspace_id"`
		ChannelID   string `json:"channel_id"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	sub, _ := c.Get(middleware.UserIDKey)
	userID, _ := uuid.Parse(sub.(string))

	var contextBlock string
	if req.WorkspaceID != "" {
		wid, err := uuid.Parse(req.WorkspaceID)
		if err == nil {
			contextBlock = h.buildWorkspaceContext(userID, wid)
		}
	} else if req.ChannelID != "" {
		contextBlock = h.buildChannelContext(req.ChannelID, 40)
	}

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

// ─── Context builders ─────────────────────────────────────────────────────────

// buildWorkspaceContext aggregates the entire workspace visible to userID:
// workspace info, all members, all joined channels + recent msgs, all DMs + recent msgs.
func (h *Handler) buildWorkspaceContext(userID, workspaceID uuid.UUID) string {
	var sb strings.Builder

	// Workspace info
	var ws models.Workspace
	if err := h.db.First(&ws, "id = ?", workspaceID).Error; err == nil {
		sb.WriteString(fmt.Sprintf("=== Workspace: %s ===\n", ws.Name))
		if ws.Description != nil && *ws.Description != "" {
			sb.WriteString(fmt.Sprintf("Description: %s\n", *ws.Description))
		}
	}

	// Workspace members
	var members []models.WorkspaceMember
	h.db.Where("workspace_id = ? AND is_active = true", workspaceID).
		Preload("User").Find(&members)
	if len(members) > 0 {
		sb.WriteString(fmt.Sprintf("\n--- Members (%d) ---\n", len(members)))
		for _, m := range members {
			name := m.User.FullName
			if name == "" {
				name = m.User.Username
			}
			sb.WriteString(fmt.Sprintf("• %s (@%s) [%s]\n", name, m.User.Username, m.Role))
		}
	}

	// Channels the user belongs to (up to 20 most recently active)
	var chanMembers []models.ChannelMember
	h.db.Where("user_id = ?", userID).Find(&chanMembers)
	if len(chanMembers) > 0 {
		chanIDs := make([]uuid.UUID, 0, len(chanMembers))
		for _, cm := range chanMembers {
			chanIDs = append(chanIDs, cm.ChannelID)
		}

		var channels []models.Channel
		h.db.Where("workspace_id = ? AND id IN ? AND is_archived = false AND type IN ('public','private')",
			workspaceID, chanIDs).
			Order("last_message_at DESC NULLS LAST").
			Limit(20).Find(&channels)

		for _, ch := range channels {
			var msgs []models.Message
			h.db.Where("channel_id = ? AND is_deleted = false AND parent_id IS NULL", ch.ID).
				Preload("Sender").Order("created_at DESC").Limit(15).Find(&msgs)
			if len(msgs) == 0 {
				continue
			}
			msgs = reverseMessages(msgs)

			sb.WriteString(fmt.Sprintf("\n--- #%s", ch.Name))
			if ch.Description != nil && *ch.Description != "" {
				sb.WriteString(fmt.Sprintf(" (%s)", *ch.Description))
			}
			sb.WriteString(" ---\n")
			sb.WriteString(formatMessages(msgs))
		}
	}

	// DM conversations the user is part of (up to 15 most recent)
	var dmParts []models.DMParticipant
	h.db.Where("user_id = ?", userID).Find(&dmParts)
	if len(dmParts) > 0 {
		convoIDs := make([]uuid.UUID, 0, len(dmParts))
		for _, p := range dmParts {
			convoIDs = append(convoIDs, p.ConversationID)
		}

		var convos []models.DMConversation
		h.db.Where("workspace_id = ? AND id IN ?", workspaceID, convoIDs).
			Preload("Participants.User").
			Limit(15).Find(&convos)

		for _, convo := range convos {
			var msgs []models.DMMessage
			h.db.Where("conversation_id = ? AND is_deleted = false", convo.ID).
				Preload("Sender").Order("created_at DESC").Limit(10).Find(&msgs)
			if len(msgs) == 0 {
				continue
			}
			for i, j := 0, len(msgs)-1; i < j; i, j = i+1, j-1 {
				msgs[i], msgs[j] = msgs[j], msgs[i]
			}

			label := buildDMLabel(convo, userID)
			sb.WriteString(fmt.Sprintf("\n--- %s ---\n", label))
			for _, m := range msgs {
				name := m.Sender.Username
				if name == "" {
					name = "unknown"
				}
				sb.WriteString(fmt.Sprintf("[%s] %s: %s\n", m.CreatedAt.Format("15:04"), name, m.Content))
			}
		}
	}

	return sb.String()
}

func buildDMLabel(convo models.DMConversation, myID uuid.UUID) string {
	if convo.IsGroup {
		if convo.Name != nil && *convo.Name != "" {
			return "Group DM: " + *convo.Name
		}
		return "Group DM"
	}
	var names []string
	for _, p := range convo.Participants {
		if p.UserID != myID {
			n := p.User.FullName
			if n == "" {
				n = p.User.Username
			}
			names = append(names, n)
		}
	}
	if len(names) > 0 {
		return "DM with " + strings.Join(names, ", ")
	}
	return "DM"
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

// ─── LLM helpers ──────────────────────────────────────────────────────────────

func (h *Handler) groqChat(ctx context.Context, userMsg, contextBlock string) (string, error) {
	messages := []openai.ChatCompletionMessage{
		{Role: openai.ChatMessageRoleSystem, Content: systemPrompt},
	}
	if contextBlock != "" {
		messages = append(messages, openai.ChatCompletionMessage{
			Role:    openai.ChatMessageRoleSystem,
			Content: "Current workspace context:\n" + contextBlock,
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
		prompt = "Current workspace context:\n" + contextBlock + "\n\nQuestion: " + userMsg
	}
	resp, err := h.gemini.GenerateContent(ctx, genai.Text(prompt))
	if err != nil {
		return "", fmt.Errorf("gemini: %w", err)
	}
	return extractGeminiText(resp), nil
}

// ─── Formatting helpers ───────────────────────────────────────────────────────

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
