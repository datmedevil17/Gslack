package app

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type Handler struct{ db *gorm.DB }

func New(db *gorm.DB) *Handler { return &Handler{db: db} }

func stub(c *gin.Context) { c.JSON(http.StatusNotImplemented, gin.H{"error": "not implemented"}) }

func (h *Handler) List(c *gin.Context)      { stub(c) }
func (h *Handler) Install(c *gin.Context)   { stub(c) }
func (h *Handler) Uninstall(c *gin.Context) { stub(c) }
func (h *Handler) Get(c *gin.Context)       { stub(c) }
func (h *Handler) Webhook(c *gin.Context)   { stub(c) }
