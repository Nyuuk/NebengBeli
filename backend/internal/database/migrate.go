package database

import (
	"database/sql"
	_ "embed"
	"fmt"
	"log"
)

//go:embed migrations/000001_init_schema.up.sql
var mig001UpSQL string

//go:embed migrations/000001_init_schema.down.sql
var mig001DownSQL string

//go:embed migrations/000002_entry_permissions.up.sql
var mig002UpSQL string

//go:embed migrations/000002_entry_permissions.down.sql
var mig002DownSQL string

type migration struct {
	version int
	name    string
	upSQL   string
	downSQL string
}

var migrations = []migration{
	{version: 1, name: "000001_init_schema", upSQL: mig001UpSQL, downSQL: mig001DownSQL},
	{version: 2, name: "000002_entry_permissions", upSQL: mig002UpSQL, downSQL: mig002DownSQL},
}

func RunMigrations(db *sql.DB) error {
	log.Println("Applying database migrations...")

	// Create schema_migrations table if not exists
	createMigTableSQL := `
		CREATE TABLE IF NOT EXISTS schema_migrations (
			version INT PRIMARY KEY,
			applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		);
	`
	if _, err := db.Exec(createMigTableSQL); err != nil {
		return fmt.Errorf("failed to create schema_migrations table: %w", err)
	}

	for _, m := range migrations {
		var exists int
		err := db.QueryRow("SELECT version FROM schema_migrations WHERE version = $1", m.version).Scan(&exists)
		if err == sql.ErrNoRows {
			log.Printf("Applying migration %d: %s.up.sql...", m.version, m.name)
			tx, err := db.Begin()
			if err != nil {
				return fmt.Errorf("failed to begin migration %d transaction: %w", m.version, err)
			}

			if _, err := tx.Exec(m.upSQL); err != nil {
				tx.Rollback()
				return fmt.Errorf("failed to execute migration %d up: %w", m.version, err)
			}

			if _, err := tx.Exec("INSERT INTO schema_migrations (version) VALUES ($1)", m.version); err != nil {
				tx.Rollback()
				return fmt.Errorf("failed to record applied migration %d: %w", m.version, err)
			}

			if err := tx.Commit(); err != nil {
				return fmt.Errorf("failed to commit migration %d: %w", m.version, err)
			}
			log.Printf("Migration %d (%s) applied successfully.", m.version, m.name)
		} else if err != nil {
			return fmt.Errorf("failed to query schema_migrations for version %d: %w", m.version, err)
		} else {
			log.Printf("Migration %d (%s) already applied.", m.version, m.name)
		}
	}

	log.Println("Database migrations complete.")
	return nil
}

func RollbackMigrations(db *sql.DB) error {
	log.Println("Rolling back database migrations...")
	for i := len(migrations) - 1; i >= 0; i-- {
		m := migrations[i]
		var exists int
		err := db.QueryRow("SELECT version FROM schema_migrations WHERE version = $1", m.version).Scan(&exists)
		if err == nil {
			log.Printf("Rolling back migration %d: %s.down.sql...", m.version, m.name)
			tx, err := db.Begin()
			if err != nil {
				return fmt.Errorf("failed to begin rollback transaction: %w", err)
			}

			if _, err := tx.Exec(m.downSQL); err != nil {
				tx.Rollback()
				return fmt.Errorf("failed to execute rollback %d down: %w", m.version, err)
			}

			if _, err := tx.Exec("DELETE FROM schema_migrations WHERE version = $1", m.version); err != nil {
				tx.Rollback()
				return fmt.Errorf("failed to clear migration record %d: %w", m.version, err)
			}

			if err := tx.Commit(); err != nil {
				return fmt.Errorf("failed to commit rollback %d: %w", m.version, err)
			}
			log.Printf("Migration %d rolled back successfully.", m.version)
		}
	}
	return nil
}
