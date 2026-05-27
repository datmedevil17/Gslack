package websocket

import (
	"encoding/json"
	"log"
	"sync"
)

// Hub maintains all active clients and routes messages to rooms.
type Hub struct {
	clients    map[*Client]bool
	rooms      map[string]map[*Client]bool
	register   chan *Client
	unregister chan *Client
	broadcast  chan *BroadcastEnvelope
	mu         sync.RWMutex
}

type BroadcastEnvelope struct {
	Room    string
	Message []byte
}

func NewHub() *Hub {
	return &Hub{
		clients:    make(map[*Client]bool),
		rooms:      make(map[string]map[*Client]bool),
		register:   make(chan *Client),
		unregister: make(chan *Client),
		broadcast:  make(chan *BroadcastEnvelope, 512),
	}
}

// Run starts the hub event loop — call this in a goroutine.
func (h *Hub) Run() {
	for {
		select {
		case c := <-h.register:
			h.mu.Lock()
			h.clients[c] = true
			h.mu.Unlock()

		case c := <-h.unregister:
			h.mu.Lock()
			if _, ok := h.clients[c]; ok {
				delete(h.clients, c)
				close(c.send)
				for roomID := range c.rooms {
					if room, ok := h.rooms[roomID]; ok {
						delete(room, c)
					}
				}
			}
			h.mu.Unlock()

		case env := <-h.broadcast:
			h.mu.RLock()
			room := h.rooms[env.Room]
			h.mu.RUnlock()
			for c := range room {
				select {
				case c.send <- env.Message:
				default:
					h.mu.Lock()
					close(c.send)
					delete(h.clients, c)
					delete(room, c)
					h.mu.Unlock()
				}
			}
		}
	}
}

func (h *Hub) JoinRoom(c *Client, roomID string) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if _, ok := h.rooms[roomID]; !ok {
		h.rooms[roomID] = make(map[*Client]bool)
	}
	h.rooms[roomID][c] = true
	c.rooms[roomID] = true
}

func (h *Hub) LeaveRoom(c *Client, roomID string) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if room, ok := h.rooms[roomID]; ok {
		delete(room, c)
	}
	delete(c.rooms, roomID)
}

// Broadcast sends a typed event to all clients in a room.
func (h *Hub) Broadcast(roomID string, msg *OutboundMessage) {
	data, err := json.Marshal(msg)
	if err != nil {
		log.Printf("ws hub: marshal error: %v", err)
		return
	}
	h.broadcast <- &BroadcastEnvelope{Room: roomID, Message: data}
}
