package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/nyuuk/nebengbeli/internal/auth"
	"github.com/nyuuk/nebengbeli/internal/config"
	"github.com/nyuuk/nebengbeli/internal/database"
	"github.com/nyuuk/nebengbeli/internal/handler"
	"github.com/nyuuk/nebengbeli/internal/middleware"
	"github.com/nyuuk/nebengbeli/internal/model"
	"github.com/nyuuk/nebengbeli/internal/repository"
	"github.com/nyuuk/nebengbeli/internal/service"
)

func main() {
	cfg := config.LoadConfig()

	if cfg.Environment == "production" {
		gin.SetMode(gin.ReleaseMode)
	}

	// 1. Connect to PostgreSQL
	db, err := database.Connect(cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}
	defer db.Close()
	log.Println("Connected to PostgreSQL database successfully.")

	// 2. Run Database Migrations
	if err := database.RunMigrations(db); err != nil {
		log.Fatalf("Failed to run database migrations: %v", err)
	}

	// 3. Initialize Repositories
	userRepo := repository.NewUserRepository(db)
	walletRepo := repository.NewWalletRepository(db)
	entryRepo := repository.NewEntryRepository(db)
	linkRepo := repository.NewLinkRequestRepository(db)
	auditRepo := repository.NewAuditRepository(db)

	// 4. Initialize Auth & Services
	jwtMgr := auth.NewJWTManager(cfg.JWTSecret, cfg.JWTExpiry)
	authSvc := service.NewAuthService(userRepo, auditRepo, jwtMgr)
	walletSvc := service.NewWalletService(walletRepo, userRepo, entryRepo, auditRepo)
	entrySvc := service.NewEntryService(entryRepo, walletRepo, auditRepo)
	linkSvc := service.NewLinkService(linkRepo, walletRepo, userRepo, auditRepo)
	stmtSvc := service.NewStatementService(entryRepo, walletRepo)

	// 5. Initialize Handlers
	authHandler := handler.NewAuthHandler(authSvc, cfg)
	walletHandler := handler.NewWalletHandler(walletSvc)
	entryHandler := handler.NewEntryHandler(entrySvc)
	stmtHandler := handler.NewStatementHandler(stmtSvc)
	linkHandler := handler.NewLinkRequestHandler(linkSvc)
	adminHandler := handler.NewAdminHandler(userRepo, walletRepo, entryRepo, auditRepo, authSvc)
	devHandler := handler.NewDevHandler(db, userRepo, walletRepo, entryRepo, linkRepo, auditRepo, jwtMgr, cfg)
	healthHandler := handler.NewHealthHandler(db)

	// 6. Rate Limiters
	authLimiter := middleware.NewRateLimiter(cfg.RateLimitAuth, 10)
	apiLimiter := middleware.NewRateLimiter(cfg.RateLimitAPI, 30)

	// 7. Setup Router
	r := gin.Default()
	r.Use(middleware.CORSMiddleware(cfg.CORSAllowedOrigins))

	// Health probes
	r.GET("/healthz", healthHandler.Healthz)
	r.GET("/readyz", healthHandler.Readyz)

	// Direct /auth group fallback for single-domain reverse proxy routing
	topAuth := r.Group("/auth")
	topAuth.Use(authLimiter.Middleware())
	{
		topAuth.POST("/register", authHandler.Register)
		topAuth.POST("/login", authHandler.Login)
	}

	// Public Auth Routes (rate limited)
	api := r.Group("/api")
	{
		authGroup := api.Group("/auth")
		authGroup.Use(authLimiter.Middleware())
		{
			authGroup.POST("/register", authHandler.Register)
			authGroup.POST("/login", authHandler.Login)
		}

		// Authenticated Routes
		authRequired := api.Group("")
		authRequired.Use(apiLimiter.Middleware())
		authRequired.Use(middleware.AuthMiddleware(jwtMgr, authSvc))
		{
			// Auth
			authRequired.POST("/auth/logout", authHandler.Logout)
			authRequired.GET("/auth/me", authHandler.Me)
			authRequired.POST("/auth/renew", authHandler.Renew)
			authRequired.GET("/auth/renew", authHandler.Renew)
			authRequired.POST("/auth/reset-password", authHandler.ResetPassword)
			authRequired.POST("/auth/change-password", authHandler.ResetPassword)

			// Insights (F8: Total uang saya yang masih di luar, charts & trends)
			authRequired.GET("/insights", walletHandler.GetInsights)

			// Wallets
			wallets := authRequired.Group("/wallets")
			{
				wallets.POST("", walletHandler.Create)
				wallets.GET("", walletHandler.List)
				wallets.GET("/insights", walletHandler.GetInsights)
				wallets.GET("/:id", walletHandler.Get)
				wallets.PATCH("/:id/name", walletHandler.UpdateName)
				wallets.POST("/:id/archive", walletHandler.Archive)
				wallets.POST("/:id/unarchive", walletHandler.Unarchive)

				// Unlink owner (F6: Pembuat memutus link)
				wallets.DELETE("/:id/link", walletHandler.Unlink)
				wallets.DELETE("/:id/owner", walletHandler.Unlink)
				wallets.POST("/:id/unlink", walletHandler.Unlink)

				// Autocomplete item history (F1: Sesi Belanja item suggestions)
				wallets.GET("/:id/items", entryHandler.GetItemSuggestions)
				wallets.GET("/:id/item-suggestions", entryHandler.GetItemSuggestions)
				wallets.GET("/:id/suggestions", entryHandler.GetItemSuggestions)

				// Ledger entries on wallet
				wallets.POST("/:id/entries", entryHandler.Create)

				// Statements
				wallets.GET("/:id/statement", stmtHandler.GetStatement)
				wallets.GET("/:id/statement/export", stmtHandler.ExportCSV)

				// Link wallet
				wallets.POST("/:id/links", linkHandler.Create)
			}

			// Single entries, batch entries, and cross-wallet actions
			entries := authRequired.Group("/entries")
			{
				entries.POST("/batch", entryHandler.CreateBatch) // F1: Simpan Semua batch entries in 1 DB transaction
				entries.POST("/move", entryHandler.Move)         // F3: Pindah ke dompet lain
				entries.GET("/:id", entryHandler.Get)
				entries.GET("/:id/corrections", entryHandler.GetCorrections) // F3: Daftar koreksi entri
			}

			// Link Requests
			links := authRequired.Group("/links")
			{
				links.GET("", linkHandler.List)
				links.GET("/:id", linkHandler.Get)
				links.POST("/:id/approve", linkHandler.Approve)
				links.POST("/:id/accept", linkHandler.Approve)
				links.POST("/:id/reject", linkHandler.Reject)
			}

			// Admin Routes
			admin := authRequired.Group("/admin")
			admin.Use(middleware.RequireRole(model.RoleAdmin))
			{
				admin.GET("/users", adminHandler.ListUsers)
				admin.POST("/users/reset-password", adminHandler.ResetPassword)
				admin.GET("/wallets", adminHandler.ListWallets)
				admin.GET("/audit-logs", adminHandler.ListAuditLogs)
				admin.GET("/stats", adminHandler.GetStats)
				admin.GET("/entries", adminHandler.ListEntries)
				admin.GET("/transactions", adminHandler.ListEntries)
				admin.GET("/trends", adminHandler.GetTrends)
				admin.GET("/creators", adminHandler.ListCreators)
				admin.GET("/summary", adminHandler.GetPeriodSummary)
			}
		}

		// Local-only dev fixture/session endpoints (never exposed in production)
		if cfg.EnableDevEndpoints {
			dev := api.Group("/dev")
			{
				dev.GET("/status", devHandler.Status)
				dev.POST("/session", devHandler.CreateSession)
				dev.POST("/fixtures/reset", devHandler.ResetFixtures)
				dev.POST("/fixtures/seed", devHandler.SeedFixtures)
			}
		}
	}

	// 8. Start HTTP Server with Graceful Shutdown
	server := &http.Server{
		Addr:         ":" + cfg.Port,
		Handler:      r,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	go func() {
		log.Printf("NebengBeli backend server starting on port %s (env: %s)...", cfg.Port, cfg.Environment)
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("Server listen failed: %v", err)
		}
	}()

	// Graceful shutdown signal handling
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit
	log.Println("Shutting down NebengBeli server...")

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := server.Shutdown(ctx); err != nil {
		log.Fatalf("Server forced to shutdown: %v", err)
	}

	log.Println("NebengBeli server exited cleanly.")
}
