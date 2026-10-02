package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"os"
	"text/tabwriter"
	"time"

	"github.com/google/uuid"
	"github.com/nyuuk/nebengbeli/internal/auth"
	"github.com/nyuuk/nebengbeli/internal/config"
	"github.com/nyuuk/nebengbeli/internal/database"
	"github.com/nyuuk/nebengbeli/internal/model"
	"github.com/nyuuk/nebengbeli/internal/repository"
)

func printUsage() {
	fmt.Print(`NebengBeli Administrative CLI

Usage:
  cli <command> [arguments]

Available Commands:
  migrate                  Run database schema migrations (idempotent, non-serving)
  create-admin             Create or promote a user to admin
  users                    List all registered users and token versions
  reset-password           Reset a user password and revoke existing sessions
  stats                    View aggregate platform statistics
  wallets                  List all wallets with balance and owner status
  audit-logs               View recent system audit logs
  inspect-wallet           Inspect specific wallet statement and details
  seed-fixtures            Seed predictable local fixtures for testing (local/dev only)

Flags for create-admin:
  --username <username>    Admin username (required)
  --password <password>    Admin password (required)

Flags for reset-password:
  --username <username>    Target username
  --password <password>    New password

Flags for seed-fixtures:
  --scenario <name>        Scenario: standard | empty | linked (default: standard)

Flags for audit-logs:
  --limit <n>              Number of logs to retrieve (default: 20)

Flags for inspect-wallet:
  --id <wallet_uuid>       UUID of wallet to inspect
`)
}

func main() {
	if len(os.Args) < 2 {
		printUsage()
		os.Exit(1)
	}

	command := os.Args[1]
	if command == "-h" || command == "--help" || command == "help" {
		printUsage()
		os.Exit(0)
	}

	cfg := config.LoadConfig()

	db, err := database.Connect(cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("Database connection error: %v", err)
	}
	defer db.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	userRepo := repository.NewUserRepository(db)
	walletRepo := repository.NewWalletRepository(db)
	entryRepo := repository.NewEntryRepository(db)
	auditRepo := repository.NewAuditRepository(db)

	switch command {
	case "migrate":
		log.Println("Executing database migrations...")
		if err := database.RunMigrations(db); err != nil {
			log.Fatalf("Database migration failed: %v", err)
		}
		log.Println("Database migration completed successfully.")

	case "create-admin":
		fs := flag.NewFlagSet("create-admin", flag.ExitOnError)
		username := fs.String("username", "", "Admin username")
		password := fs.String("password", "", "Admin password (required)")
		_ = fs.Parse(os.Args[2:])

		if *username == "" || *password == "" {
			fmt.Println("Error: --username and --password flags are required.")
			fs.Usage()
			os.Exit(1)
		}

		hash, err := auth.HashPassword(*password)
		if err != nil {
			log.Fatalf("Failed to hash password: %v", err)
		}

		existingUser, err := userRepo.GetByUsername(ctx, *username)
		if err == nil && existingUser != nil {
			// User exists, promote to admin and update password
			query := `UPDATE users SET role = 'admin', password_hash = $1, token_version = token_version + 1 WHERE id = $2;`
			if _, err := db.ExecContext(ctx, query, hash, existingUser.ID); err != nil {
				log.Fatalf("Failed to promote user to admin: %v", err)
			}
			fmt.Printf("User '%s' promoted to admin successfully. Token version incremented.\n", *username)
		} else {
			admin := &model.User{
				Username:     *username,
				PasswordHash: hash,
				Role:         model.RoleAdmin,
				TokenVersion: 1,
			}
			if err := userRepo.Create(ctx, admin); err != nil {
				log.Fatalf("Failed to create admin user: %v", err)
			}
			fmt.Printf("Admin user '%s' created successfully (ID: %s).\n", *username, admin.ID)
		}

	case "users":
		users, total, err := userRepo.List(ctx, 100, 0)
		if err != nil {
			log.Fatalf("Error listing users: %v", err)
		}
		fmt.Printf("Total Registered Users: %d\n\n", total)
		w := tabwriter.NewWriter(os.Stdout, 0, 0, 3, ' ', 0)
		fmt.Fprintln(w, "ID\tUSERNAME\tROLE\tTOKEN_VER\tCREATED_AT")
		for _, u := range users {
			fmt.Fprintf(w, "%s\t%s\t%s\t%d\t%s\n",
				u.ID.String(), u.Username, u.Role, u.TokenVersion, u.CreatedAt.Format(time.RFC3339))
		}
		w.Flush()

	case "reset-password":
		fs := flag.NewFlagSet("reset-password", flag.ExitOnError)
		username := fs.String("username", "", "Username to reset")
		newPass := fs.String("password", "", "New password")
		_ = fs.Parse(os.Args[2:])

		if *username == "" || *newPass == "" {
			fmt.Println("Error: both --username and --password flags are required.")
			fs.Usage()
			os.Exit(1)
		}

		user, err := userRepo.GetByUsername(ctx, *username)
		if err != nil {
			log.Fatalf("User '%s' not found: %v", *username, err)
		}

		hash, err := auth.HashPassword(*newPass)
		if err != nil {
			log.Fatalf("Password error: %v", err)
		}

		if err := userRepo.UpdatePassword(ctx, user.ID, hash); err != nil {
			log.Fatalf("Failed to update password: %v", err)
		}

		fmt.Printf("Password for user '%s' reset successfully. Active sessions revoked (token_version incremented).\n", *username)

	case "stats":
		totalUsers, _ := userRepo.Count(ctx)
		totalWallets, activeWallets, _ := walletRepo.Count(ctx)
		totalEntries, totalVolume, _ := entryRepo.CountAll(ctx)
		totalAudits, _ := auditRepo.Count(ctx)

		fmt.Println("=== NebengBeli Platform Statistics ===")
		fmt.Printf("Users:            %d\n", totalUsers)
		fmt.Printf("Wallets (Total):  %d\n", totalWallets)
		fmt.Printf("Wallets (Active): %d\n", activeWallets)
		fmt.Printf("Wallets (Arch):   %d\n", totalWallets-activeWallets)
		fmt.Printf("Ledger Entries:   %d\n", totalEntries)
		fmt.Printf("Total Volume:     Rp %d\n", totalVolume)
		fmt.Printf("Audit Records:    %d\n", totalAudits)

	case "wallets":
		wallets, total, err := walletRepo.ListAll(ctx, 100, 0)
		if err != nil {
			log.Fatalf("Error listing wallets: %v", err)
		}
		fmt.Printf("Total Wallets: %d\n\n", total)
		w := tabwriter.NewWriter(os.Stdout, 0, 0, 3, ' ', 0)
		fmt.Fprintln(w, "ID\tNAME\tCREATOR\tOWNER\tBALANCE\tENTRIES\tARCHIVED")
		for _, wl := range wallets {
			arch := "No"
			if wl.IsArchived {
				arch = "Yes"
			}
			owner := wl.OwnerUsername
			if owner == "" {
				owner = "(unlinked)"
			}
			fmt.Fprintf(w, "%s\t%s\t%s\t%s\t%d\t%d\t%s\n",
				wl.ID.String(), wl.Name, wl.CreatorUsername, owner, wl.Balance, wl.EntryCount, arch)
		}
		w.Flush()

	case "audit-logs":
		fs := flag.NewFlagSet("audit-logs", flag.ExitOnError)
		limit := fs.Int("limit", 20, "Number of audit logs to show")
		_ = fs.Parse(os.Args[2:])

		logs, total, err := auditRepo.List(ctx, repository.AuditLogFilter{Limit: *limit})
		if err != nil {
			log.Fatalf("Error listing audit logs: %v", err)
		}
		fmt.Printf("Total Audit Records: %d (Showing latest %d)\n\n", total, len(logs))
		w := tabwriter.NewWriter(os.Stdout, 0, 0, 3, ' ', 0)
		fmt.Fprintln(w, "TIMESTAMP\tACTOR\tACTION\tTARGET_TYPE\tTARGET_ID\tMETADATA")
		for _, l := range logs {
			targetID := ""
			if l.TargetID != nil {
				targetID = *l.TargetID
			}
			fmt.Fprintf(w, "%s\t%s\t%s\t%s\t%s\t%s\n",
				l.CreatedAt.Format(time.RFC3339), l.ActorUsername, l.Action, l.TargetType, targetID, string(l.Metadata))
		}
		w.Flush()

	case "inspect-wallet":
		fs := flag.NewFlagSet("inspect-wallet", flag.ExitOnError)
		idStr := fs.String("id", "", "Wallet ID UUID")
		_ = fs.Parse(os.Args[2:])

		if *idStr == "" {
			fmt.Println("Error: --id flag is required.")
			fs.Usage()
			os.Exit(1)
		}

		walletID, err := uuid.Parse(*idStr)
		if err != nil {
			log.Fatalf("Invalid UUID: %v", err)
		}

		wallet, err := walletRepo.GetByIDWithDetails(ctx, walletID, nil)
		if err != nil {
			log.Fatalf("Wallet not found: %v", err)
		}

		summary, _ := entryRepo.GetWalletSummary(ctx, walletID)
		entries, _, _ := entryRepo.ListByWallet(ctx, repository.EntryFilter{WalletID: walletID, Limit: 20})

		fmt.Println("=== Wallet Inspection ===")
		fmt.Printf("ID:         %s\n", wallet.ID)
		fmt.Printf("Name:       %s\n", wallet.Name)
		fmt.Printf("Creator:    %s\n", wallet.CreatorUsername)
		fmt.Printf("Owner:      %s\n", wallet.OwnerUsername)
		fmt.Printf("Archived:   %v\n", wallet.IsArchived)
		fmt.Println("\n--- Summary ---")
		if summary != nil {
			fmt.Printf("Total Titipan:  Rp %d\n", summary.TotalTitipan)
			fmt.Printf("Total Topup:    Rp %d\n", summary.TotalTopup)
			fmt.Printf("Total Koreksi:  Rp %d\n", summary.TotalKoreksi)
			fmt.Printf("Net Balance:    Rp %d\n", summary.CurrentBalance)
			fmt.Printf("Total Entries:  %d\n", summary.EntryCount)
		}

		fmt.Println("\n--- Recent Entries ---")
		w := tabwriter.NewWriter(os.Stdout, 0, 0, 3, ' ', 0)
		fmt.Fprintln(w, "TIMESTAMP\tTYPE\tAMOUNT\tRUNNING_BAL\tITEM_NAME\tNOTE\tCREATOR")
		for _, e := range entries {
			fmt.Fprintf(w, "%s\t%s\t%d\t%d\t%s\t%s\t%s\n",
				e.OccurredAt.Format(time.RFC3339), e.Type, e.Amount, e.RunningBalance, e.ItemName, e.Note, e.CreatedByUsername)
		}
		w.Flush()

	case "seed-fixtures":
		if !cfg.EnableDevEndpoints {
			log.Fatalf("seed-fixtures command is disabled (requires local development environment and ENABLE_DEV_ENDPOINTS=true)")
		}

		fs := flag.NewFlagSet("seed-fixtures", flag.ExitOnError)
		scenario := fs.String("scenario", "standard", "Scenario (standard/empty/linked)")
		_ = fs.Parse(os.Args[2:])

		createUser := func(uname string, r model.UserRole) *model.User {
			u, err := userRepo.GetByUsername(ctx, uname)
			if err == nil && u != nil {
				return u
			}
			hash, _ := auth.HashPassword(uuid.New().String())
			newUser := &model.User{
				Username:     uname,
				PasswordHash: hash,
				Role:         r,
				TokenVersion: 1,
			}
			_ = userRepo.Create(ctx, newUser)
			return newUser
		}

		creator := createUser("test_creator", model.RoleUser)
		owner := createUser("test_owner", model.RoleUser)
		_ = createUser("test_admin", model.RoleAdmin)

		if *scenario == "standard" || *scenario == "linked" {
			wallet := &model.Wallet{
				Name:      "Buku Makan Siang",
				CreatorID: creator.ID,
			}
			if err := walletRepo.Create(ctx, wallet); err == nil {
				if *scenario == "standard" {
					entry1 := &model.Entry{
						ClientID:   uuid.New(),
						WalletID:   wallet.ID,
						Type:       model.EntryTypeTitipan,
						Amount:     -50000,
						ItemName:   "Nasi Padang",
						Note:       "Makan siang bersama",
						OccurredAt: time.Now().Add(-2 * time.Hour),
						CreatedBy:  creator.ID,
					}
					_, _, _ = entryRepo.Create(ctx, entry1)
				}
				if *scenario == "linked" {
					_ = walletRepo.SetOwner(ctx, wallet.ID, owner.ID)
				}
			}
		}

		fmt.Printf("Fixtures for scenario '%s' seeded successfully.\n", *scenario)

	default:
		fmt.Printf("Unknown command '%s'\n\n", command)
		printUsage()
		os.Exit(1)
	}
}
