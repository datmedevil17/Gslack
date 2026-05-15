package user

import (
	"net/http"

	"github.com/datmedevil/slack/backend/internal/middleware"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type Handler struct {
	db *gorm.DB
}

func New(db *gorm.DB) *Handler {
	return &Handler{db: db}
}

// Me returns the authenticated user's info from the JWT.
func (h *Handler) Me(c *gin.Context) {
	userID, _ := c.Get(middleware.UserIDKey)
	email, _ := c.Get(middleware.UserEmailKey)

	c.JSON(http.StatusOK, MeResponse{
		UserID: userID.(string),
		Email:  email.(string),
	})
}
