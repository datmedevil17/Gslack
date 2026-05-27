package webhook

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type Handler struct{ db *gorm.DB }

func New(db *gorm.DB) *Handler { return &Handler{db: db} }

func stub(c *gin.Context) { c.JSON(http.StatusNotImplemented, gin.H{"error": "not implemented"}) }

func (h *Handler) Create(c *gin.Context) { stub(c) }
func (h *Handler) List(c *gin.Context)   { stub(c) }
func (h *Handler) Get(c *gin.Context)    { stub(c) }
func (h *Handler) Update(c *gin.Context) { stub(c) }
func (h *Handler) Delete(c *gin.Context) { stub(c) }
func (h *Handler) Test(c *gin.Context)   { stub(c) }
