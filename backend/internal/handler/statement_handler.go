package handler

import (
	"fmt"
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

type StatementHandler struct {
	stmtSvc service.StatementService
}

func NewStatementHandler(stmtSvc service.StatementService) *StatementHandler {
	return &StatementHandler{
		stmtSvc: stmtSvc,
	}
}

func (h *StatementHandler) GetStatement(c *gin.Context) {
	user, ok := middleware.GetCurrentUser(c)
	if !ok || user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	walletIDStr := c.Param("id")
	walletID, err := uuid.Parse(walletIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid wallet id"})
		return
	}

	filter := h.parseFilter(c)
	stmt, err := h.stmtSvc.GetStatement(c.Request.Context(), walletID, user.ID, user.Role, filter)
	if err != nil {
		if err == service.ErrWalletPermissionDenied {
			c.JSON(http.StatusForbidden, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, stmt)
}

func (h *StatementHandler) ExportCSV(c *gin.Context) {
	user, ok := middleware.GetCurrentUser(c)
	if !ok || user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	walletIDStr := c.Param("id")
	walletID, err := uuid.Parse(walletIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid wallet id"})
		return
	}

	filter := h.parseFilter(c)
	csvData, err := h.stmtSvc.ExportCSV(c.Request.Context(), walletID, user.ID, user.Role, filter)
	if err != nil {
		if err == service.ErrWalletPermissionDenied {
			c.JSON(http.StatusForbidden, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	filename := fmt.Sprintf("nebengbeli-statement-%s-%s.csv", walletIDStr[:8], time.Now().In(service.JakartaLocation).Format("20060102-150405"))
	c.Header("Content-Disposition", fmt.Sprintf("attachment; filename=%s", filename))
	c.Data(http.StatusOK, "text/csv", csvData)
}

func (h *StatementHandler) parseFilter(c *gin.Context) repository.EntryFilter {
	limitStr := c.DefaultQuery("limit", "50")
	pageStr := c.DefaultQuery("page", "1")
	typeStr := c.Query("type")
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
	page, err := strconv.Atoi(pageStr)
	if err != nil || page <= 0 {
		page = 1
	}
	offset := (page - 1) * limit

	var entryType *model.EntryType
	if typeStr != "" {
		t := model.EntryType(typeStr)
		entryType = &t
	}

	startDate, endDate, _ := service.ParseJakartaDateRange(period, startStr, endStr, time.Now())

	return repository.EntryFilter{
		Type:      entryType,
		StartDate: startDate,
		EndDate:   endDate,
		Limit:     limit,
		Offset:    offset,
	}
}
