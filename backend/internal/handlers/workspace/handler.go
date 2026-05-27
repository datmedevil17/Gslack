package workspace

import (
	"crypto/rand"
	"encoding/hex"
	"net/http"
	"strings"

	"github.com/datmedevil/slack/backend/internal/middleware"
	"github.com/datmedevil/slack/backend/internal/models"
	"github.com/datmedevil/slack/backend/internal/storage"
	ws "github.com/datmedevil/slack/backend/internal/websocket"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

type Handler struct {
	db      *gorm.DB
	hub     *ws.Hub
	storage *storage.Client
}

func New(db *gorm.DB, hub *ws.Hub, store *storage.Client) *Handler {
	return &Handler{db: db, hub: hub, storage: store}
}

func (h *Handler) Create(c *gin.Context) {
	var req struct {
		Name        string `json:"name" binding:"required,min=2,max=80"`
		Slug        string `json:"slug"`
		Description string `json:"description"`
		IsPublic    bool   `json:"is_public"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	sub, _ := c.Get(middleware.UserIDKey)
	ownerID, _ := uuid.Parse(sub.(string))
	if req.Slug == "" {
		req.Slug = slugify(req.Name)
	}
	code, _ := generateCode()
	workspace := models.Workspace{Name: req.Name, Slug: req.Slug, OwnerID: ownerID, InviteCode: code, IsPublic: req.IsPublic, Plan: "free"}
	if req.Description != "" {
		workspace.Description = &req.Description
	}
	err := h.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(&workspace).Error; err != nil {
			return err
		}
		if err := tx.Create(&models.WorkspaceMember{WorkspaceID: workspace.ID, UserID: ownerID, Role: "owner", IsActive: true}).Error; err != nil {
			return err
		}
		desc := "General discussion"
		ch := models.Channel{WorkspaceID: workspace.ID, Name: "general", Description: &desc, Type: "public", CreatedBy: ownerID}
		if err := tx.Create(&ch).Error; err != nil {
			return err
		}
		return tx.Create(&models.ChannelMember{ChannelID: ch.ID, UserID: ownerID, Role: "admin"}).Error
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create workspace"})
		return
	}
	c.JSON(http.StatusCreated, gin.H{"data": workspace})
}

func (h *Handler) List(c *gin.Context) {
	sub, _ := c.Get(middleware.UserIDKey)
	userID, _ := uuid.Parse(sub.(string))
	var workspaces []models.Workspace
	h.db.Joins("JOIN workspace_members ON workspace_members.workspace_id = workspaces.id").
		Where("workspace_members.user_id = ? AND workspace_members.is_active = true", userID).
		Find(&workspaces)
	c.JSON(http.StatusOK, gin.H{"data": workspaces})
}

func (h *Handler) Get(c *gin.Context) {
	id, err := uuid.Parse(c.Param("workspaceID"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	var w models.Workspace
	if err := h.db.Preload("Owner").First(&w, "id = ?", id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": w})
}

func (h *Handler) Update(c *gin.Context) {
	id, _ := uuid.Parse(c.Param("workspaceID"))
	var req map[string]any
	c.ShouldBindJSON(&req)
	h.db.Model(&models.Workspace{}).Where("id = ?", id).Updates(req)
	var w models.Workspace
	h.db.First(&w, "id = ?", id)
	c.JSON(http.StatusOK, gin.H{"data": w})
}

func (h *Handler) Delete(c *gin.Context) {
	id, _ := uuid.Parse(c.Param("workspaceID"))
	sub, _ := c.Get(middleware.UserIDKey)
	ownerID, _ := uuid.Parse(sub.(string))
	res := h.db.Where("id = ? AND owner_id = ?", id, ownerID).Delete(&models.Workspace{})
	if res.RowsAffected == 0 {
		c.JSON(http.StatusForbidden, gin.H{"error": "not authorized or not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "deleted"})
}

// PUT /api/v1/workspaces/:workspaceID/avatar  (multipart, field: "file")
func (h *Handler) UpdateAvatar(c *gin.Context) {
	id, _ := uuid.Parse(c.Param("workspaceID"))
	sub, _ := c.Get(middleware.UserIDKey)
	userID, _ := uuid.Parse(sub.(string))

	var member models.WorkspaceMember
	if err := h.db.Where("workspace_id = ? AND user_id = ? AND role IN ('owner','admin') AND is_active = true", id, userID).
		First(&member).Error; err != nil {
		c.JSON(http.StatusForbidden, gin.H{"error": "not authorized"})
		return
	}

	fileHeader, err := c.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "file is required"})
		return
	}
	f, err := fileHeader.Open()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to open file"})
		return
	}
	defer f.Close()

	_, publicURL, err := h.storage.Upload(c.Request.Context(), f, fileHeader, "workspace-logos/"+id.String())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "upload failed: " + err.Error()})
		return
	}

	if err := h.db.Model(&models.Workspace{}).Where("id = ?", id).Update("logo_url", publicURL).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update avatar"})
		return
	}

	var w models.Workspace
	h.db.Preload("Owner").First(&w, "id = ?", id)
	c.JSON(http.StatusOK, gin.H{"data": w})
}

func (h *Handler) ListMembers(c *gin.Context) {
	id, _ := uuid.Parse(c.Param("workspaceID"))
	var members []models.WorkspaceMember
	h.db.Where("workspace_id = ? AND is_active = true", id).Preload("User").Find(&members)
	c.JSON(http.StatusOK, gin.H{"data": members})
}

func (h *Handler) InviteMember(c *gin.Context) {
	c.JSON(http.StatusNotImplemented, gin.H{"error": "share the invite_code so users can join via /workspaces/join/:inviteCode"})
}

func (h *Handler) RemoveMember(c *gin.Context) {
	wid, _ := uuid.Parse(c.Param("workspaceID"))
	uid, _ := uuid.Parse(c.Param("userID"))
	h.db.Model(&models.WorkspaceMember{}).Where("workspace_id = ? AND user_id = ?", wid, uid).Update("is_active", false)
	c.JSON(http.StatusOK, gin.H{"message": "removed"})
}

func (h *Handler) UpdateMemberRole(c *gin.Context) {
	wid, _ := uuid.Parse(c.Param("workspaceID"))
	uid, _ := uuid.Parse(c.Param("userID"))
	var req struct{ Role string `json:"role"` }
	c.ShouldBindJSON(&req)
	h.db.Model(&models.WorkspaceMember{}).Where("workspace_id = ? AND user_id = ?", wid, uid).Update("role", req.Role)
	c.JSON(http.StatusOK, gin.H{"message": "role updated"})
}

func (h *Handler) Join(c *gin.Context) {
	code := c.Param("inviteCode")
	sub, _ := c.Get(middleware.UserIDKey)
	userID, _ := uuid.Parse(sub.(string))
	var w models.Workspace
	if err := h.db.First(&w, "invite_code = ?", code).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "invalid invite code"})
		return
	}
	var existing models.WorkspaceMember
	if err := h.db.Where("workspace_id = ? AND user_id = ?", w.ID, userID).First(&existing).Error; err == nil {
		h.db.Model(&existing).Update("is_active", true)
		c.JSON(http.StatusOK, gin.H{"data": w})
		return
	}
	h.db.Create(&models.WorkspaceMember{WorkspaceID: w.ID, UserID: userID, Role: "member", IsActive: true})
	c.JSON(http.StatusOK, gin.H{"data": w})
}

func (h *Handler) GetInviteLink(c *gin.Context) {
	id, _ := uuid.Parse(c.Param("workspaceID"))
	var w models.Workspace
	h.db.First(&w, "id = ?", id)
	c.JSON(http.StatusOK, gin.H{"invite_code": w.InviteCode})
}

func (h *Handler) ResetInviteLink(c *gin.Context) {
	id, _ := uuid.Parse(c.Param("workspaceID"))
	code, _ := generateCode()
	h.db.Model(&models.Workspace{}).Where("id = ?", id).Update("invite_code", code)
	c.JSON(http.StatusOK, gin.H{"invite_code": code})
}

func (h *Handler) GetSettings(c *gin.Context) {
	id, _ := uuid.Parse(c.Param("workspaceID"))
	var s models.WorkspaceSettings
	h.db.FirstOrCreate(&s, models.WorkspaceSettings{WorkspaceID: id})
	c.JSON(http.StatusOK, gin.H{"data": s})
}

func (h *Handler) UpdateSettings(c *gin.Context) {
	id, _ := uuid.Parse(c.Param("workspaceID"))
	var req map[string]any
	c.ShouldBindJSON(&req)
	h.db.Model(&models.WorkspaceSettings{}).Where("workspace_id = ?", id).Updates(req)
	var s models.WorkspaceSettings
	h.db.First(&s, "workspace_id = ?", id)
	c.JSON(http.StatusOK, gin.H{"data": s})
}

func slugify(s string) string {
	return strings.ToLower(strings.ReplaceAll(strings.TrimSpace(s), " ", "-"))
}

func generateCode() (string, error) {
	b := make([]byte, 8)
	_, err := rand.Read(b)
	return hex.EncodeToString(b), err
}
