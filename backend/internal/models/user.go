package models

import (
	"time"

	"gorm.io/gorm"
)

// User mirrors the auth.users table created by Supabase.
// Extend with app-specific fields as needed.
type User struct {
	ID        string         `gorm:"type:uuid;primaryKey" json:"id"`
	Email     string         `gorm:"uniqueIndex;not null" json:"email"`
	CreatedAt time.Time      `json:"created_at"`
	UpdatedAt time.Time      `json:"updated_at"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`
}
