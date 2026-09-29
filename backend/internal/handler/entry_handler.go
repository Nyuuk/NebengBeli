package handler

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/nyuuk/nebengbeli/internal/middleware"
	"github.com/nyuuk/nebengbeli/internal/model"
	"github.com/nyuuk/nebengbeli/internal/service"
)

type EntryHandler struct {
	entrySvc service.EntryService
}

func NewEntryHandler(entrySvc service.EntryService) *EntryHandler {
	return &EntryHandler{
		entrySvc: entrySvc,
	}
}

type CreateEntryRequestBody struct {
	ClientID         *uuid.UUID      `json:"client_id,omitempty"`
	Type             model.EntryType `json:"type" binding:"required"`
	Amount           int64           `json:"amount" binding:"required"`
	ItemName         string          `json:"item_name"`
	Description      string          `json:"description,omitempty"` // Fallback alias
	Note             string          `json:"note"`
	CorrectsEntryID  *uuid.UUID      `json:"corrects_entry_id,omitempty"`
	CorrectionReason string          `json:"correction_reason,omitempty"`
	OccurredAt       *time.Time      `json:"occurred_at,omitempty"`
}

type MoveEntryRequestBody struct {
	SourceWalletID uuid.UUID `json:"source_wallet_id" binding:"required"`
	TargetWalletID uuid.UUID `json:"target_wallet_id" binding:"required"`
	EntryID        uuid.UUID `json:"entry_id" binding:"required"`
	Notes          string    `json:"notes"`
}

func (h *EntryHandler) Create(c *gin.Context) {
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

	var reqBody CreateEntryRequestBody
	if err := c.ShouldBindJSON(&reqBody); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	itemName := reqBody.ItemName
	if itemName == "" {
		itemName = reqBody.Description
	}

	// Read client_id from header if not in body
	var clientID *uuid.UUID = reqBody.ClientID
	if clientID == nil {
		headerKey := c.GetHeader("Client-ID")
		if headerKey == "" {
			headerKey = c.GetHeader("Idempotency-Key")
		}
		if headerKey != "" {
			if parsed, parseErr := uuid.Parse(headerKey); parseErr == nil {
				clientID = &parsed
			}
		}
	}

	createReq := service.CreateEntryRequest{
		ClientID:         clientID,
		WalletID:         walletID,
		Type:             reqBody.Type,
		Amount:           reqBody.Amount,
		ItemName:         itemName,
		Note:             reqBody.Note,
		CorrectsEntryID:  reqBody.CorrectsEntryID,
		CorrectionReason: reqBody.CorrectionReason,
		OccurredAt:       reqBody.OccurredAt,
	}

	entry, isDuplicate, err := h.entrySvc.CreateEntry(c.Request.Context(), user.ID, user.Role, createReq)
	if err != nil {
		if err == service.ErrWalletPermissionDenied {
			c.JSON(http.StatusForbidden, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	status := http.StatusCreated
	if isDuplicate {
		status = http.StatusOK
	}

	c.JSON(status, gin.H{
		"entry":        entry,
		"is_duplicate": isDuplicate,
	})
}

func (h *EntryHandler) Move(c *gin.Context) {
	user, ok := middleware.GetCurrentUser(c)
	if !ok || user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	var reqBody MoveEntryRequestBody
	if err := c.ShouldBindJSON(&reqBody); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	moveReq := service.MoveEntryRequest{
		SourceWalletID: reqBody.SourceWalletID,
		TargetWalletID: reqBody.TargetWalletID,
		EntryID:        reqBody.EntryID,
		Notes:          reqBody.Notes,
	}

	corrEntry, newEntry, err := h.entrySvc.MoveEntry(c.Request.Context(), user.ID, user.Role, moveReq)
	if err != nil {
		if err == service.ErrWalletPermissionDenied {
			c.JSON(http.StatusForbidden, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message":          "entry moved successfully",
		"correction_entry": corrEntry,
		"new_entry":        newEntry,
	})
}

func (h *EntryHandler) Get(c *gin.Context) {
	user, ok := middleware.GetCurrentUser(c)
	if !ok || user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	entryIDStr := c.Param("id")
	entryID, err := uuid.Parse(entryIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid entry id"})
		return
	}

	entry, err := h.entrySvc.GetEntry(c.Request.Context(), entryID, user.ID, user.Role)
	if err != nil {
		if err == service.ErrWalletPermissionDenied {
			c.JSON(http.StatusForbidden, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, entry)
}

func (h *EntryHandler) CreateBatch(c *gin.Context) {
	user, ok := middleware.GetCurrentUser(c)
	if !ok || user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	var reqBody model.BatchEntriesRequest
	if err := c.ShouldBindJSON(&reqBody); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	resp, err := h.entrySvc.CreateBatchEntries(c.Request.Context(), user.ID, user.Role, reqBody)
	if err != nil {
		if err == service.ErrWalletPermissionDenied {
			c.JSON(http.StatusForbidden, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, resp)
}

func (h *EntryHandler) GetItemSuggestions(c *gin.Context) {
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

	query := c.Query("query")
	if query == "" {
		query = c.Query("q")
	}

	suggestions, err := h.entrySvc.GetItemSuggestions(c.Request.Context(), walletID, user.ID, user.Role, query, 20)
	if err != nil {
		if err == service.ErrWalletPermissionDenied {
			c.JSON(http.StatusForbidden, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if suggestions == nil {
		suggestions = []model.ItemSuggestion{}
	}

	c.JSON(http.StatusOK, gin.H{"items": suggestions})
}

func (h *EntryHandler) GetCorrections(c *gin.Context) {
	user, ok := middleware.GetCurrentUser(c)
	if !ok || user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	entryIDStr := c.Param("id")
	entryID, err := uuid.Parse(entryIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid entry id"})
		return
	}

	corrections, err := h.entrySvc.GetEntryCorrections(c.Request.Context(), entryID, user.ID, user.Role)
	if err != nil {
		if err == service.ErrWalletPermissionDenied {
			c.JSON(http.StatusForbidden, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}

	if corrections == nil {
		corrections = []model.Entry{}
	}

	c.JSON(http.StatusOK, gin.H{"corrections": corrections})
}
