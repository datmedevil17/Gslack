package user

import (
	"log"
	"net/http"
	"strings"

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

func New(db *gorm.DB, store *storage.Client) *Handler { return &Handler{db: db, storage: store} }

// ── helpers ──────────────────────────────────────────────────────────────────

func userIDFromCtx(c *gin.Context) (uuid.UUID, bool) {
	raw, exists := c.Get(middleware.UserIDKey)
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthenticated"})
		return uuid.Nil, false
	}
	str, ok := raw.(string)
	if !ok || str == "" {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "malformed user id in context"})
		return uuid.Nil, false
	}
	id, err := uuid.Parse(str)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid user id"})
		return uuid.Nil, false
	}
	return id, true
}

// ── Me ───────────────────────────────────────────────────────────────────────

// GET /api/v1/users/me
func (h *Handler) Me(c *gin.Context) {
	subRaw, _ := c.Get(middleware.UserIDKey)
	emailRaw, _ := c.Get(middleware.UserEmailKey)

	subStr, _ := subRaw.(string)
	emailStr, _ := emailRaw.(string)

	userID, err := uuid.Parse(subStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid user id"})
		return
	}

	username := deriveUsername(emailStr, userID)

	user := models.User{
		Base:     models.Base{ID: userID},
		Email:    emailStr,
		Username: username,
	}
	if err := h.db.FirstOrCreate(&user, models.User{Base: models.Base{ID: userID}}).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to sync user"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": user})
}

// ── UpdateMe ─────────────────────────────────────────────────────────────────

// PUT /api/v1/users/me
func (h *Handler) UpdateMe(c *gin.Context) {
	userID, ok := userIDFromCtx(c)
	if !ok {
		return
	}

	var body struct {
		FullName *string `json:"full_name"`
		Username *string `json:"username"`
		Bio      *string `json:"bio"`
		Phone    *string `json:"phone"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid body"})
		return
	}

	updates := map[string]any{}
	if body.FullName != nil {
		updates["full_name"] = *body.FullName
	}
	if body.Username != nil {
		u := strings.TrimPrefix(strings.TrimSpace(*body.Username), "@")
		if u == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "username cannot be empty"})
			return
		}
		updates["username"] = u
	}
	if body.Bio != nil {
		updates["bio"] = body.Bio
	}
	if body.Phone != nil {
		updates["phone"] = body.Phone
	}

	if len(updates) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "no fields to update"})
		return
	}

	// Use a model instance with the primary key set so GORM targets the right row
	if err := h.db.Model(&models.User{Base: models.Base{ID: userID}}).Updates(updates).Error; err != nil {
		log.Printf("UpdateMe error for %s: %v", userID, err)
		if strings.Contains(err.Error(), "duplicate") || strings.Contains(err.Error(), "unique") {
			c.JSON(http.StatusConflict, gin.H{"error": "username already taken"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	var user models.User
	if err := h.db.First(&user, "id = ?", userID).Error; err != nil {
		log.Printf("UpdateMe fetch error: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "update succeeded but failed to fetch updated user"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": user})
}

// ── UploadAvatar ─────────────────────────────────────────────────────────────

// POST /api/v1/users/me/avatar/upload  (multipart/form-data, field: "file")
func (h *Handler) UploadAvatar(c *gin.Context) {
	userID, ok := userIDFromCtx(c)
	if !ok {
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

	_, publicURL, err := h.storage.Upload(c.Request.Context(), f, fileHeader, "avatars/"+userID.String())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "upload failed: " + err.Error()})
		return
	}

	if err := h.db.Model(&models.User{}).Where("id = ?", userID).
		Update("avatar_url", publicURL).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update avatar"})
		return
	}

	var user models.User
	h.db.First(&user, "id = ?", userID)
	c.JSON(http.StatusOK, gin.H{"data": user})
}

// ── UpdateAvatar ─────────────────────────────────────────────────────────────

// PUT /api/v1/users/me/avatar
func (h *Handler) UpdateAvatar(c *gin.Context) {
	userID, ok := userIDFromCtx(c)
	if !ok {
		return
	}

	var body struct {
		AvatarURL string `json:"avatar_url" binding:"required"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "avatar_url required"})
		return
	}

	if err := h.db.Model(&models.User{}).Where("id = ?", userID).
		Update("avatar_url", body.AvatarURL).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update avatar"})
		return
	}

	var user models.User
	h.db.First(&user, "id = ?", userID)
	c.JSON(http.StatusOK, gin.H{"data": user})
}

// ── UpdateStatus ─────────────────────────────────────────────────────────────

// PUT /api/v1/users/me/status  →  updates UserPresence
func (h *Handler) UpdateStatus(c *gin.Context) {
	userID, ok := userIDFromCtx(c)
	if !ok {
		return
	}

	var body struct {
		Status      string  `json:"status"`       // online | away | dnd | offline
		StatusEmoji *string `json:"status_emoji"` // e.g. ":coffee:"
		StatusText  *string `json:"status_text"`  // e.g. "Grabbing coffee"
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid body"})
		return
	}

	allowed := map[string]bool{"online": true, "away": true, "dnd": true, "offline": true}
	if body.Status != "" && !allowed[body.Status] {
		c.JSON(http.StatusBadRequest, gin.H{"error": "status must be one of: online, away, dnd, offline"})
		return
	}

	presence := models.UserPresence{UserID: userID}
	h.db.FirstOrCreate(&presence, models.UserPresence{UserID: userID})

	updates := map[string]any{}
	if body.Status != "" {
		updates["status"] = body.Status
	}
	if body.StatusEmoji != nil {
		updates["status_emoji"] = body.StatusEmoji
	}
	if body.StatusText != nil {
		updates["status_text"] = body.StatusText
	}

	if err := h.db.Model(&models.UserPresence{}).Where("user_id = ?", userID).Updates(updates).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update status"})
		return
	}

	h.db.First(&presence, "user_id = ?", userID)
	c.JSON(http.StatusOK, gin.H{"data": presence})
}

// ── GetPreferences ───────────────────────────────────────────────────────────

// GET /api/v1/users/me/preferences
func (h *Handler) GetPreferences(c *gin.Context) {
	userID, ok := userIDFromCtx(c)
	if !ok {
		return
	}
	var prefs models.UserPreferences
	h.db.FirstOrCreate(&prefs, models.UserPreferences{UserID: userID})
	c.JSON(http.StatusOK, gin.H{"data": prefs})
}

// ── UpdatePreferences ────────────────────────────────────────────────────────

// PUT /api/v1/users/me/preferences
func (h *Handler) UpdatePreferences(c *gin.Context) {
	userID, ok := userIDFromCtx(c)
	if !ok {
		return
	}

	var body struct {
		Theme          *string `json:"theme"`           // light | dark | system
		NotifyDesktop  *bool   `json:"notify_desktop"`
		NotifyMobile   *bool   `json:"notify_mobile"`
		NotifyEmail    *bool   `json:"notify_email"`
		MuteAllSounds  *bool   `json:"mute_all_sounds"`
		DisplayDensity *string `json:"display_density"` // comfortable | compact
		TimezoneOffset *int    `json:"timezone_offset"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid body"})
		return
	}

	// Upsert preferences row
	prefs := models.UserPreferences{UserID: userID}
	h.db.FirstOrCreate(&prefs, models.UserPreferences{UserID: userID})

	updates := map[string]any{}
	if body.Theme != nil {
		updates["theme"] = *body.Theme
	}
	if body.NotifyDesktop != nil {
		updates["notify_desktop"] = *body.NotifyDesktop
	}
	if body.NotifyMobile != nil {
		updates["notify_mobile"] = *body.NotifyMobile
	}
	if body.NotifyEmail != nil {
		updates["notify_email"] = *body.NotifyEmail
	}
	if body.MuteAllSounds != nil {
		updates["mute_all_sounds"] = *body.MuteAllSounds
	}
	if body.DisplayDensity != nil {
		updates["display_density"] = *body.DisplayDensity
	}
	if body.TimezoneOffset != nil {
		updates["timezone_offset"] = *body.TimezoneOffset
	}

	if len(updates) > 0 {
		h.db.Model(&models.UserPreferences{}).Where("user_id = ?", userID).Updates(updates)
	}

	h.db.First(&prefs, "user_id = ?", userID)
	c.JSON(http.StatusOK, gin.H{"data": prefs})
}

// ── GetNotifications ─────────────────────────────────────────────────────────

// GET /api/v1/users/me/notifications  (delegates to the notification table)
func (h *Handler) GetNotifications(c *gin.Context) {
	userID, ok := userIDFromCtx(c)
	if !ok {
		return
	}

	var notifs []models.Notification
	h.db.Where("user_id = ?", userID).
		Order("created_at DESC").
		Limit(50).
		Find(&notifs)

	c.JSON(http.StatusOK, gin.H{"data": notifs})
}

// ── UpdateNotifications ──────────────────────────────────────────────────────

// PUT /api/v1/users/me/notifications  (shortcut to preferences notify fields)
func (h *Handler) UpdateNotifications(c *gin.Context) {
	h.UpdatePreferences(c)
}

// ── GetByID ──────────────────────────────────────────────────────────────────

// GET /api/v1/users/:userID
func (h *Handler) GetByID(c *gin.Context) {
	id, err := uuid.Parse(c.Param("userID"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid user id"})
		return
	}

	var user models.User
	if err := h.db.First(&user, "id = ?", id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": user})
}

// ── Search ───────────────────────────────────────────────────────────────────

// GET /api/v1/users/search?q=
func (h *Handler) Search(c *gin.Context) {
	q := strings.TrimSpace(c.Query("q"))
	if q == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "q is required"})
		return
	}

	pattern := "%" + strings.ToLower(q) + "%"
	var users []models.User
	h.db.Where("LOWER(username) LIKE ? OR LOWER(full_name) LIKE ? OR LOWER(email) LIKE ?",
		pattern, pattern, pattern).
		Limit(20).
		Find(&users)

	c.JSON(http.StatusOK, gin.H{"data": users})
}

// ── DeleteMe ─────────────────────────────────────────────────────────────────

// DELETE /api/v1/users/me  (soft-delete via GORM)
func (h *Handler) DeleteMe(c *gin.Context) {
	userID, ok := userIDFromCtx(c)
	if !ok {
		return
	}

	if err := h.db.Delete(&models.User{}, "id = ?", userID).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to delete account"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "account deleted"})
}

// ── UpdatePassword ───────────────────────────────────────────────────────────

// PUT /api/v1/users/me/password  (email/password accounts only — not used with OAuth)
func (h *Handler) UpdatePassword(c *gin.Context) {
	c.JSON(http.StatusNotImplemented, gin.H{"error": "password change is handled by Supabase Auth"})
}

// ── deriveUsername ───────────────────────────────────────────────────────────

func deriveUsername(email string, id uuid.UUID) string {
	local := email
	if at := strings.Index(email, "@"); at > 0 {
		local = email[:at]
	}
	local = strings.Map(func(r rune) rune {
		if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') || r == '_' || r == '.' || r == '-' {
			return r
		}
		return '_'
	}, local)
	if local == "" {
		local = "user"
	}
	suffix := strings.ReplaceAll(id.String(), "-", "")[:4]
	return local + "_" + suffix
}
