package middleware

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/nyuuk/nebengbeli/internal/auth"
	"github.com/nyuuk/nebengbeli/internal/model"
	"github.com/nyuuk/nebengbeli/internal/service"
)

const (
	ContextKeyUser = "currentUser"
	CookieTokenKey = "nebeng_token"
)

func AuthMiddleware(jwtMgr *auth.JWTManager, authSvc service.AuthService) gin.HandlerFunc {
	return func(c *gin.Context) {
		var tokenStr string

		// 1. Try Bearer header
		authHeader := c.GetHeader("Authorization")
		if authHeader != "" {
			parts := strings.Split(authHeader, " ")
			if len(parts) == 2 && strings.EqualFold(parts[0], "Bearer") {
				tokenStr = parts[1]
			}
		}

		// 2. Fall back to secure cookie
		if tokenStr == "" {
			cookie, err := c.Cookie(CookieTokenKey)
			if err == nil && cookie != "" {
				tokenStr = cookie
			}
		}

		if tokenStr == "" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "authentication required"})
			return
		}

		claims, err := jwtMgr.ValidateToken(tokenStr)
		if err != nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "invalid or expired token"})
			return
		}

		// Verify token_version against database to support instant token revocation
		user, err := authSvc.GetCurrentUser(c.Request.Context(), claims.UserID, claims.TokenVersion)
		if err != nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "session expired or revoked, please login again"})
			return
		}

		c.Set(ContextKeyUser, user)
		c.Next()
	}
}

func RequireRole(role model.UserRole) gin.HandlerFunc {
	return func(c *gin.Context) {
		val, exists := c.Get(ContextKeyUser)
		if !exists {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
			return
		}

		user, ok := val.(*model.User)
		if !ok || user.Role != role {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "forbidden: insufficient privileges"})
			return
		}

		c.Next()
	}
}

func GetCurrentUser(c *gin.Context) (*model.User, bool) {
	val, exists := c.Get(ContextKeyUser)
	if !exists {
		return nil, false
	}
	user, ok := val.(*model.User)
	return user, ok
}
