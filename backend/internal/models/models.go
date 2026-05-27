package models

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// ─── Base Model ───────────────────────────────────────────────────────────────

type Base struct {
	ID        uuid.UUID      `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	CreatedAt time.Time      `json:"created_at"`
	UpdatedAt time.Time      `json:"updated_at"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`
}

// ─── User ─────────────────────────────────────────────────────────────────────

type User struct {
	Base
	Email           string  `gorm:"uniqueIndex;not null" json:"email"`
	Username        string  `gorm:"uniqueIndex;not null" json:"username"`
	FullName        string  `json:"full_name"`
	PasswordHash    string  `gorm:"not null" json:"-"`
	AvatarURL       *string `json:"avatar_url"`
	Bio             *string `json:"bio"`
	Phone           *string `json:"phone"`
	IsEmailVerified bool    `gorm:"default:false" json:"is_email_verified"`
	IsActive        bool    `gorm:"default:true" json:"is_active"`
	IsBanned        bool    `gorm:"default:false" json:"is_banned"`
	LastSeenAt      *time.Time `json:"last_seen_at"`

	// Relations
	WorkspaceMembers []WorkspaceMember `gorm:"foreignKey:UserID" json:"-"`
	ChannelMembers   []ChannelMember   `gorm:"foreignKey:UserID" json:"-"`
	Messages         []Message         `gorm:"foreignKey:SenderID" json:"-"`
	OAuthProviders   []OAuthProvider   `gorm:"foreignKey:UserID" json:"-"`
	Notifications    []Notification    `gorm:"foreignKey:UserID" json:"-"`
}

// ─── OAuth Provider ───────────────────────────────────────────────────────────

type OAuthProvider struct {
	Base
	UserID         uuid.UUID `gorm:"type:uuid;not null;index" json:"user_id"`
	Provider       string    `gorm:"not null" json:"provider"` // google, github
	ProviderUserID string    `gorm:"not null" json:"provider_user_id"`
	AccessToken    string    `json:"-"`
	RefreshToken   *string   `json:"-"`
	ExpiresAt      *time.Time `json:"-"`

	User User `gorm:"foreignKey:UserID" json:"-"`
}

// ─── UserPresence ─────────────────────────────────────────────────────────────

type UserPresence struct {
	UserID      uuid.UUID `gorm:"type:uuid;primaryKey" json:"user_id"`
	Status      string    `gorm:"default:'offline'" json:"status"` // online, away, dnd, offline
	StatusEmoji *string   `json:"status_emoji"`
	StatusText  *string   `json:"status_text"`
	ExpiresAt   *time.Time `json:"expires_at"`
	UpdatedAt   time.Time  `json:"updated_at"`

	User User `gorm:"foreignKey:UserID" json:"-"`
}

// ─── UserPreferences ──────────────────────────────────────────────────────────

type UserPreferences struct {
	UserID             uuid.UUID `gorm:"type:uuid;primaryKey" json:"user_id"`
	Theme              string    `gorm:"default:'system'" json:"theme"`         // light, dark, system
	NotifyDesktop      bool      `gorm:"default:true" json:"notify_desktop"`
	NotifyMobile       bool      `gorm:"default:true" json:"notify_mobile"`
	NotifyEmail        bool      `gorm:"default:true" json:"notify_email"`
	MuteAllSounds      bool      `gorm:"default:false" json:"mute_all_sounds"`
	DisplayDensity     string    `gorm:"default:'comfortable'" json:"display_density"`
	TimezoneOffset     int       `gorm:"default:0" json:"timezone_offset"`
	UpdatedAt          time.Time `json:"updated_at"`

	User User `gorm:"foreignKey:UserID" json:"-"`
}

// ─── Workspace ────────────────────────────────────────────────────────────────

type Workspace struct {
	Base
	Name        string  `gorm:"not null" json:"name"`
	Slug        string  `gorm:"uniqueIndex;not null" json:"slug"`
	Description *string `json:"description"`
	LogoURL     *string `json:"logo_url"`
	OwnerID     uuid.UUID `gorm:"type:uuid;not null" json:"owner_id"`
	InviteCode  string    `gorm:"uniqueIndex;not null" json:"invite_code"`
	IsPublic    bool      `gorm:"default:false" json:"is_public"`
	Plan        string    `gorm:"default:'free'" json:"plan"` // free, pro, enterprise

	// Relations
	Owner    User               `gorm:"foreignKey:OwnerID" json:"owner,omitempty"`
	Members  []WorkspaceMember  `gorm:"foreignKey:WorkspaceID" json:"members,omitempty"`
	Channels []Channel          `gorm:"foreignKey:WorkspaceID" json:"channels,omitempty"`
	Settings *WorkspaceSettings `gorm:"foreignKey:WorkspaceID" json:"settings,omitempty"`
}

// ─── WorkspaceMember ──────────────────────────────────────────────────────────

type WorkspaceMember struct {
	WorkspaceID uuid.UUID  `gorm:"type:uuid;primaryKey" json:"workspace_id"`
	UserID      uuid.UUID  `gorm:"type:uuid;primaryKey" json:"user_id"`
	Role        string     `gorm:"default:'member'" json:"role"` // owner, admin, member, guest
	JoinedAt    time.Time  `json:"joined_at"`
	InvitedBy   *uuid.UUID `gorm:"type:uuid" json:"invited_by"`
	IsActive    bool       `gorm:"default:true" json:"is_active"`

	Workspace Workspace `gorm:"foreignKey:WorkspaceID" json:"-"`
	User      User      `gorm:"foreignKey:UserID" json:"user,omitempty"`
}

// ─── WorkspaceSettings ────────────────────────────────────────────────────────

type WorkspaceSettings struct {
	WorkspaceID              uuid.UUID `gorm:"type:uuid;primaryKey" json:"workspace_id"`
	AllowGuestAccess         bool      `gorm:"default:false" json:"allow_guest_access"`
	RequireEmailDomain       *string   `json:"require_email_domain"`
	DefaultChannelID         *uuid.UUID `gorm:"type:uuid" json:"default_channel_id"`
	MessageRetentionDays     int       `gorm:"default:0" json:"message_retention_days"` // 0 = forever
	AllowPublicChannels      bool      `gorm:"default:true" json:"allow_public_channels"`
	AllowDirectMessages      bool      `gorm:"default:true" json:"allow_direct_messages"`
	UpdatedAt                time.Time `json:"updated_at"`
}

// ─── Channel ──────────────────────────────────────────────────────────────────

type Channel struct {
	Base
	WorkspaceID  uuid.UUID  `gorm:"type:uuid;not null;index" json:"workspace_id"`
	Name         string     `gorm:"not null" json:"name"`
	Description  *string    `json:"description"`
	Topic        *string    `json:"topic"`
	Type         string     `gorm:"default:'public'" json:"type"` // public, private, dm, group_dm
	IsArchived   bool       `gorm:"default:false" json:"is_archived"`
	CreatedBy    uuid.UUID  `gorm:"type:uuid;not null" json:"created_by"`
	LastMessageAt *time.Time `json:"last_message_at"`

	// Relations
	Workspace Workspace       `gorm:"foreignKey:WorkspaceID" json:"-"`
	Creator   User            `gorm:"foreignKey:CreatedBy" json:"creator,omitempty"`
	Members   []ChannelMember `gorm:"foreignKey:ChannelID" json:"members,omitempty"`
	Messages  []Message       `gorm:"foreignKey:ChannelID" json:"-"`
	Pins      []PinnedMessage `gorm:"foreignKey:ChannelID" json:"-"`
}

// ─── ChannelMember ────────────────────────────────────────────────────────────

type ChannelMember struct {
	ChannelID        uuid.UUID  `gorm:"type:uuid;primaryKey" json:"channel_id"`
	UserID           uuid.UUID  `gorm:"type:uuid;primaryKey" json:"user_id"`
	Role             string     `gorm:"default:'member'" json:"role"` // admin, member
	JoinedAt         time.Time  `json:"joined_at"`
	LastReadAt       *time.Time `json:"last_read_at"`
	LastReadMsgID    *uuid.UUID `gorm:"type:uuid" json:"last_read_msg_id"`
	IsMuted          bool       `gorm:"default:false" json:"is_muted"`
	NotifyPreference string     `gorm:"default:'default'" json:"notify_preference"` // default, all, mentions, nothing

	Channel Channel `gorm:"foreignKey:ChannelID" json:"-"`
	User    User    `gorm:"foreignKey:UserID" json:"user,omitempty"`
}

// ─── Message ──────────────────────────────────────────────────────────────────

type Message struct {
	Base
	ChannelID    uuid.UUID  `gorm:"type:uuid;not null;index" json:"channel_id"`
	SenderID     uuid.UUID  `gorm:"type:uuid;not null;index" json:"sender_id"`
	ParentID     *uuid.UUID `gorm:"type:uuid;index" json:"parent_id"` // for thread replies
	Content      string     `gorm:"type:text;not null" json:"content"`
	ContentType  string     `gorm:"default:'text'" json:"content_type"` // text, system
	IsEdited     bool       `gorm:"default:false" json:"is_edited"`
	EditedAt     *time.Time `json:"edited_at"`
	IsDeleted    bool       `gorm:"default:false" json:"is_deleted"`
	ReplyCount   int        `gorm:"default:0" json:"reply_count"`
	WorkspaceID  uuid.UUID  `gorm:"type:uuid;not null;index" json:"workspace_id"`

	// Relations
	Channel     Channel          `gorm:"foreignKey:ChannelID" json:"-"`
	Sender      User             `gorm:"foreignKey:SenderID" json:"sender,omitempty"`
	Parent      *Message         `gorm:"foreignKey:ParentID" json:"parent,omitempty"`
	Replies     []Message        `gorm:"foreignKey:ParentID" json:"replies,omitempty"`
	Reactions   []MessageReaction `gorm:"foreignKey:MessageID" json:"reactions,omitempty"`
	Attachments []MessageAttachment `gorm:"foreignKey:MessageID" json:"attachments,omitempty"`
	Mentions    []MessageMention `gorm:"foreignKey:MessageID" json:"mentions,omitempty"`
}

// ─── MessageReaction ──────────────────────────────────────────────────────────

type MessageReaction struct {
	MessageID uuid.UUID `gorm:"type:uuid;primaryKey" json:"message_id"`
	UserID    uuid.UUID `gorm:"type:uuid;primaryKey" json:"user_id"`
	Emoji     string    `gorm:"primaryKey;not null" json:"emoji"`
	CreatedAt time.Time `json:"created_at"`

	Message Message `gorm:"foreignKey:MessageID" json:"-"`
	User    User    `gorm:"foreignKey:UserID" json:"user,omitempty"`
}

// ─── MessageAttachment ────────────────────────────────────────────────────────

type MessageAttachment struct {
	Base
	MessageID  uuid.UUID `gorm:"type:uuid;not null;index" json:"message_id"`
	FileID     uuid.UUID `gorm:"type:uuid;not null" json:"file_id"`

	Message Message `gorm:"foreignKey:MessageID" json:"-"`
	File    File    `gorm:"foreignKey:FileID" json:"file,omitempty"`
}

// ─── MessageMention ───────────────────────────────────────────────────────────

type MessageMention struct {
	Base
	MessageID   uuid.UUID  `gorm:"type:uuid;not null;index" json:"message_id"`
	MentionType string     `gorm:"not null" json:"mention_type"` // user, channel, everyone, here
	UserID      *uuid.UUID `gorm:"type:uuid;index" json:"user_id"`
	ChannelID   *uuid.UUID `gorm:"type:uuid" json:"channel_id"`
}

// ─── PinnedMessage ────────────────────────────────────────────────────────────

type PinnedMessage struct {
	ChannelID uuid.UUID `gorm:"type:uuid;primaryKey" json:"channel_id"`
	MessageID uuid.UUID `gorm:"type:uuid;primaryKey" json:"message_id"`
	PinnedBy  uuid.UUID `gorm:"type:uuid;not null" json:"pinned_by"`
	PinnedAt  time.Time `json:"pinned_at"`

	Channel Channel `gorm:"foreignKey:ChannelID" json:"-"`
	Message Message `gorm:"foreignKey:MessageID" json:"message,omitempty"`
	Pinner  User    `gorm:"foreignKey:PinnedBy" json:"pinner,omitempty"`
}

// ─── DirectMessage Conversation ───────────────────────────────────────────────

type DMConversation struct {
	Base
	WorkspaceID uuid.UUID `gorm:"type:uuid;not null;index" json:"workspace_id"`
	IsGroup     bool      `gorm:"default:false" json:"is_group"`
	Name        *string   `json:"name"` // for group DMs
	CreatedBy   uuid.UUID `gorm:"type:uuid;not null" json:"created_by"`

	// Relations
	Participants []DMParticipant `gorm:"foreignKey:ConversationID" json:"participants,omitempty"`
	Messages     []DMMessage     `gorm:"foreignKey:ConversationID" json:"-"`
}

// ─── DMParticipant ────────────────────────────────────────────────────────────

type DMParticipant struct {
	ConversationID uuid.UUID  `gorm:"type:uuid;primaryKey" json:"conversation_id"`
	UserID         uuid.UUID  `gorm:"type:uuid;primaryKey" json:"user_id"`
	JoinedAt       time.Time  `json:"joined_at"`
	LastReadAt     *time.Time `json:"last_read_at"`
	IsMuted        bool       `gorm:"default:false" json:"is_muted"`

	Conversation DMConversation `gorm:"foreignKey:ConversationID" json:"-"`
	User         User           `gorm:"foreignKey:UserID" json:"user,omitempty"`
}

// ─── DMMessage ────────────────────────────────────────────────────────────────

type DMMessage struct {
	Base
	ConversationID uuid.UUID  `gorm:"type:uuid;not null;index" json:"conversation_id"`
	SenderID       uuid.UUID  `gorm:"type:uuid;not null" json:"sender_id"`
	Content        string     `gorm:"type:text;not null" json:"content"`
	IsEdited       bool       `gorm:"default:false" json:"is_edited"`
	EditedAt       *time.Time `json:"edited_at"`
	IsDeleted      bool       `gorm:"default:false" json:"is_deleted"`

	Conversation DMConversation      `gorm:"foreignKey:ConversationID" json:"-"`
	Sender       User                `gorm:"foreignKey:SenderID" json:"sender,omitempty"`
	Reactions    []DMMessageReaction `gorm:"foreignKey:MessageID" json:"reactions,omitempty"`
}

// ─── DMMessageReaction ────────────────────────────────────────────────────────

type DMMessageReaction struct {
	MessageID uuid.UUID `gorm:"type:uuid;primaryKey" json:"message_id"`
	UserID    uuid.UUID `gorm:"type:uuid;primaryKey" json:"user_id"`
	Emoji     string    `gorm:"primaryKey;not null" json:"emoji"`
	CreatedAt time.Time `json:"created_at"`
}

// ─── File ─────────────────────────────────────────────────────────────────────

type File struct {
	Base
	UploaderID  uuid.UUID `gorm:"type:uuid;not null;index" json:"uploader_id"`
	WorkspaceID uuid.UUID `gorm:"type:uuid;not null;index" json:"workspace_id"`
	FileName    string    `gorm:"not null" json:"file_name"`
	FileSize    int64     `gorm:"not null" json:"file_size"` // bytes
	MimeType    string    `gorm:"not null" json:"mime_type"`
	StoragePath string    `gorm:"not null" json:"-"` // S3 key or local path
	PublicURL   string    `json:"public_url"`
	ThumbnailURL *string  `json:"thumbnail_url"`
	IsPublic    bool      `gorm:"default:false" json:"is_public"`

	Uploader  User `gorm:"foreignKey:UploaderID" json:"uploader,omitempty"`
	Workspace Workspace `gorm:"foreignKey:WorkspaceID" json:"-"`
}

// ─── Notification ─────────────────────────────────────────────────────────────

type Notification struct {
	Base
	UserID      uuid.UUID  `gorm:"type:uuid;not null;index" json:"user_id"`
	Type        string     `gorm:"not null" json:"type"` // mention, reply, dm, reaction, invite, system
	Title       string     `json:"title"`
	Body        string     `json:"body"`
	ActorID     *uuid.UUID `gorm:"type:uuid" json:"actor_id"`   // who triggered it
	ResourceID  *uuid.UUID `gorm:"type:uuid" json:"resource_id"` // messageID, channelID, etc.
	ResourceType *string   `json:"resource_type"`                // message, channel, workspace
	IsRead      bool       `gorm:"default:false" json:"is_read"`
	ReadAt      *time.Time `json:"read_at"`

	User  User  `gorm:"foreignKey:UserID" json:"-"`
	Actor *User `gorm:"foreignKey:ActorID" json:"actor,omitempty"`
}

// ─── RefreshToken ─────────────────────────────────────────────────────────────

type RefreshToken struct {
	Base
	UserID    uuid.UUID `gorm:"type:uuid;not null;index" json:"user_id"`
	TokenHash string    `gorm:"uniqueIndex;not null" json:"-"`
	ExpiresAt time.Time `json:"expires_at"`
	IsRevoked bool      `gorm:"default:false" json:"-"`
	UserAgent *string   `json:"-"`
	IPAddress *string   `json:"-"`

	User User `gorm:"foreignKey:UserID" json:"-"`
}

// ─── PasswordResetToken ───────────────────────────────────────────────────────

type PasswordResetToken struct {
	Base
	UserID    uuid.UUID `gorm:"type:uuid;not null;index" json:"user_id"`
	TokenHash string    `gorm:"uniqueIndex;not null" json:"-"`
	ExpiresAt time.Time `json:"expires_at"`
	UsedAt    *time.Time `json:"used_at"`

	User User `gorm:"foreignKey:UserID" json:"-"`
}

// ─── EmailVerifyToken ─────────────────────────────────────────────────────────

type EmailVerifyToken struct {
	Base
	UserID    uuid.UUID `gorm:"type:uuid;not null;index" json:"user_id"`
	TokenHash string    `gorm:"uniqueIndex;not null" json:"-"`
	ExpiresAt time.Time `json:"expires_at"`
	UsedAt    *time.Time `json:"used_at"`

	User User `gorm:"foreignKey:UserID" json:"-"`
}

// ─── Webhook ──────────────────────────────────────────────────────────────────

type Webhook struct {
	Base
	WorkspaceID uuid.UUID `gorm:"type:uuid;not null;index" json:"workspace_id"`
	Name        string    `gorm:"not null" json:"name"`
	URL         string    `gorm:"not null" json:"url"`
	Secret      string    `gorm:"not null" json:"-"`
	Events      string    `gorm:"type:text;not null" json:"events"` // JSON array: ["message.created", ...]
	IsActive    bool      `gorm:"default:true" json:"is_active"`
	CreatedBy   uuid.UUID `gorm:"type:uuid;not null" json:"created_by"`

	Workspace Workspace `gorm:"foreignKey:WorkspaceID" json:"-"`
	Creator   User      `gorm:"foreignKey:CreatedBy" json:"creator,omitempty"`
}

// ─── Call / Huddle ────────────────────────────────────────────────────────────

type Call struct {
	Base
	WorkspaceID uuid.UUID  `gorm:"type:uuid;not null;index" json:"workspace_id"`
	ChannelID   *uuid.UUID `gorm:"type:uuid;index" json:"channel_id"`
	InitiatorID uuid.UUID  `gorm:"type:uuid;not null" json:"initiator_id"`
	Status      string     `gorm:"default:'active'" json:"status"` // active, ended
	StartedAt   time.Time  `json:"started_at"`
	EndedAt     *time.Time `json:"ended_at"`

	Workspace    Workspace      `gorm:"foreignKey:WorkspaceID" json:"-"`
	Initiator    User           `gorm:"foreignKey:InitiatorID" json:"initiator,omitempty"`
	Participants []CallParticipant `gorm:"foreignKey:CallID" json:"participants,omitempty"`
}

// ─── CallParticipant ──────────────────────────────────────────────────────────

type CallParticipant struct {
	CallID   uuid.UUID  `gorm:"type:uuid;primaryKey" json:"call_id"`
	UserID   uuid.UUID  `gorm:"type:uuid;primaryKey" json:"user_id"`
	JoinedAt time.Time  `json:"joined_at"`
	LeftAt   *time.Time `json:"left_at"`
	IsMuted  bool       `gorm:"default:false" json:"is_muted"`
	IsVideo  bool       `gorm:"default:false" json:"is_video"`

	Call Call `gorm:"foreignKey:CallID" json:"-"`
	User User `gorm:"foreignKey:UserID" json:"user,omitempty"`
}

// ─── AuditLog ─────────────────────────────────────────────────────────────────

type AuditLog struct {
	Base
	WorkspaceID *uuid.UUID `gorm:"type:uuid;index" json:"workspace_id"`
	ActorID     uuid.UUID  `gorm:"type:uuid;not null;index" json:"actor_id"`
	Action      string     `gorm:"not null" json:"action"` // e.g. "user.banned", "channel.deleted"
	ResourceID  *string    `json:"resource_id"`
	ResourceType *string   `json:"resource_type"`
	IPAddress   *string    `json:"ip_address"`
	UserAgent   *string    `json:"user_agent"`
	Metadata    string     `gorm:"type:text" json:"metadata"` // JSON blob

	Actor User `gorm:"foreignKey:ActorID" json:"actor,omitempty"`
}
