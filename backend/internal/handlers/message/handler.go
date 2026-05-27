package message

import (
	"net/http"
	"strconv"
	"time"

	"github.com/datmedevil/slack/backend/internal/middleware"
	"github.com/datmedevil/slack/backend/internal/models"
	ws "github.com/datmedevil/slack/backend/internal/websocket"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

type Handler struct {
	db  *gorm.DB
	hub *ws.Hub
}

func New(db *gorm.DB, hub *ws.Hub) *Handler { return &Handler{db: db, hub: hub} }

func (h *Handler) List(c *gin.Context) {
	cid, _ := uuid.Parse(c.Param("channelID"))
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "50"))
	before := c.Query("before") // cursor-based pagination

	q := h.db.Where("channel_id = ? AND is_deleted = false AND parent_id IS NULL", cid).
		Preload("Sender").Preload("Reactions").Preload("Attachments").
		Order("created_at DESC").Limit(limit)
	if before != "" {
		q = q.Where("created_at < ?", before)
	}
	var msgs []models.Message
	q.Find(&msgs)
	c.JSON(http.StatusOK, gin.H{"data": msgs})
}

func (h *Handler) Send(c *gin.Context) {
	cid, err := uuid.Parse(c.Param("channelID"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid channel id"})
		return
	}
	sub, _ := c.Get(middleware.UserIDKey)
	senderID, _ := uuid.Parse(sub.(string))

	var req struct {
		Content     string  `json:"content" binding:"required"`
		ContentType string  `json:"content_type"`
		WorkspaceID string  `json:"workspace_id" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	wid, _ := uuid.Parse(req.WorkspaceID)
	ct := req.ContentType
	if ct == "" {
		ct = "text"
	}
	msg := models.Message{
		ChannelID:   cid,
		SenderID:    senderID,
		Content:     req.Content,
		ContentType: ct,
		WorkspaceID: wid,
	}
	if err := h.db.Create(&msg).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to send"})
		return
	}
	// Update channel's last_message_at
	now := time.Now()
	h.db.Model(&models.Channel{}).Where("id = ?", cid).Update("last_message_at", now)

	// Load sender info then broadcast
	h.db.Preload("Sender").First(&msg, "id = ?", msg.ID)
	h.hub.Broadcast("channel:"+cid.String(), &ws.OutboundMessage{
		Type:    ws.EventMessageNew,
		Room:    "channel:" + cid.String(),
		Payload: msg,
	})
	c.JSON(http.StatusCreated, gin.H{"data": msg})
}

func (h *Handler) Get(c *gin.Context) {
	mid, _ := uuid.Parse(c.Param("messageID"))
	var msg models.Message
	if err := h.db.Preload("Sender").Preload("Reactions").First(&msg, "id = ?", mid).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": msg})
}

func (h *Handler) Update(c *gin.Context) {
	mid, _ := uuid.Parse(c.Param("messageID"))
	sub, _ := c.Get(middleware.UserIDKey)
	userID, _ := uuid.Parse(sub.(string))

	var req struct{ Content string `json:"content" binding:"required"` }
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	now := time.Now()
	res := h.db.Model(&models.Message{}).Where("id = ? AND sender_id = ?", mid, userID).
		Updates(map[string]any{"content": req.Content, "is_edited": true, "edited_at": now})
	if res.RowsAffected == 0 {
		c.JSON(http.StatusForbidden, gin.H{"error": "not authorized"})
		return
	}
	var msg models.Message
	h.db.First(&msg, "id = ?", mid)
	cid := msg.ChannelID
	h.hub.Broadcast("channel:"+cid.String(), &ws.OutboundMessage{Type: ws.EventMessageUpdate, Room: "channel:" + cid.String(), Payload: msg})
	c.JSON(http.StatusOK, gin.H{"data": msg})
}

func (h *Handler) Delete(c *gin.Context) {
	mid, _ := uuid.Parse(c.Param("messageID"))
	sub, _ := c.Get(middleware.UserIDKey)
	userID, _ := uuid.Parse(sub.(string))
	res := h.db.Model(&models.Message{}).Where("id = ? AND sender_id = ?", mid, userID).Update("is_deleted", true)
	if res.RowsAffected == 0 {
		c.JSON(http.StatusForbidden, gin.H{"error": "not authorized"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "deleted"})
}

func (h *Handler) Pin(c *gin.Context) {
	cid, _ := uuid.Parse(c.Param("channelID"))
	mid, _ := uuid.Parse(c.Param("messageID"))
	sub, _ := c.Get(middleware.UserIDKey)
	uid, _ := uuid.Parse(sub.(string))
	h.db.Create(&models.PinnedMessage{ChannelID: cid, MessageID: mid, PinnedBy: uid, PinnedAt: time.Now()})
	c.JSON(http.StatusOK, gin.H{"message": "pinned"})
}

func (h *Handler) Unpin(c *gin.Context) {
	cid, _ := uuid.Parse(c.Param("channelID"))
	mid, _ := uuid.Parse(c.Param("messageID"))
	h.db.Where("channel_id = ? AND message_id = ?", cid, mid).Delete(&models.PinnedMessage{})
	c.JSON(http.StatusOK, gin.H{"message": "unpinned"})
}

func (h *Handler) GetThread(c *gin.Context) {
	mid, _ := uuid.Parse(c.Param("messageID"))
	var replies []models.Message
	h.db.Where("parent_id = ? AND is_deleted = false", mid).Preload("Sender").Preload("Reactions").Order("created_at ASC").Find(&replies)
	c.JSON(http.StatusOK, gin.H{"data": replies})
}

func (h *Handler) ReplyThread(c *gin.Context) {
	cid, _ := uuid.Parse(c.Param("channelID"))
	parentID, _ := uuid.Parse(c.Param("messageID"))
	sub, _ := c.Get(middleware.UserIDKey)
	senderID, _ := uuid.Parse(sub.(string))

	var req struct {
		Content     string `json:"content" binding:"required"`
		WorkspaceID string `json:"workspace_id" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	wid, _ := uuid.Parse(req.WorkspaceID)
	reply := models.Message{ChannelID: cid, SenderID: senderID, ParentID: &parentID, Content: req.Content, ContentType: "text", WorkspaceID: wid}
	h.db.Create(&reply)
	h.db.Model(&models.Message{}).Where("id = ?", parentID).UpdateColumn("reply_count", gorm.Expr("reply_count + 1"))
	h.db.Preload("Sender").First(&reply, "id = ?", reply.ID)
	h.hub.Broadcast("channel:"+cid.String(), &ws.OutboundMessage{Type: ws.EventMessageNew, Room: "channel:" + cid.String(), Payload: reply})
	c.JSON(http.StatusCreated, gin.H{"data": reply})
}

func (h *Handler) AddReaction(c *gin.Context) {
	mid, _ := uuid.Parse(c.Param("messageID"))
	sub, _ := c.Get(middleware.UserIDKey)
	uid, _ := uuid.Parse(sub.(string))
	var req struct{ Emoji string `json:"emoji" binding:"required"` }
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	r := models.MessageReaction{MessageID: mid, UserID: uid, Emoji: req.Emoji, CreatedAt: time.Now()}
	h.db.Create(&r)
	var msg models.Message
	h.db.First(&msg, "id = ?", mid)
	h.hub.Broadcast("channel:"+msg.ChannelID.String(), &ws.OutboundMessage{Type: ws.EventReactionAdd, Payload: r})
	c.JSON(http.StatusOK, gin.H{"data": r})
}

func (h *Handler) RemoveReaction(c *gin.Context) {
	mid, _ := uuid.Parse(c.Param("messageID"))
	emoji := c.Param("emoji")
	sub, _ := c.Get(middleware.UserIDKey)
	uid, _ := uuid.Parse(sub.(string))
	h.db.Where("message_id = ? AND user_id = ? AND emoji = ?", mid, uid, emoji).Delete(&models.MessageReaction{})
	var msg models.Message
	if h.db.First(&msg, "id = ?", mid).Error == nil {
		h.hub.Broadcast("channel:"+msg.ChannelID.String(), &ws.OutboundMessage{
			Type:    ws.EventReactionRemove,
			Payload: map[string]any{"message_id": mid, "user_id": uid, "emoji": emoji},
		})
	}
	c.JSON(http.StatusOK, gin.H{"message": "removed"})
}

func (h *Handler) Search(c *gin.Context) {
	cid, _ := uuid.Parse(c.Param("channelID"))
	q := "%" + c.Query("q") + "%"
	var msgs []models.Message
	h.db.Where("channel_id = ? AND content ILIKE ? AND is_deleted = false", cid, q).Preload("Sender").Limit(20).Find(&msgs)
	c.JSON(http.StatusOK, gin.H{"data": msgs})
}

func (h *Handler) Forward(c *gin.Context) {
	mid, _ := uuid.Parse(c.Param("messageID"))
	sub, _ := c.Get(middleware.UserIDKey)
	uid, _ := uuid.Parse(sub.(string))
	var req struct {
		TargetChannelID string `json:"target_channel_id" binding:"required"`
		WorkspaceID     string `json:"workspace_id" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	var original models.Message
	if err := h.db.First(&original, "id = ?", mid).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "original message not found"})
		return
	}
	tcid, _ := uuid.Parse(req.TargetChannelID)
	wid, _ := uuid.Parse(req.WorkspaceID)
	forwarded := models.Message{ChannelID: tcid, SenderID: uid, Content: original.Content, ContentType: original.ContentType, WorkspaceID: wid}
	h.db.Create(&forwarded)
	h.hub.Broadcast("channel:"+tcid.String(), &ws.OutboundMessage{Type: ws.EventMessageNew, Room: "channel:" + tcid.String(), Payload: forwarded})
	c.JSON(http.StatusCreated, gin.H{"data": forwarded})
}
