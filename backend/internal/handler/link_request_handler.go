package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/nyuuk/nebengbeli/internal/middleware"
	"github.com/nyuuk/nebengbeli/internal/model"
	"github.com/nyuuk/nebengbeli/internal/service"
)

type LinkRequestHandler struct {
	linkSvc service.LinkService
}

func NewLinkRequestHandler(linkSvc service.LinkService) *LinkRequestHandler {
	return &LinkRequestHandler{
		linkSvc: linkSvc,
	}
}

type CreateLinkRequestBody struct {
	TargetUsername string `json:"target_username" binding:"required"`
}

func (h *LinkRequestHandler) Create(c *gin.Context) {
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

	var reqBody CreateLinkRequestBody
	if err := c.ShouldBindJSON(&reqBody); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	linkReq, err := h.linkSvc.CreateLinkRequest(c.Request.Context(), user.ID, walletID, reqBody.TargetUsername)
	if err != nil {
		if err == service.ErrWalletPermissionDenied {
			c.JSON(http.StatusForbidden, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, linkReq)
}

func (h *LinkRequestHandler) List(c *gin.Context) {
	user, ok := middleware.GetCurrentUser(c)
	if !ok || user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	reqs, err := h.linkSvc.ListUserLinkRequests(c.Request.Context(), user.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if reqs == nil {
		reqs = []model.LinkRequest{}
	}

	c.JSON(http.StatusOK, gin.H{"link_requests": reqs})
}

func (h *LinkRequestHandler) Get(c *gin.Context) {
	idStr := c.Param("id")
	if idStr == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "link request id required"})
		return
	}

	id, err := uuid.Parse(idStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid link request id"})
		return
	}

	linkReq, err := h.linkSvc.GetLinkRequest(c.Request.Context(), id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "link request not found"})
		return
	}

	c.JSON(http.StatusOK, linkReq)
}

func (h *LinkRequestHandler) Approve(c *gin.Context) {
	user, ok := middleware.GetCurrentUser(c)
	if !ok || user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	idStr := c.Param("id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid link request id"})
		return
	}

	linkReq, err := h.linkSvc.ApproveLinkRequest(c.Request.Context(), user.ID, id)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message":      "wallet linked successfully",
		"link_request": linkReq,
	})
}

func (h *LinkRequestHandler) Reject(c *gin.Context) {
	user, ok := middleware.GetCurrentUser(c)
	if !ok || user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	idStr := c.Param("id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid link request id"})
		return
	}

	linkReq, err := h.linkSvc.RejectLinkRequest(c.Request.Context(), user.ID, id)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message":      "link request rejected",
		"link_request": linkReq,
	})
}
