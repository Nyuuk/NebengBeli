package config

import (
	"os"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	Port               string
	DatabaseURL        string
	JWTSecret          string
	JWTExpiry          time.Duration
	Environment        string
	CookieSecure       bool
	CookieDomain       string
	CORSAllowedOrigins []string

	RateLimitAuth int // req/min
	RateLimitAPI  int // req/min
}

func LoadConfig() *Config {
	port := getEnv("PORT", "8080")
	dbURL := os.Getenv("DATABASE_URL")
	jwtSecret := os.Getenv("JWT_SECRET")

	jwtExpiryHoursStr := getEnv("JWT_EXPIRY_HOURS", "72")
	jwtExpiryHours, err := strconv.Atoi(jwtExpiryHoursStr)
	if err != nil || jwtExpiryHours <= 0 {
		jwtExpiryHours = 72
	}

	env := getEnv("ENVIRONMENT", "development")
	cookieSecureStr := getEnv("COOKIE_SECURE", "")
	var cookieSecure bool
	if cookieSecureStr != "" {
		cookieSecure = cookieSecureStr == "true" || cookieSecureStr == "1"
	} else {
		cookieSecure = env == "production"
	}

	cookieDomain := getEnv("COOKIE_DOMAIN", "")

	corsOriginsStr := getEnv("CORS_ALLOWED_ORIGINS", "http://localhost:5173,http://localhost:3000,http://localhost:8080,http://127.0.0.1:5173")
	corsOrigins := strings.Split(corsOriginsStr, ",")
	for i := range corsOrigins {
		corsOrigins[i] = strings.TrimSpace(corsOrigins[i])
	}

	rlAuthStr := getEnv("RATE_LIMIT_AUTH", "20")
	rlAuth, err := strconv.Atoi(rlAuthStr)
	if err != nil || rlAuth <= 0 {
		rlAuth = 20
	}

	rlAPIStr := getEnv("RATE_LIMIT_API", "120")
	rlAPI, err := strconv.Atoi(rlAPIStr)
	if err != nil || rlAPI <= 0 {
		rlAPI = 120
	}

	return &Config{
		Port:               port,
		DatabaseURL:        dbURL,
		JWTSecret:          jwtSecret,
		JWTExpiry:          time.Duration(jwtExpiryHours) * time.Hour,
		Environment:        env,
		CookieSecure:       cookieSecure,
		CookieDomain:       cookieDomain,
		CORSAllowedOrigins: corsOrigins,

		RateLimitAuth: rlAuth,
		RateLimitAPI:  rlAPI,
	}
}

func getEnv(key, defaultVal string) string {
	val := os.Getenv(key)
	if val == "" {
		return defaultVal
	}
	return val
}
