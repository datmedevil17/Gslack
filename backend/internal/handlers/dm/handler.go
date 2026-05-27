package dm

import (
	"net/http"
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
	sub, _ := c.Get(middleware.UserIDKey)
	uid, _ := uuid.Parse(sub.(string))
	var convos []models.DMConversation
	h.db.Joins("JOIN dm_participants ON dm_participants.conversation_id = dm_conversations.id").
		Where("dm_participants.user_id = ? AND dm_conversations.is_group = false", uid).
		Preload("Participants.User").Find(&convos)
	c.JSON(http.StatusOK, gin.H{"data": convos})
}

func (h *Handler) Create(c *gin.Context) {
	sub, _ := c.Get(middleware.UserIDKey)
	uid, _ := uuid.Parse(sub.(string))
	var req struct {
		RecipientID string `json:"recipient_id" binding:"required"`
		WorkspaceID string `json:"workspace_id" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	rid, _ := uuid.Parse(req.RecipientID)
	wid, _ := uuid.Parse(req.WorkspaceID)
	convo := models.DMConversation{WorkspaceID: wid, IsGroup: false, CreatedBy: uid}
	if err := h.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(&convo).Error; err != nil {
			return err
		}
		p1 := models.DMParticipant{ConversationID: convo.ID, UserID: uid, JoinedAt: time.Now()}
		p2 := models.DMParticipant{ConversationID: convo.ID, UserID: rid, JoinedAt: time.Now()}
		return tx.Create([]*models.DMParticipant{&p1, &p2}).Error
	}); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create DM"})
		return
	}
	c.JSON(http.StatusCreated, gin.H{"data": convo})
}

func (h *Handler) Get(c *gin.Context) {
	did, _ := uuid.Parse(c.Param("dmID"))
	var convo models.DMConversation
	if err := h.db.Preload("Participants.User").First(&convo, "id = ?", did).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": convo})
}

func (h *Handler) Delete(c *gin.Context) {
	did, _ := uuid.Parse(c.Param("dmID"))
	sub, _ := c.Get(middleware.UserIDKey)
	uid, _ := uuid.Parse(sub.(string))
	h.db.Where("conversation_id = ? AND user_id = ?", did, uid).Delete(&models.DMParticipant{})
	c.JSON(http.StatusOK, gin.H{"message": "left conversation"})
}

func (h *Handler) ListMessages(c *gin.Context) {
	did, _ := uuid.Parse(c.Param("dmID"))
	var msgs []models.DMMessage
	h.db.Where("conversation_id = ? AND is_deleted = false", did).
		Preload("Sender").Preload("Reactions").Order("created_at ASC").Limit(50).Find(&msgs)
	c.JSON(http.StatusOK, gin.H{"data": msgs})
}

func (h *Handler) SendMessage(c *gin.Context) {
	did, _ := uuid.Parse(c.Param("dmID"))
	sub, _ := c.Get(middleware.UserIDKey)
	uid, _ := uuid.Parse(sub.(string))
	var req struct{ Content string `json:"content" binding:"required"` }
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	msg := models.DMMessage{ConversationID: did, SenderID: uid, Content: req.Content}
	h.db.Create(&msg)
	h.db.Preload("Sender").First(&msg, "id = ?", msg.ID)
	h.hub.Broadcast("dm:"+did.String(), &ws.OutboundMessage{Type: ws.EventMessageNew, Room: "dm:" + did.String(), Payload: msg})
	c.JSON(http.StatusCreated, gin.H{"data": msg})
}

func (h *Handler) UpdateMessage(c *gin.Context) {
	mid, _ := uuid.Parse(c.Param("messageID"))
	sub, _ := c.Get(middleware.UserIDKey)
	uid, _ := uuid.Parse(sub.(string))
	var req struct{ Content string `json:"content" binding:"required"` }
	c.ShouldBindJSON(&req)
	now := time.Now()
	h.db.Model(&models.DMMessage{}).Where("id = ? AND sender_id = ?", mid, uid).
		Updates(map[string]any{"content": req.Content, "is_edited": true, "edited_at": now})
	c.JSON(http.StatusOK, gin.H{"message": "updated"})
}

func (h *Handler) DeleteMessage(c *gin.Context) {
	mid, _ := uuid.Parse(c.Param("messageID"))
	sub, _ := c.Get(middleware.UserIDKey)
	uid, _ := uuid.Parse(sub.(string))
	h.db.Model(&models.DMMessage{}).Where("id = ? AND sender_id = ?", mid, uid).Update("is_deleted", true)
	c.JSON(http.StatusOK, gin.H{"message": "deleted"})
}

func (h *Handler) AddReaction(c *gin.Context) {
	mid, _ := uuid.Parse(c.Param("messageID"))
	sub, _ := c.Get(middleware.UserIDKey)
	uid, _ := uuid.Parse(sub.(string))
	var req struct{ Emoji string `json:"emoji" binding:"required"` }
	c.ShouldBindJSON(&req)
	h.db.Create(&models.DMMessageReaction{MessageID: mid, UserID: uid, Emoji: req.Emoji, CreatedAt: time.Now()})
	c.JSON(http.StatusOK, gin.H{"message": "reaction added"})
}

func (h *Handler) RemoveReaction(c *gin.Context) {
	mid, _ := uuid.Parse(c.Param("messageID"))
	emoji := c.Param("emoji")
	sub, _ := c.Get(middleware.UserIDKey)
	uid, _ := uuid.Parse(sub.(string))
	h.db.Where("message_id = ? AND user_id = ? AND emoji = ?", mid, uid, emoji).Delete(&models.DMMessageReaction{})
	c.JSON(http.StatusOK, gin.H{"message": "removed"})
}

// Group DM
func (h *Handler) ListGroups(c *gin.Context) {
	sub, _ := c.Get(middleware.UserIDKey)
	uid, _ := uuid.Parse(sub.(string))
	var convos []models.DMConversation
	h.db.Joins("JOIN dm_participants ON dm_participants.conversation_id = dm_conversations.id").
		Where("dm_participants.user_id = ? AND dm_conversations.is_group = true", uid).
		Preload("Participants.User").Find(&convos)
	c.JSON(http.StatusOK, gin.H{"data": convos})
}

func (h *Handler) CreateGroup(c *gin.Context) {
	sub, _ := c.Get(middleware.UserIDKey)
	uid, _ := uuid.Parse(sub.(string))
	var req struct {
		Name        string   `json:"name"`
		MemberIDs   []string `json:"member_ids" binding:"required"`
		WorkspaceID string   `json:"workspace_id" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	wid, _ := uuid.Parse(req.WorkspaceID)
	convo := models.DMConversation{WorkspaceID: wid, IsGroup: true, CreatedBy: uid}
	if req.Name != "" {
		convo.Name = &req.Name
	}
	h.db.Transaction(func(tx *gorm.DB) error {
		tx.Create(&convo)
		participants := []*models.DMParticipant{{ConversationID: convo.ID, UserID: uid, JoinedAt: time.Now()}}
		for _, mid := range req.MemberIDs {
			pid, _ := uuid.Parse(mid)
			participants = append(participants, &models.DMParticipant{ConversationID: convo.ID, UserID: pid, JoinedAt: time.Now()})
		}
		return tx.Create(&participants).Error
	})
	c.JSON(http.StatusCreated, gin.H{"data": convo})
}

func (h *Handler) GetGroup(c *gin.Context) {
	gid, _ := uuid.Parse(c.Param("groupID"))
	var convo models.DMConversation
	h.db.Preload("Participants.User").First(&convo, "id = ? AND is_group = true", gid)
	c.JSON(http.StatusOK, gin.H{"data": convo})
}

func (h *Handler) UpdateGroup(c *gin.Context) {
	gid, _ := uuid.Parse(c.Param("groupID"))
	var req struct{ Name string `json:"name"` }
	c.ShouldBindJSON(&req)
	h.db.Model(&models.DMConversation{}).Where("id = ?", gid).Update("name", req.Name)
	c.JSON(http.StatusOK, gin.H{"message": "updated"})
}

func (h *Handler) DeleteGroup(c *gin.Context) {
	gid, _ := uuid.Parse(c.Param("groupID"))
	h.db.Delete(&models.DMConversation{}, "id = ?", gid)
	c.JSON(http.StatusOK, gin.H{"message": "deleted"})
}

func (h *Handler) AddGroupMember(c *gin.Context) {
	gid, _ := uuid.Parse(c.Param("groupID"))
	var req struct{ UserID string `json:"user_id"` }
	c.ShouldBindJSON(&req)
	uid, _ := uuid.Parse(req.UserID)
	h.db.Create(&models.DMParticipant{ConversationID: gid, UserID: uid, JoinedAt: time.Now()})
	c.JSON(http.StatusOK, gin.H{"message": "member added"})
}

func (h *Handler) RemoveGroupMember(c *gin.Context) {
	gid, _ := uuid.Parse(c.Param("groupID"))
	uid, _ := uuid.Parse(c.Param("userID"))
	h.db.Where("conversation_id = ? AND user_id = ?", gid, uid).Delete(&models.DMParticipant{})
	c.JSON(http.StatusOK, gin.H{"message": "removed"})
}

func (h *Handler) ListGroupMessages(c *gin.Context) {
	gid, _ := uuid.Parse(c.Param("groupID"))
	var msgs []models.DMMessage
	h.db.Where("conversation_id = ? AND is_deleted = false", gid).Preload("Sender").Order("created_at ASC").Limit(50).Find(&msgs)
	c.JSON(http.StatusOK, gin.H{"data": msgs})
}

func (h *Handler) SendGroupMessage(c *gin.Context) {
	gid, _ := uuid.Parse(c.Param("groupID"))
	sub, _ := c.Get(middleware.UserIDKey)
	uid, _ := uuid.Parse(sub.(string))
	var req struct{ Content string `json:"content" binding:"required"` }
	c.ShouldBindJSON(&req)
	msg := models.DMMessage{ConversationID: gid, SenderID: uid, Content: req.Content}
	h.db.Create(&msg)
	h.hub.Broadcast("dm:"+gid.String(), &ws.OutboundMessage{Type: ws.EventMessageNew, Room: "dm:" + gid.String(), Payload: msg})
	c.JSON(http.StatusCreated, gin.H{"data": msg})
}
