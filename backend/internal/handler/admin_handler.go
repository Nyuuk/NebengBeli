package handler

import (
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/nyuuk/nebengbeli/internal/middleware"
	"github.com/nyuuk/nebengbeli/internal/model"
	"github.com/nyuuk/nebengbeli/internal/repository"
	"github.com/nyuuk/nebengbeli/internal/service"
)

const maxPaginationOffset = 1_000_000_000

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

func parsePagination(c *gin.Context, defaultLimit, maxLimit int) (limit, offset int) {
	limit, err := strconv.Atoi(c.Query("limit"))
	if err != nil || limit <= 0 {
		limit = defaultLimit
	}
	if limit > maxLimit {
		limit = maxLimit
	}
	offset, err = strconv.Atoi(c.Query("offset"))
	if err != nil || offset < 0 {
		offset = 0
	}
	if offset > maxPaginationOffset {
		offset = maxPaginationOffset
	}
	return limit, offset
}

func parseSearchQuery(c *gin.Context) string {
	search := strings.TrimSpace(c.Query("search"))
	if search == "" {
		search = strings.TrimSpace(c.Query("q"))
	}
	return search
}

func (h *AdminHandler) ListUsers(c *gin.Context) {
	limit, offset := parsePagination(c, 50, 200)
	search := parseSearchQuery(c)
	roleStr := strings.TrimSpace(c.Query("role"))

	var role *model.UserRole
	if roleStr != "" {
		switch model.UserRole(roleStr) {
		case model.RoleUser, model.RoleAdmin:
			r := model.UserRole(roleStr)
			role = &r
		default:
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid role filter, must be 'user' or 'admin'"})
			return
		}
	}

	filter := repository.AdminUserFilter{
		Search: search,
		Role:   role,
		Limit:  limit,
		Offset: offset,
	}

	users, total, err := h.userRepo.ListFiltered(c.Request.Context(), filter)
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

func (h *AdminHandler) PromoteUser(c *gin.Context) {
	admin, ok := middleware.GetCurrentUser(c)
	if !ok || admin == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}
	targetID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid user id"})
		return
	}
	user, err := h.authSvc.AdminPromoteUser(c.Request.Context(), admin.ID, targetID)
	if err != nil {
		switch {
		case errors.Is(err, repository.ErrUserNotFound):
			c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		case errors.Is(err, repository.ErrRoleConflict):
			c.JSON(http.StatusConflict, gin.H{"error": err.Error()})
		default:
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to promote user"})
		}
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "user promoted to admin successfully", "user": user})
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
	limit, offset := parsePagination(c, 50, 200)
	search := parseSearchQuery(c)
	status := strings.TrimSpace(c.Query("status"))
	linked := strings.TrimSpace(c.Query("linked"))

	if status != "" && status != "active" && status != "archived" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid status filter, must be 'active' or 'archived'"})
		return
	}
	if linked != "" && linked != "linked" && linked != "unlinked" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid linked filter, must be 'linked' or 'unlinked'"})
		return
	}

	filter := repository.AdminWalletFilter{
		Search: search,
		Status: status,
		Linked: linked,
		Limit:  limit,
		Offset: offset,
	}

	wallets, total, err := h.walletRepo.ListAllFiltered(c.Request.Context(), filter)
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

	page := filter.Offset/filter.Limit + 1

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
	search := parseSearchQuery(c)
	status := strings.TrimSpace(c.Query("status"))

	if status != "" && status != "has_outstanding" && status != "has_active_wallets" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid status filter, must be 'has_outstanding' or 'has_active_wallets'"})
		return
	}

	filter := repository.AdminCreatorFilter{
		Search: search,
		Status: status,
	}

	creators, err := h.entryRepo.GetAdminCreatorsFiltered(c.Request.Context(), filter)
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
	limit, offset := parsePagination(c, 50, 200)
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
		Search:     parseSearchQuery(c),
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
	pageStr := c.DefaultQuery("page", "1")
	offsetStr, hasOffset := c.GetQuery("offset")
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

	limit, err := strconv.Atoi(c.Query("limit"))
	if err != nil || limit <= 0 {
		limit = 50
	}
	if limit > 200 {
		limit = 200
	}

	offset := 0
	if hasOffset {
		parsedOffset, parseErr := strconv.Atoi(offsetStr)
		if parseErr == nil && parsedOffset >= 0 {
			offset = parsedOffset
		}
	} else {
		page, pageErr := strconv.Atoi(pageStr)
		if pageErr != nil || page <= 0 {
			page = 1
		}
		if page-1 > maxPaginationOffset/limit {
			offset = maxPaginationOffset
		} else {
			offset = (page - 1) * limit
		}
	}
	if offset > maxPaginationOffset {
		offset = maxPaginationOffset
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
		Search:    parseSearchQuery(c),
		WalletID:  walletID,
		CreatorID: creatorID,
		Type:      entryType,
		StartDate: startDate,
		EndDate:   endDate,
		Limit:     limit,
		Offset:    offset,
	}
}
