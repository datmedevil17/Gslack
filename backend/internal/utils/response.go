package utils

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

// OK sends a 200 JSON response.
func OK(c *gin.Context, data any) {
	c.JSON(http.StatusOK, gin.H{"data": data})
}

// Err sends an error JSON response with the given status code.
func Err(c *gin.Context, status int, message string) {
	c.JSON(status, gin.H{"error": message})
}
