package channel

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

func (h *Handler) Create(c *gin.Context) {
	wid, err := uuid.Parse(c.Param("workspaceID"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid workspace id"})
		return
	}
	sub, _ := c.Get(middleware.UserIDKey)
	userID, _ := uuid.Parse(sub.(string))

	var req struct {
		Name        string `json:"name" binding:"required"`
		Description string `json:"description"`
		Type        string `json:"type"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if req.Type == "" {
		req.Type = "public"
	}
	ch := models.Channel{WorkspaceID: wid, Name: req.Name, Type: req.Type, CreatedBy: userID}
	if req.Description != "" {
		ch.Description = &req.Description
	}
	if err := h.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(&ch).Error; err != nil {
			return err
		}
		return tx.Create(&models.ChannelMember{ChannelID: ch.ID, UserID: userID, Role: "admin"}).Error
	}); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create channel"})
		return
	}
	h.hub.Broadcast("workspace:"+wid.String(), &ws.OutboundMessage{Type: ws.EventChannelUpdate, Payload: ch})
	c.JSON(http.StatusCreated, gin.H{"data": ch})
}

func (h *Handler) List(c *gin.Context) {
	wid, _ := uuid.Parse(c.Param("workspaceID"))
	var channels []models.Channel
	h.db.Where("workspace_id = ? AND is_archived = false", wid).Find(&channels)
	c.JSON(http.StatusOK, gin.H{"data": channels})
}

func (h *Handler) Get(c *gin.Context) {
	cid, err := uuid.Parse(c.Param("channelID"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid channel id"})
		return
	}
	var ch models.Channel
	if err := h.db.Preload("Creator").First(&ch, "id = ?", cid).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "channel not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": ch})
}

func (h *Handler) Update(c *gin.Context) {
	cid, _ := uuid.Parse(c.Param("channelID"))
	var req map[string]any
	c.ShouldBindJSON(&req)
	h.db.Model(&models.Channel{}).Where("id = ?", cid).Updates(req)
	c.JSON(http.StatusOK, gin.H{"message": "updated"})
}

func (h *Handler) Delete(c *gin.Context) {
	cid, _ := uuid.Parse(c.Param("channelID"))
	h.db.Delete(&models.Channel{}, "id = ?", cid)
	c.JSON(http.StatusOK, gin.H{"message": "deleted"})
}

func (h *Handler) Join(c *gin.Context) {
	cid, _ := uuid.Parse(c.Param("channelID"))
	sub, _ := c.Get(middleware.UserIDKey)
	userID, _ := uuid.Parse(sub.(string))
	var existing models.ChannelMember
	if err := h.db.Where("channel_id = ? AND user_id = ?", cid, userID).First(&existing).Error; err == nil {
		c.JSON(http.StatusConflict, gin.H{"error": "already a member"})
		return
	}
	h.db.Create(&models.ChannelMember{ChannelID: cid, UserID: userID, Role: "member"})
	c.JSON(http.StatusOK, gin.H{"message": "joined"})
}

func (h *Handler) Leave(c *gin.Context) {
	cid, _ := uuid.Parse(c.Param("channelID"))
	sub, _ := c.Get(middleware.UserIDKey)
	userID, _ := uuid.Parse(sub.(string))
	h.db.Where("channel_id = ? AND user_id = ?", cid, userID).Delete(&models.ChannelMember{})
	c.JSON(http.StatusOK, gin.H{"message": "left"})
}

func (h *Handler) ListMembers(c *gin.Context) {
	cid, _ := uuid.Parse(c.Param("channelID"))
	var members []models.ChannelMember
	h.db.Where("channel_id = ?", cid).Preload("User").Find(&members)
	c.JSON(http.StatusOK, gin.H{"data": members})
}

func (h *Handler) AddMember(c *gin.Context) {
	cid, _ := uuid.Parse(c.Param("channelID"))
	var req struct{ UserID string `json:"user_id"` }
	c.ShouldBindJSON(&req)
	uid, _ := uuid.Parse(req.UserID)
	h.db.Create(&models.ChannelMember{ChannelID: cid, UserID: uid, Role: "member"})
	c.JSON(http.StatusOK, gin.H{"message": "member added"})
}

func (h *Handler) RemoveMember(c *gin.Context) {
	cid, _ := uuid.Parse(c.Param("channelID"))
	uid, _ := uuid.Parse(c.Param("userID"))
	h.db.Where("channel_id = ? AND user_id = ?", cid, uid).Delete(&models.ChannelMember{})
	c.JSON(http.StatusOK, gin.H{"message": "removed"})
}

func (h *Handler) UpdateMemberRole(c *gin.Context) {
	cid, _ := uuid.Parse(c.Param("channelID"))
	uid, _ := uuid.Parse(c.Param("userID"))
	var req struct{ Role string `json:"role"` }
	c.ShouldBindJSON(&req)
	h.db.Model(&models.ChannelMember{}).Where("channel_id = ? AND user_id = ?", cid, uid).Update("role", req.Role)
	c.JSON(http.StatusOK, gin.H{"message": "role updated"})
}

func (h *Handler) GetPins(c *gin.Context) {
	cid, _ := uuid.Parse(c.Param("channelID"))
	var pins []models.PinnedMessage
	h.db.Where("channel_id = ?", cid).Preload("Message").Preload("Pinner").Find(&pins)
	c.JSON(http.StatusOK, gin.H{"data": pins})
}

func (h *Handler) Archive(c *gin.Context) {
	cid, _ := uuid.Parse(c.Param("channelID"))
	h.db.Model(&models.Channel{}).Where("id = ?", cid).Update("is_archived", true)
	c.JSON(http.StatusOK, gin.H{"message": "archived"})
}

func (h *Handler) Unarchive(c *gin.Context) {
	cid, _ := uuid.Parse(c.Param("channelID"))
	now := time.Now()
	_ = now
	h.db.Model(&models.Channel{}).Where("id = ?", cid).Update("is_archived", false)
	c.JSON(http.StatusOK, gin.H{"message": "unarchived"})
}
