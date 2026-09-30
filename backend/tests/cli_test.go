package tests

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

func TestCLIMigrateCommandUsage(t *testing.T) {
	// Build CLI binary for test
	tempDir := t.TempDir()
	binPath := filepath.Join(tempDir, "nebengbeli-cli")

	cmd := exec.Command("go", "build", "-o", binPath, "../cmd/cli")
	if out, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("failed to build cli binary: %v, output: %s", err, string(out))
	}

	// 1. Test running with no arguments prints usage and exits non-zero
	cmdNoArgs := exec.Command(binPath)
	outNoArgs, err := cmdNoArgs.CombinedOutput()
	if err == nil {
		t.Errorf("expected non-zero exit code when running cli without args")
	}
	if !strings.Contains(string(outNoArgs), "Available Commands:") || !strings.Contains(string(outNoArgs), "migrate") {
		t.Errorf("usage output missing migrate command: %s", string(outNoArgs))
	}

	// 2. Test running with --help exits cleanly with code 0
	cmdHelp := exec.Command(binPath, "--help")
	outHelp, err := cmdHelp.CombinedOutput()
	if err != nil {
		t.Errorf("expected 0 exit code on --help: %v, output: %s", err, string(outHelp))
	}
	if !strings.Contains(string(outHelp), "migrate") {
		t.Errorf("help output missing migrate command: %s", string(outHelp))
	}

	// 3. Test running with help exits cleanly with code 0
	cmdHelpArg := exec.Command(binPath, "help")
	outHelpArg, err := cmdHelpArg.CombinedOutput()
	if err != nil {
		t.Errorf("expected 0 exit code on 'help': %v, output: %s", err, string(outHelpArg))
	}
	if !strings.Contains(string(outHelpArg), "migrate") {
		t.Errorf("help output missing migrate command: %s", string(outHelpArg))
	}
}

func TestMigrationFilesContent(t *testing.T) {
	upMigrationPath := filepath.Join("..", "internal", "database", "migrations", "000001_init_schema.up.sql")
	downMigrationPath := filepath.Join("..", "internal", "database", "migrations", "000001_init_schema.down.sql")

	upContent, err := os.ReadFile(upMigrationPath)
	if err != nil {
		t.Fatalf("failed to read up migration file: %v", err)
	}

	downContent, err := os.ReadFile(downMigrationPath)
	if err != nil {
		t.Fatalf("failed to read down migration file: %v", err)
	}

	upStr := string(upContent)
	expectedTables := []string{"users", "wallets", "entries", "link_requests", "audit_logs"}
	for _, table := range expectedTables {
		if !strings.Contains(upStr, "CREATE TABLE IF NOT EXISTS "+table) {
			t.Errorf("up migration missing table: %s", table)
		}
	}

	// Verify entries immutability trigger
	if !strings.Contains(upStr, "prevent_entries_mutation") {
		t.Errorf("up migration missing prevent_entries_mutation trigger function")
	}

	downStr := string(downContent)
	for _, table := range expectedTables {
		if !strings.Contains(downStr, "DROP TABLE IF EXISTS "+table) {
			t.Errorf("down migration missing drop table: %s", table)
		}
	}
}

func TestDockerfileBackendIncludesCLI(t *testing.T) {
	dockerfilePath := filepath.Join("..", "..", "Dockerfile.backend")
	content, err := os.ReadFile(dockerfilePath)
	if err != nil {
		t.Fatalf("failed to read Dockerfile.backend: %v", err)
	}

	s := string(content)
	if !strings.Contains(s, "/app/nebengbeli-cli") {
		t.Errorf("Dockerfile.backend should build and copy /app/nebengbeli-cli binary")
	}
	if !strings.Contains(s, "ENTRYPOINT") {
		t.Errorf("Dockerfile.backend should have ENTRYPOINT specified")
	}
}
