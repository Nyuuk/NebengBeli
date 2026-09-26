package middleware

import (
	"net/http"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"golang.org/x/time/rate"
)

type ipLimiter struct {
	limiter  *rate.Limiter
	lastSeen time.Time
}

type RateLimiter struct {
	mu      sync.Mutex
	ips     map[string]*ipLimiter
	rate    rate.Limit
	burst   int
	cleanup time.Duration
}

func NewRateLimiter(reqsPerMinute int, burst int) *RateLimiter {
	r := &RateLimiter{
		ips:     make(map[string]*ipLimiter),
		rate:    rate.Limit(float64(reqsPerMinute) / 60.0),
		burst:   burst,
		cleanup: 5 * time.Minute,
	}

	go r.startCleanup()
	return r
}

func (r *RateLimiter) startCleanup() {
	ticker := time.NewTicker(r.cleanup)
	for range ticker.C {
		r.mu.Lock()
		for ip, entry := range r.ips {
			if time.Since(entry.lastSeen) > r.cleanup {
				delete(r.ips, ip)
			}
		}
		r.mu.Unlock()
	}
}

func (r *RateLimiter) getLimiter(ip string) *rate.Limiter {
	r.mu.Lock()
	defer r.mu.Unlock()

	lim, exists := r.ips[ip]
	if !exists {
		limiter := rate.NewLimiter(r.rate, r.burst)
		r.ips[ip] = &ipLimiter{limiter: limiter, lastSeen: time.Now()}
		return limiter
	}

	lim.lastSeen = time.Now()
	return lim.limiter
}

func (r *RateLimiter) Middleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		ip := c.ClientIP()
		limiter := r.getLimiter(ip)

		if !limiter.Allow() {
			c.AbortWithStatusJSON(http.StatusTooManyRequests, gin.H{
				"error": "too many requests, please slow down",
			})
			return
		}

		c.Next()
	}
}
