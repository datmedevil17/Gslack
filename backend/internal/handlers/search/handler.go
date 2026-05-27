package search

import (
	"net/http"

	"github.com/datmedevil/slack/backend/internal/models"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type Handler struct{ db *gorm.DB }

func New(db *gorm.DB) *Handler { return &Handler{db: db} }

func (h *Handler) Global(c *gin.Context) {
	q := "%" + c.Query("q") + "%"
	t := c.Query("type")
	switch t {
	case "messages":
		h.Messages(c)
	case "files":
		h.Files(c)
	case "channels":
		h.Channels(c)
	case "users":
		h.Users(c)
	default:
		var msgs []models.Message
		var channels []models.Channel
		var users []models.User
		h.db.Where("content ILIKE ? AND is_deleted = false", q).Preload("Sender").Limit(10).Find(&msgs)
		h.db.Where("name ILIKE ?", q).Limit(10).Find(&channels)
		h.db.Where("username ILIKE ? OR full_name ILIKE ? OR email ILIKE ?", q, q, q).Limit(10).Find(&users)
		c.JSON(http.StatusOK, gin.H{"data": gin.H{"messages": msgs, "channels": channels, "users": users}})
	}
}

func (h *Handler) Messages(c *gin.Context) {
	q := "%" + c.Query("q") + "%"
	var msgs []models.Message
	h.db.Where("content ILIKE ? AND is_deleted = false", q).Preload("Sender").Limit(20).Find(&msgs)
	c.JSON(http.StatusOK, gin.H{"data": msgs})
}

func (h *Handler) Files(c *gin.Context) {
	q := "%" + c.Query("q") + "%"
	var files []models.File
	h.db.Where("file_name ILIKE ?", q).Preload("Uploader").Limit(20).Find(&files)
	c.JSON(http.StatusOK, gin.H{"data": files})
}

func (h *Handler) Channels(c *gin.Context) {
	q := "%" + c.Query("q") + "%"
	var channels []models.Channel
	h.db.Where("name ILIKE ? AND is_archived = false", q).Limit(20).Find(&channels)
	c.JSON(http.StatusOK, gin.H{"data": channels})
}

func (h *Handler) Users(c *gin.Context) {
	q := "%" + c.Query("q") + "%"
	var users []models.User
	h.db.Where("username ILIKE ? OR full_name ILIKE ? OR email ILIKE ?", q, q, q).
		Select("id, username, full_name, avatar_url, email").Limit(20).Find(&users)
	c.JSON(http.StatusOK, gin.H{"data": users})
}
