package notification

import (
	"net/http"
	"time"

	"github.com/datmedevil/slack/backend/internal/middleware"
	"github.com/datmedevil/slack/backend/internal/models"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

type Handler struct{ db *gorm.DB }

func New(db *gorm.DB) *Handler { return &Handler{db: db} }

func (h *Handler) List(c *gin.Context) {
	sub, _ := c.Get(middleware.UserIDKey)
	uid, _ := uuid.Parse(sub.(string))
	var notifs []models.Notification
	h.db.Where("user_id = ?", uid).Order("created_at DESC").Limit(50).Find(&notifs)
	c.JSON(http.StatusOK, gin.H{"data": notifs})
}

func (h *Handler) MarkRead(c *gin.Context) {
	nid, _ := uuid.Parse(c.Param("notificationID"))
	sub, _ := c.Get(middleware.UserIDKey)
	uid, _ := uuid.Parse(sub.(string))
	now := time.Now()
	h.db.Model(&models.Notification{}).Where("id = ? AND user_id = ?", nid, uid).
		Updates(map[string]any{"is_read": true, "read_at": now})
	c.JSON(http.StatusOK, gin.H{"message": "marked read"})
}

func (h *Handler) MarkAllRead(c *gin.Context) {
	sub, _ := c.Get(middleware.UserIDKey)
	uid, _ := uuid.Parse(sub.(string))
	now := time.Now()
	h.db.Model(&models.Notification{}).Where("user_id = ? AND is_read = false", uid).
		Updates(map[string]any{"is_read": true, "read_at": now})
	c.JSON(http.StatusOK, gin.H{"message": "all marked read"})
}

func (h *Handler) Delete(c *gin.Context) {
	nid, _ := uuid.Parse(c.Param("notificationID"))
	sub, _ := c.Get(middleware.UserIDKey)
	uid, _ := uuid.Parse(sub.(string))
	h.db.Where("id = ? AND user_id = ?", nid, uid).Delete(&models.Notification{})
	c.JSON(http.StatusOK, gin.H{"message": "deleted"})
}

func (h *Handler) UnreadCount(c *gin.Context) {
	sub, _ := c.Get(middleware.UserIDKey)
	uid, _ := uuid.Parse(sub.(string))
	var count int64
	h.db.Model(&models.Notification{}).Where("user_id = ? AND is_read = false", uid).Count(&count)
	c.JSON(http.StatusOK, gin.H{"count": count})
}

func (h *Handler) UpdateSettings(c *gin.Context) {
	sub, _ := c.Get(middleware.UserIDKey)
	uid, _ := uuid.Parse(sub.(string))
	var req map[string]any
	c.ShouldBindJSON(&req)
	h.db.Model(&models.UserPreferences{}).Where("user_id = ?", uid).Updates(req)
	c.JSON(http.StatusOK, gin.H{"message": "settings updated"})
}
