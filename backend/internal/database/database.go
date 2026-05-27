package database

import (
	"time"

	"github.com/datmedevil/slack/backend/internal/models"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	// "gorm.io/gorm/logger"
)

func Connect(dsn string) (*gorm.DB, error) {
	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{
		// Warn: only logs errors and genuinely slow queries (not migration checks)
		// Logger: logger.Default.LogMode(logger.Warn),
	})
	if err != nil {
		return nil, err
	}

	sqlDB, err := db.DB()
	if err != nil {
		return nil, err
	}

	sqlDB.SetMaxOpenConns(25)
	sqlDB.SetMaxIdleConns(10)
	sqlDB.SetConnMaxLifetime(5 * time.Minute)

	// Automatically create/update all tables
	err = db.AutoMigrate(
		&models.User{},
		&models.OAuthProvider{},
		&models.UserPresence{},
		&models.UserPreferences{},
		&models.Workspace{},
		&models.WorkspaceMember{},
		&models.WorkspaceSettings{},
		&models.Channel{},
		&models.ChannelMember{},
		&models.Message{},
		&models.MessageReaction{},
		&models.MessageAttachment{},
		&models.MessageMention{},
		&models.PinnedMessage{},
		&models.DMConversation{},
		&models.DMParticipant{},
		&models.DMMessage{},
		&models.DMMessageReaction{},
		&models.File{},
		&models.Notification{},
		&models.RefreshToken{},
		&models.PasswordResetToken{},
		&models.EmailVerifyToken{},
		&models.Webhook{},
		&models.Call{},
		&models.CallParticipant{},
		&models.AuditLog{},
	)
	if err != nil {
		return nil, err
	}

	return db, nil
}
