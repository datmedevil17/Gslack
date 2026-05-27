package config

import (
	"log"
	"os"

	"github.com/joho/godotenv"
)

type Config struct {
	Env               string
	Port              string
	DatabaseURL       string
	SupabaseURL       string
	SupabaseAnonKey   string
	SupabaseJWTSecret string
	// Supabase S3 Storage
	StorageEndpoint  string
	StorageAccessKey string
	StorageSecretKey string
	StorageBucket    string
	// AI
	GeminiAPIKey string
	GroqAPIKey   string
}

func Load() *Config {
	_ = godotenv.Load()

	cfg := &Config{
		Env:               getEnv("ENV", "development"),
		Port:              getEnv("PORT", "8080"),
		DatabaseURL:       mustEnv("DATABASE_URL"),
		SupabaseURL:       mustEnv("SUPABASE_URL"),
		SupabaseAnonKey:   mustEnv("SUPABASE_ANON_KEY"),
		SupabaseJWTSecret: mustEnv("SUPABASE_JWT_SECRET"),
		StorageEndpoint:   getEnv("STORAGE_ENDPOINT", "https://cplgpczqbztnivlydbxf.storage.supabase.co/storage/v1/s3"),
		StorageAccessKey:  getEnv("STORAGE_ACCESS_KEY", ""),
		StorageSecretKey:  getEnv("STORAGE_SECRET_KEY", ""),
		StorageBucket:     getEnv("STORAGE_BUCKET", "files"),
		GeminiAPIKey:      getEnv("GEMINI_API_KEY", ""),
		GroqAPIKey:        getEnv("GROQ_API_KEY", ""),
	}
	return cfg
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func mustEnv(key string) string {
	v := os.Getenv(key)
	if v == "" {
		log.Fatalf("required env var %q is not set", key)
	}
	return v
}
