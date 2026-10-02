package handler

import (
	"errors"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/nyuuk/nebengbeli/internal/config"
	"github.com/nyuuk/nebengbeli/internal/middleware"
	"github.com/nyuuk/nebengbeli/internal/service"
)

type AuthHandler struct {
	authSvc service.AuthService
	cfg     *config.Config
}

func NewAuthHandler(authSvc service.AuthService, cfg *config.Config) *AuthHandler {
	return &AuthHandler{
		authSvc: authSvc,
		cfg:     cfg,
	}
}

type AuthRequest struct {
	Username string `json:"username" binding:"required,min=3,max=64"`
	Password string `json:"password" binding:"required,min=6"`
}

type ChangePasswordRequest struct {
	CurrentPassword string `json:"current_password" binding:"required,min=1"`
	NewPassword     string `json:"new_password" binding:"required,min=6"`
}

type ResetPasswordRequest struct {
	NewPassword string `json:"new_password" binding:"required,min=6"`
}

func (h *AuthHandler) Register(c *gin.Context) {
	var req AuthRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	user, token, expiresAt, err := h.authSvc.Register(c.Request.Context(), req.Username, req.Password)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	h.setAuthCookie(c, token)
	c.JSON(http.StatusCreated, gin.H{
		"user":       user,
		"expires_at": expiresAt.Format(time.RFC3339),
	})
}

func (h *AuthHandler) Login(c *gin.Context) {
	var req AuthRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	user, token, expiresAt, err := h.authSvc.Login(c.Request.Context(), req.Username, req.Password)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": err.Error()})
		return
	}

	h.setAuthCookie(c, token)
	c.JSON(http.StatusOK, gin.H{
		"user":       user,
		"expires_at": expiresAt.Format(time.RFC3339),
	})
}

func (h *AuthHandler) Renew(c *gin.Context) {
	user, ok := middleware.GetCurrentUser(c)
	if !ok || user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}

	renewedUser, token, expiresAt, err := h.authSvc.RenewToken(c.Request.Context(), user.ID, user.TokenVersion)
	if err != nil {
		h.clearAuthCookie(c)
		c.JSON(http.StatusUnauthorized, gin.H{"error": err.Error()})
		return
	}

	h.setAuthCookie(c, token)
	c.JSON(http.StatusOK, gin.H{
		"user":       renewedUser,
		"expires_at": expiresAt.Format(time.RFC3339),
	})
}

func (h *AuthHandler) Logout(c *gin.Context) {
	user, ok := middleware.GetCurrentUser(c)
	if ok && user != nil {
		_ = h.authSvc.Logout(c.Request.Context(), user.ID)
	}

	h.clearAuthCookie(c)
	c.JSON(http.StatusOK, gin.H{"message": "logged out successfully"})
}

func (h *AuthHandler) Me(c *gin.Context) {
	user, ok := middleware.GetCurrentUser(c)
	if !ok || user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"user": user.ToResponse(),
	})
}

func (h *AuthHandler) ChangePassword(c *gin.Context) {
	user, ok := middleware.GetCurrentUser(c)
	if !ok || user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}

	var req ChangePasswordRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if err := h.authSvc.ChangePassword(c.Request.Context(), user.ID, req.CurrentPassword, req.NewPassword); err != nil {
		if errors.Is(err, service.ErrInvalidCredentials) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "kata sandi saat ini salah"})
			return
		}
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	h.clearAuthCookie(c)
	c.JSON(http.StatusOK, gin.H{"message": "kata sandi berhasil diubah, silakan login kembali dengan kata sandi baru"})
}

func (h *AuthHandler) ResetPassword(c *gin.Context) {
	user, ok := middleware.GetCurrentUser(c)
	if !ok || user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}

	var req ResetPasswordRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if err := h.authSvc.ResetPassword(c.Request.Context(), user.ID, req.NewPassword); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	h.clearAuthCookie(c)
	c.JSON(http.StatusOK, gin.H{"message": "password reset successfully, please login with your new password"})
}

func (h *AuthHandler) setAuthCookie(c *gin.Context, token string) {
	maxAge := int(h.cfg.JWTExpiry.Seconds())
	c.SetSameSite(http.SameSiteLaxMode)
	c.SetCookie(
		middleware.CookieTokenKey,
		token,
		maxAge,
		"/",
		h.cfg.CookieDomain,
		h.cfg.CookieSecure,
		true, // HttpOnly
	)
}

func (h *AuthHandler) clearAuthCookie(c *gin.Context) {
	c.SetSameSite(http.SameSiteLaxMode)
	c.SetCookie(
		middleware.CookieTokenKey,
		"",
		-1,
		"/",
		h.cfg.CookieDomain,
		h.cfg.CookieSecure,
		true,
	)
}
