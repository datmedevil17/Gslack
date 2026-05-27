package middleware

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"log"
	"math/big"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
)

const UserIDKey = "userID"
const UserEmailKey = "userEmail"

type jwksResponse struct {
	Keys []struct {
		Kty string `json:"kty"`
		Crv string `json:"crv"`
		X   string `json:"x"`
		Y   string `json:"y"`
		Kid string `json:"kid"`
		Alg string `json:"alg"`
	} `json:"keys"`
}

func fetchECPublicKey(supabaseURL string) (*ecdsa.PublicKey, error) {
	jwksURL := strings.TrimRight(supabaseURL, "/") + "/auth/v1/.well-known/jwks.json"

	resp, err := http.Get(jwksURL) //nolint:noctx
	if err != nil {
		return nil, fmt.Errorf("fetch jwks: %w", err)
	}
	defer resp.Body.Close()

	var jwks jwksResponse
	if err := json.NewDecoder(resp.Body).Decode(&jwks); err != nil {
		return nil, fmt.Errorf("decode jwks: %w", err)
	}

	for _, k := range jwks.Keys {
		if k.Kty != "EC" || k.Crv != "P-256" {
			continue
		}
		xBytes, err := base64.RawURLEncoding.DecodeString(k.X)
		if err != nil {
			return nil, fmt.Errorf("decode jwk x: %w", err)
		}
		yBytes, err := base64.RawURLEncoding.DecodeString(k.Y)
		if err != nil {
			return nil, fmt.Errorf("decode jwk y: %w", err)
		}
		pub := &ecdsa.PublicKey{
			Curve: elliptic.P256(),
			X:     new(big.Int).SetBytes(xBytes),
			Y:     new(big.Int).SetBytes(yBytes),
		}
		return pub, nil
	}

	return nil, fmt.Errorf("no EC P-256 key found in JWKS")
}

// RequireAuth validates Supabase-issued JWTs. Supabase newer projects use ES256
// (ECDSA P-256); the public key is fetched once from the JWKS endpoint at startup.
// Falls back to HS256 with the raw JWT secret for legacy projects.
func RequireAuth(supabaseURL, jwtSecret string) gin.HandlerFunc {
	hmacKey := []byte(jwtSecret)

	var ecKey *ecdsa.PublicKey
	if supabaseURL != "" {
		k, err := fetchECPublicKey(supabaseURL)
		if err != nil {
			log.Printf("JWKS fetch failed (%v) — falling back to HMAC-only validation", err)
		} else {
			ecKey = k
			log.Println("JWKS: loaded EC P-256 public key from Supabase")
		}
	}

	parser := jwt.NewParser(
		jwt.WithLeeway(30*time.Second),
		jwt.WithValidMethods([]string{"ES256", "HS256", "HS384", "HS512"}),
	)

	keyFunc := func(t *jwt.Token) (any, error) {
		switch t.Method.(type) {
		case *jwt.SigningMethodECDSA:
			if ecKey == nil {
				return nil, fmt.Errorf("ES256 token received but no EC public key available")
			}
			return ecKey, nil
		case *jwt.SigningMethodHMAC:
			return hmacKey, nil
		default:
			return nil, fmt.Errorf("unexpected signing method: %v", t.Header["alg"])
		}
	}

	return func(c *gin.Context) {
		// WebSocket upgrades cannot send custom headers, so also accept ?token= query param.
		var tokenStr string
		if auth := c.GetHeader("Authorization"); strings.HasPrefix(auth, "Bearer ") {
			tokenStr = strings.TrimPrefix(auth, "Bearer ")
		} else if q := c.Query("token"); q != "" {
			tokenStr = q
		} else {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "missing authorization"})
			return
		}

		token, err := parser.Parse(tokenStr, keyFunc)
		if err != nil || !token.Valid {
			reason := "invalid or expired token"
			if err != nil {
				reason = err.Error()
			}
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": reason})
			return
		}

		claims, ok := token.Claims.(jwt.MapClaims)
		if !ok {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "invalid token claims"})
			return
		}

		sub, _ := claims["sub"].(string)
		email, _ := claims["email"].(string)

		if sub == "" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "token missing sub claim"})
			return
		}

		c.Set(UserIDKey, sub)
		c.Set(UserEmailKey, email)
		c.Next()
	}
}
