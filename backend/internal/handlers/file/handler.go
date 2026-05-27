package file

import (
	"net/http"
	"path/filepath"

	"github.com/datmedevil/slack/backend/internal/middleware"
	"github.com/datmedevil/slack/backend/internal/models"
	"github.com/datmedevil/slack/backend/internal/storage"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

type Handler struct {
	db      *gorm.DB
	storage *storage.Client
}

func New(db *gorm.DB, s *storage.Client) *Handler { return &Handler{db: db, storage: s} }

func (h *Handler) Upload(c *gin.Context) {
	sub, _ := c.Get(middleware.UserIDKey)
	uploaderID, _ := uuid.Parse(sub.(string))
	wid, _ := uuid.Parse(c.Query("workspace_id"))

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

	folder := "workspace/" + wid.String()
	key, publicURL, err := h.storage.Upload(c.Request.Context(), f, fileHeader, folder)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "upload failed: " + err.Error()})
		return
	}

	record := models.File{
		UploaderID:  uploaderID,
		WorkspaceID: wid,
		FileName:    fileHeader.Filename,
		FileSize:    fileHeader.Size,
		MimeType:    fileHeader.Header.Get("Content-Type"),
		StoragePath: key,
		PublicURL:   publicURL,
	}
	if record.MimeType == "" {
		record.MimeType = mimeFromExt(filepath.Ext(fileHeader.Filename))
	}
	if err := h.db.Create(&record).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save file record"})
		return
	}
	c.JSON(http.StatusCreated, gin.H{"data": record})
}

func (h *Handler) Get(c *gin.Context) {
	fid, _ := uuid.Parse(c.Param("fileID"))
	var f models.File
	if err := h.db.Preload("Uploader").First(&f, "id = ?", fid).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": f})
}

func (h *Handler) Delete(c *gin.Context) {
	fid, _ := uuid.Parse(c.Param("fileID"))
	sub, _ := c.Get(middleware.UserIDKey)
	uid, _ := uuid.Parse(sub.(string))
	var f models.File
	if err := h.db.First(&f, "id = ? AND uploader_id = ?", fid, uid).Error; err != nil {
		c.JSON(http.StatusForbidden, gin.H{"error": "not authorized"})
		return
	}
	h.storage.Delete(c.Request.Context(), f.StoragePath)
	h.db.Delete(&f)
	c.JSON(http.StatusOK, gin.H{"message": "deleted"})
}

func (h *Handler) Download(c *gin.Context) {
	fid, _ := uuid.Parse(c.Param("fileID"))
	var f models.File
	if err := h.db.First(&f, "id = ?", fid).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	c.Redirect(http.StatusTemporaryRedirect, f.PublicURL)
}

func (h *Handler) ListByWorkspace(c *gin.Context) {
	wid, _ := uuid.Parse(c.Param("workspaceID"))
	var files []models.File
	h.db.Where("workspace_id = ?", wid).Preload("Uploader").Order("created_at DESC").Limit(50).Find(&files)
	c.JSON(http.StatusOK, gin.H{"data": files})
}

func mimeFromExt(ext string) string {
	m := map[string]string{
		".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
		".gif": "image/gif", ".pdf": "application/pdf", ".mp4": "video/mp4",
		".mp3": "audio/mpeg", ".txt": "text/plain", ".zip": "application/zip",
	}
	if v, ok := m[ext]; ok {
		return v
	}
	return "application/octet-stream"
}
