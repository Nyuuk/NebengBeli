package database

import (
	"database/sql"
	_ "embed"
	"fmt"
	"log"
)

//go:embed migrations/000001_init_schema.up.sql
var initSchemaUpSQL string

//go:embed migrations/000001_init_schema.down.sql
var initSchemaDownSQL string

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

	var appliedVersion int
	err := db.QueryRow("SELECT version FROM schema_migrations WHERE version = 1").Scan(&appliedVersion)
	if err == sql.ErrNoRows {
		log.Println("Applying migration 000001_init_schema.up.sql...")
		tx, err := db.Begin()
		if err != nil {
			return fmt.Errorf("failed to begin migration transaction: %w", err)
		}
		defer tx.Rollback()

		if _, err := tx.Exec(initSchemaUpSQL); err != nil {
			return fmt.Errorf("failed to execute migration up: %w", err)
		}

		if _, err := tx.Exec("INSERT INTO schema_migrations (version) VALUES (1)"); err != nil {
			return fmt.Errorf("failed to record applied migration: %w", err)
		}

		if err := tx.Commit(); err != nil {
			return fmt.Errorf("failed to commit migration: %w", err)
		}
		log.Println("Migration 000001_init_schema.up.sql applied successfully.")
	} else if err != nil {
		return fmt.Errorf("failed to query schema_migrations: %w", err)
	} else {
		log.Println("Database schema is up to date (version 1).")
	}

	return nil
}

func RollbackMigrations(db *sql.DB) error {
	log.Println("Rolling back database migrations...")
	tx, err := db.Begin()
	if err != nil {
		return fmt.Errorf("failed to begin rollback transaction: %w", err)
	}
	defer tx.Rollback()

	if _, err := tx.Exec(initSchemaDownSQL); err != nil {
		return fmt.Errorf("failed to execute migration down: %w", err)
	}

	if _, err := tx.Exec("DELETE FROM schema_migrations WHERE version = 1"); err != nil {
		return fmt.Errorf("failed to clear migration record: %w", err)
	}

	if err := tx.Commit(); err != nil {
		return fmt.Errorf("failed to commit rollback: %w", err)
	}
	log.Println("Rollback applied successfully.")
	return nil
}
