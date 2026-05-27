package presence

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

func (h *Handler) GetUser(c *gin.Context) {
	uid, _ := uuid.Parse(c.Param("userID"))
	var p models.UserPresence
	h.db.FirstOrCreate(&p, models.UserPresence{UserID: uid})
	c.JSON(http.StatusOK, gin.H{"data": p})
}

func (h *Handler) UpdateMe(c *gin.Context) {
	sub, _ := c.Get(middleware.UserIDKey)
	uid, _ := uuid.Parse(sub.(string))
	var req struct {
		Status      string  `json:"status"`
		StatusEmoji *string `json:"status_emoji"`
		StatusText  *string `json:"status_text"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	now := time.Now()
	updates := map[string]any{"status": req.Status, "updated_at": now}
	if req.StatusEmoji != nil {
		updates["status_emoji"] = req.StatusEmoji
	}
	if req.StatusText != nil {
		updates["status_text"] = req.StatusText
	}
	h.db.Model(&models.UserPresence{}).Where("user_id = ?", uid).Updates(updates)
	// Also update user's last_seen_at
	h.db.Model(&models.User{}).Where("id = ?", uid).Update("last_seen_at", now)

	// Broadcast presence update via WebSocket
	h.hub.Broadcast("presence", &ws.OutboundMessage{
		Type: ws.EventPresence,
		Payload: map[string]any{
			"user_id": uid,
			"status":  req.Status,
		},
	})
	c.JSON(http.StatusOK, gin.H{"message": "presence updated"})
}

type presenceDTO struct {
	UserID      uuid.UUID  `json:"user_id"`
	Status      string     `json:"status"`
	StatusEmoji *string    `json:"status_emoji"`
	StatusText  *string    `json:"status_text"`
	UpdatedAt   time.Time  `json:"updated_at"`
	User        *userDTO   `json:"user"`
}

type userDTO struct {
	ID        uuid.UUID `json:"id"`
	Username  string    `json:"username"`
	FullName  string    `json:"full_name"`
	AvatarURL *string   `json:"avatar_url"`
}

func (h *Handler) ListWorkspace(c *gin.Context) {
	wid, _ := uuid.Parse(c.Param("workspaceID"))

	var memberIDs []uuid.UUID
	h.db.Model(&models.WorkspaceMember{}).
		Where("workspace_id = ? AND is_active = true", wid).
		Pluck("user_id", &memberIDs)

	var presences []models.UserPresence
	h.db.Where("user_id IN ?", memberIDs).Preload("User").Find(&presences)

	dtos := make([]presenceDTO, 0, len(presences))
	for _, p := range presences {
		dto := presenceDTO{
			UserID:      p.UserID,
			Status:      p.Status,
			StatusEmoji: p.StatusEmoji,
			StatusText:  p.StatusText,
			UpdatedAt:   p.UpdatedAt,
			User: &userDTO{
				ID:        p.User.ID,
				Username:  p.User.Username,
				FullName:  p.User.FullName,
				AvatarURL: p.User.AvatarURL,
			},
		}
		dtos = append(dtos, dto)
	}
	c.JSON(http.StatusOK, gin.H{"data": dtos})
}
