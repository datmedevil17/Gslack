package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/datmedevil/slack/backend/internal/config"
	"github.com/datmedevil/slack/backend/internal/database"
	aihandler "github.com/datmedevil/slack/backend/internal/handlers/ai"
	apphandler "github.com/datmedevil/slack/backend/internal/handlers/app"
	authhandler "github.com/datmedevil/slack/backend/internal/handlers/auth"
	chanhandler "github.com/datmedevil/slack/backend/internal/handlers/channel"
	dmhandler "github.com/datmedevil/slack/backend/internal/handlers/dm"
	filehandler "github.com/datmedevil/slack/backend/internal/handlers/file"
	msghandler "github.com/datmedevil/slack/backend/internal/handlers/message"
	notifhandler "github.com/datmedevil/slack/backend/internal/handlers/notification"
	presencehandler "github.com/datmedevil/slack/backend/internal/handlers/presence"
	searchhandler "github.com/datmedevil/slack/backend/internal/handlers/search"
	userhandler "github.com/datmedevil/slack/backend/internal/handlers/user"
	webhookhandler "github.com/datmedevil/slack/backend/internal/handlers/webhook"
	wshandler "github.com/datmedevil/slack/backend/internal/handlers/workspace"
	"github.com/datmedevil/slack/backend/internal/middleware"
	"github.com/datmedevil/slack/backend/internal/storage"
	ws "github.com/datmedevil/slack/backend/internal/websocket"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

func main() {
	cfg := config.Load()

	db, err := database.Connect(cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("db connect: %v", err)
	}

	store := storage.New(cfg.StorageEndpoint, cfg.StorageAccessKey, cfg.StorageSecretKey, cfg.StorageBucket, cfg.SupabaseURL)
	hub := ws.NewHub()
	go hub.Run()

	// Handlers
	authH     := authhandler.New(db)
	userH     := userhandler.New(db, store)
	workH     := wshandler.New(db, hub, store)
	chanH     := chanhandler.New(db, hub)
	msgH      := msghandler.New(db, hub)
	dmH       := dmhandler.New(db, hub)
	notifH    := notifhandler.New(db)
	fileH     := filehandler.New(db, store)
	searchH   := searchhandler.New(db)
	appH      := apphandler.New(db)
	webhookH  := webhookhandler.New(db)
	presenceH := presencehandler.New(db, hub)
	aiH       := aihandler.New(db, cfg.GeminiAPIKey, cfg.GroqAPIKey)

	if cfg.Env == "production" {
		gin.SetMode(gin.ReleaseMode)
	}

	r := gin.New()
	r.Use(gin.Logger(), gin.Recovery(), middleware.CORS())

	// Health
	r.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "ok", "version": "v1"})
	})

	// WebSocket — authenticated
	r.GET("/api/v1/ws", middleware.RequireAuth(cfg.SupabaseURL, cfg.SupabaseJWTSecret), func(c *gin.Context) {
		sub, _ := c.Get(middleware.UserIDKey)
		userID, _ := uuid.Parse(sub.(string))
		ws.ServeWS(hub, userID, c.Writer, c.Request)
	})

	v1 := r.Group("/api/v1")

	// ── Auth (public) ─────────────────────────────────────────────────────────
	auth := v1.Group("/auth")
	{
		auth.POST("/register", authH.Register)
		auth.POST("/login", authH.Login)
		auth.POST("/logout", authH.Logout)
		auth.POST("/refresh-token", authH.RefreshToken)
		auth.POST("/forgot-password", authH.ForgotPassword)
		auth.POST("/reset-password", authH.ResetPassword)
		auth.POST("/verify-email", authH.VerifyEmail)
		auth.POST("/resend-verification", authH.ResendVerification)
		auth.POST("/oauth/google", authH.OAuthGoogle)
		auth.POST("/oauth/github", authH.OAuthGithub)
	}

	// ── Protected routes ──────────────────────────────────────────────────────
	api := v1.Group("", middleware.RequireAuth(cfg.SupabaseURL, cfg.SupabaseJWTSecret))

	// Users
	users := api.Group("/users")
	{
		users.GET("/me", userH.Me)
		users.PUT("/me", userH.UpdateMe)
		users.DELETE("/me", userH.DeleteMe)
		users.PUT("/me/password", userH.UpdatePassword)
		users.POST("/me/avatar/upload", userH.UploadAvatar)
		users.PUT("/me/avatar", userH.UpdateAvatar)
		users.PUT("/me/status", userH.UpdateStatus)
		users.GET("/me/preferences", userH.GetPreferences)
		users.PUT("/me/preferences", userH.UpdatePreferences)
		users.GET("/me/notifications", userH.GetNotifications)
		users.PUT("/me/notifications", userH.UpdateNotifications)
		users.GET("/search", userH.Search)
		users.GET("/:userID", userH.GetByID)
	}

	// Workspaces
	workspaces := api.Group("/workspaces")
	{
		workspaces.POST("", workH.Create)
		workspaces.GET("", workH.List)
		workspaces.GET("/:workspaceID", workH.Get)
		workspaces.PUT("/:workspaceID", workH.Update)
		workspaces.DELETE("/:workspaceID", workH.Delete)
		workspaces.PUT("/:workspaceID/avatar", workH.UpdateAvatar)
		workspaces.GET("/:workspaceID/members", workH.ListMembers)
		workspaces.POST("/:workspaceID/members/invite", workH.InviteMember)
		workspaces.DELETE("/:workspaceID/members/:userID", workH.RemoveMember)
		workspaces.PUT("/:workspaceID/members/:userID/role", workH.UpdateMemberRole)
		workspaces.POST("/join/:inviteCode", workH.Join)
		workspaces.GET("/:workspaceID/invite-link", workH.GetInviteLink)
		workspaces.POST("/:workspaceID/invite-link/reset", workH.ResetInviteLink)
		workspaces.GET("/:workspaceID/settings", workH.GetSettings)
		workspaces.PUT("/:workspaceID/settings", workH.UpdateSettings)
		// Workspace → Channels
		workspaces.POST("/:workspaceID/channels", chanH.Create)
		workspaces.GET("/:workspaceID/channels", chanH.List)
		workspaces.GET("/:workspaceID/channels/:channelID", chanH.Get)
		workspaces.PUT("/:workspaceID/channels/:channelID", chanH.Update)
		workspaces.DELETE("/:workspaceID/channels/:channelID", chanH.Delete)
		workspaces.POST("/:workspaceID/channels/:channelID/join", chanH.Join)
		workspaces.POST("/:workspaceID/channels/:channelID/leave", chanH.Leave)
		workspaces.GET("/:workspaceID/channels/:channelID/members", chanH.ListMembers)
		workspaces.POST("/:workspaceID/channels/:channelID/members", chanH.AddMember)
		workspaces.DELETE("/:workspaceID/channels/:channelID/members/:userID", chanH.RemoveMember)
		workspaces.PUT("/:workspaceID/channels/:channelID/members/:userID/role", chanH.UpdateMemberRole)
		workspaces.GET("/:workspaceID/channels/:channelID/pins", chanH.GetPins)
		workspaces.POST("/:workspaceID/channels/:channelID/archive", chanH.Archive)
		workspaces.POST("/:workspaceID/channels/:channelID/unarchive", chanH.Unarchive)
		// Workspace → Presence
		workspaces.GET("/:workspaceID/presence", presenceH.ListWorkspace)
		// Workspace → Files
		workspaces.GET("/:workspaceID/files", fileH.ListByWorkspace)
	}

	// Messages (scoped to channel)
	channels := api.Group("/channels/:channelID/messages")
	{
		channels.GET("", msgH.List)
		channels.POST("", msgH.Send)
		channels.GET("/search", msgH.Search)
		channels.GET("/:messageID", msgH.Get)
		channels.PUT("/:messageID", msgH.Update)
		channels.DELETE("/:messageID", msgH.Delete)
		channels.POST("/:messageID/pin", msgH.Pin)
		channels.DELETE("/:messageID/pin", msgH.Unpin)
		channels.GET("/:messageID/thread", msgH.GetThread)
		channels.POST("/:messageID/thread", msgH.ReplyThread)
		channels.POST("/:messageID/reactions", msgH.AddReaction)
		channels.DELETE("/:messageID/reactions/:emoji", msgH.RemoveReaction)
		channels.POST("/:messageID/forward", msgH.Forward)
	}

	// DMs
	dm := api.Group("/dm")
	{
		dm.GET("", dmH.List)
		dm.POST("", dmH.Create)
		dm.GET("/:dmID", dmH.Get)
		dm.DELETE("/:dmID", dmH.Delete)
		dm.GET("/:dmID/messages", dmH.ListMessages)
		dm.POST("/:dmID/messages", dmH.SendMessage)
		dm.PUT("/:dmID/messages/:messageID", dmH.UpdateMessage)
		dm.DELETE("/:dmID/messages/:messageID", dmH.DeleteMessage)
		dm.POST("/:dmID/messages/:messageID/reactions", dmH.AddReaction)
		dm.DELETE("/:dmID/messages/:messageID/reactions/:emoji", dmH.RemoveReaction)
	}

	// Group DMs
	groupDM := api.Group("/group-dm")
	{
		groupDM.GET("", dmH.ListGroups)
		groupDM.POST("", dmH.CreateGroup)
		groupDM.GET("/:groupID", dmH.GetGroup)
		groupDM.PUT("/:groupID", dmH.UpdateGroup)
		groupDM.DELETE("/:groupID", dmH.DeleteGroup)
		groupDM.POST("/:groupID/members", dmH.AddGroupMember)
		groupDM.DELETE("/:groupID/members/:userID", dmH.RemoveGroupMember)
		groupDM.GET("/:groupID/messages", dmH.ListGroupMessages)
		groupDM.POST("/:groupID/messages", dmH.SendGroupMessage)
	}

	// Notifications
	notif := api.Group("/notifications")
	{
		notif.GET("", notifH.List)
		notif.PUT("/:notificationID/read", notifH.MarkRead)
		notif.PUT("/read-all", notifH.MarkAllRead)
		notif.DELETE("/:notificationID", notifH.Delete)
		notif.GET("/unread-count", notifH.UnreadCount)
		notif.PUT("/settings", notifH.UpdateSettings)
	}

	// Files
	files := api.Group("/files")
	{
		files.POST("/upload", fileH.Upload)
		files.GET("/:fileID", fileH.Get)
		files.DELETE("/:fileID", fileH.Delete)
		files.GET("/:fileID/download", fileH.Download)
	}

	// Search
	search := api.Group("/search")
	{
		search.GET("", searchH.Global)
		search.GET("/messages", searchH.Messages)
		search.GET("/files", searchH.Files)
		search.GET("/channels", searchH.Channels)
		search.GET("/users", searchH.Users)
	}

	// Apps
	apps := api.Group("/apps")
	{
		apps.GET("", appH.List)
		apps.POST("/install", appH.Install)
		apps.DELETE("/:appID/uninstall", appH.Uninstall)
		apps.GET("/:appID", appH.Get)
		apps.POST("/:appID/webhook", appH.Webhook)
	}

	// Webhooks
	webhooks := api.Group("/webhooks")
	{
		webhooks.POST("", webhookH.Create)
		webhooks.GET("", webhookH.List)
		webhooks.GET("/:webhookID", webhookH.Get)
		webhooks.PUT("/:webhookID", webhookH.Update)
		webhooks.DELETE("/:webhookID", webhookH.Delete)
		webhooks.POST("/:webhookID/test", webhookH.Test)
	}

	// Presence
	presence := api.Group("/presence")
	{
		presence.GET("/:userID", presenceH.GetUser)
		presence.PUT("/me", presenceH.UpdateMe)
	}

	// AI
	ai := api.Group("/ai")
	{
		ai.POST("/chat", aiH.Chat)
		ai.POST("/summarize/:channelID", aiH.Summarize)
		ai.POST("/reply-suggest/:messageID", aiH.SuggestReplies)
	}

	srv := &http.Server{
		Addr:         ":" + cfg.Port,
		Handler:      r,
		ReadTimeout:  120 * time.Second,
		WriteTimeout: 120 * time.Second,
		IdleTimeout:  120 * time.Second,
	}

	go func() {
		log.Printf("🚀 server listening on :%s", cfg.Port)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("server error: %v", err)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := srv.Shutdown(ctx); err != nil {
		log.Fatalf("shutdown error: %v", err)
	}
	log.Println("server shut down cleanly")
}
