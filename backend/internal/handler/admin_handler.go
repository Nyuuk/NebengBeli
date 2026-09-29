package handler

import (
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/nyuuk/nebengbeli/internal/middleware"
	"github.com/nyuuk/nebengbeli/internal/model"
	"github.com/nyuuk/nebengbeli/internal/repository"
	"github.com/nyuuk/nebengbeli/internal/service"
)

type AdminHandler struct {
	userRepo   repository.UserRepository
	walletRepo repository.WalletRepository
	entryRepo  repository.EntryRepository
	auditRepo  repository.AuditRepository
	authSvc    service.AuthService
}

func NewAdminHandler(
	userRepo repository.UserRepository,
	walletRepo repository.WalletRepository,
	entryRepo repository.EntryRepository,
	auditRepo repository.AuditRepository,
	authSvc service.AuthService,
) *AdminHandler {
	return &AdminHandler{
		userRepo:   userRepo,
		walletRepo: walletRepo,
		entryRepo:  entryRepo,
		auditRepo:  auditRepo,
		authSvc:    authSvc,
	}
}

type AdminResetPasswordRequest struct {
	TargetUsername string `json:"target_username" binding:"required"`
	NewPassword    string `json:"new_password" binding:"required,min=6"`
}

func (h *AdminHandler) ListUsers(c *gin.Context) {
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "50"))
	offset, _ := strconv.Atoi(c.DefaultQuery("offset", "0"))

	users, total, err := h.userRepo.List(c.Request.Context(), limit, offset)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"users":  users,
		"total":  total,
		"limit":  limit,
		"offset": offset,
	})
}

func (h *AdminHandler) ResetPassword(c *gin.Context) {
	admin, ok := middleware.GetCurrentUser(c)
	if !ok || admin == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	var req AdminResetPasswordRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if err := h.authSvc.AdminResetPassword(c.Request.Context(), admin.ID, req.TargetUsername, req.NewPassword); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "password reset successfully for user " + req.TargetUsername,
	})
}

func (h *AdminHandler) ListWallets(c *gin.Context) {
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "50"))
	offset, _ := strconv.Atoi(c.DefaultQuery("offset", "0"))

	wallets, total, err := h.walletRepo.ListAll(c.Request.Context(), limit, offset)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"wallets": wallets,
		"total":   total,
		"limit":   limit,
		"offset":  offset,
	})
}

func (h *AdminHandler) ListEntries(c *gin.Context) {
	filter := h.parseAdminFilter(c)

	entries, total, summary, err := h.entryRepo.ListAdminEntries(c.Request.Context(), filter)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	page := 1
	if filter.Limit > 0 && filter.Offset > 0 {
		page = (filter.Offset / filter.Limit) + 1
	}

	c.JSON(http.StatusOK, gin.H{
		"entries": entries,
		"total":   total,
		"summary": summary,
		"page":    page,
		"limit":   filter.Limit,
	})
}

func (h *AdminHandler) GetTrends(c *gin.Context) {
	trends, err := h.entryRepo.GetAdminTrends(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"trends": trends,
	})
}

func (h *AdminHandler) ListCreators(c *gin.Context) {
	creators, err := h.entryRepo.GetAdminCreators(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"creators": creators,
		"total":    len(creators),
	})
}

func (h *AdminHandler) GetPeriodSummary(c *gin.Context) {
	filter := h.parseAdminFilter(c)

	_, total, summary, err := h.entryRepo.ListAdminEntries(c.Request.Context(), filter)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"total_count": total,
		"summary":     summary,
	})
}

func (h *AdminHandler) ListAuditLogs(c *gin.Context) {
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "50"))
	offset, _ := strconv.Atoi(c.DefaultQuery("offset", "0"))
	action := c.Query("action")
	targetType := c.Query("target_type")
	if targetType == "" {
		targetType = c.Query("entity") // backwards alias
	}
	actorIDStr := c.Query("actor_id")
	if actorIDStr == "" {
		actorIDStr = c.Query("user_id") // backwards alias
	}

	var actorID *uuid.UUID
	if actorIDStr != "" {
		if uid, err := uuid.Parse(actorIDStr); err == nil {
			actorID = &uid
		}
	}

	filter := repository.AuditLogFilter{
		ActorID:    actorID,
		Action:     action,
		TargetType: targetType,
		Limit:      limit,
		Offset:     offset,
	}

	logs, total, err := h.auditRepo.List(c.Request.Context(), filter)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"audit_logs": logs,
		"total":      total,
		"limit":      limit,
		"offset":     offset,
	})
}

func (h *AdminHandler) GetStats(c *gin.Context) {
	totalUsers, err := h.userRepo.Count(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	totalWallets, activeWallets, err := h.walletRepo.Count(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	totalEntries, totalVolume, err := h.entryRepo.CountAll(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	totalAudits, _ := h.auditRepo.Count(c.Request.Context())
	breakdown, _ := h.entryRepo.GetAdminStatsBreakdown(c.Request.Context())

	c.JSON(http.StatusOK, gin.H{
		"stats": gin.H{
			"total_users":      totalUsers,
			"total_wallets":    totalWallets,
			"active_wallets":   activeWallets,
			"archived_wallets": totalWallets - activeWallets,
			"total_entries":    totalEntries,
			"total_volume":     totalVolume,
			"total_audit_logs": totalAudits,
			"breakdown":        breakdown,
		},
	})
}

func (h *AdminHandler) parseAdminFilter(c *gin.Context) repository.AdminEntryFilter {
	limitStr := c.DefaultQuery("limit", "50")
	pageStr := c.DefaultQuery("page", "1")
	offsetStr := c.Query("offset")
	typeStr := c.Query("type")
	walletIDStr := c.Query("wallet_id")
	creatorIDStr := c.Query("creator_id")
	if creatorIDStr == "" {
		creatorIDStr = c.Query("user_id")
	}
	period := c.Query("period")
	if period == "" {
		period = c.Query("range")
	}
	startStr := c.Query("start_date")
	endStr := c.Query("end_date")

	limit, err := strconv.Atoi(limitStr)
	if err != nil || limit <= 0 {
		limit = 50
	}

	var offset int
	if offsetStr != "" {
		offset, _ = strconv.Atoi(offsetStr)
	} else {
		page, _ := strconv.Atoi(pageStr)
		if page <= 0 {
			page = 1
		}
		offset = (page - 1) * limit
	}

	var entryType *model.EntryType
	if typeStr != "" {
		t := model.EntryType(typeStr)
		entryType = &t
	}

	var walletID *uuid.UUID
	if walletIDStr != "" {
		if uid, err := uuid.Parse(walletIDStr); err == nil {
			walletID = &uid
		}
	}

	var creatorID *uuid.UUID
	if creatorIDStr != "" {
		if uid, err := uuid.Parse(creatorIDStr); err == nil {
			creatorID = &uid
		}
	}

	startDate, endDate, _ := service.ParseJakartaDateRange(period, startStr, endStr, time.Now())

	return repository.AdminEntryFilter{
		WalletID:  walletID,
		CreatorID: creatorID,
		Type:      entryType,
		StartDate: startDate,
		EndDate:   endDate,
		Limit:     limit,
		Offset:    offset,
	}
}
