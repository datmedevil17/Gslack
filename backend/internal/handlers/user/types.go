package user

// MeResponse is returned by GET /api/me
type MeResponse struct {
	UserID string `json:"user_id"`
	Email  string `json:"email"`
}
