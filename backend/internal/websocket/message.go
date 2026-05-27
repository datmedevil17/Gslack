package websocket

import "encoding/json"

// OutboundMessage is sent from server → client.
type OutboundMessage struct {
	Type    string `json:"type"`
	Room    string `json:"room,omitempty"`
	Payload any    `json:"payload"`
}

// InboundMessage is received from client → server.
type InboundMessage struct {
	Type    string          `json:"type"`
	Room    string          `json:"room"`
	Payload json.RawMessage `json:"payload,omitempty"`
}

// Event types — server → client
const (
	EventMessageNew     = "message.new"
	EventMessageUpdate  = "message.update"
	EventMessageDelete  = "message.delete"
	EventReactionAdd    = "reaction.add"
	EventReactionRemove = "reaction.remove"
	EventTyping         = "typing"
	EventPresence       = "presence"
	EventChannelUpdate  = "channel.update"
)

// Event types — client → server
const (
	CmdJoinRoom  = "join_room"
	CmdLeaveRoom = "leave_room"
	CmdTyping    = "typing"
)
