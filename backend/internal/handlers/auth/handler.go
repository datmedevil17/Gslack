package auth

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type Handler struct{ db *gorm.DB }

func New(db *gorm.DB) *Handler { return &Handler{db: db} }

func stub(c *gin.Context) { c.JSON(http.StatusNotImplemented, gin.H{"error": "not implemented"}) }

func (h *Handler) Register(c *gin.Context)           { stub(c) }
func (h *Handler) Login(c *gin.Context)              { stub(c) }
func (h *Handler) Logout(c *gin.Context)             { stub(c) }
func (h *Handler) RefreshToken(c *gin.Context)       { stub(c) }
func (h *Handler) ForgotPassword(c *gin.Context)     { stub(c) }
func (h *Handler) ResetPassword(c *gin.Context)      { stub(c) }
func (h *Handler) VerifyEmail(c *gin.Context)        { stub(c) }
func (h *Handler) ResendVerification(c *gin.Context) { stub(c) }
func (h *Handler) OAuthGoogle(c *gin.Context)        { stub(c) }
func (h *Handler) OAuthGithub(c *gin.Context)        { stub(c) }
