package middleware

import (
	"github.com/gin-gonic/gin"
)

func GetClientInfo(c *gin.Context) (ip string, userAgent string) {
	ip = c.ClientIP()
	userAgent = c.Request.UserAgent()
	return ip, userAgent
}
