package tests

import (
	"bytes"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

func TestE2EFixturesScriptEndpointSelectionAndHelp(t *testing.T) {
	// Find scripts/e2e-fixtures.sh relative to repo root
	wd, err := os.Getwd()
	if err != nil {
		t.Fatalf("failed to get working dir: %v", err)
	}

	scriptPath := filepath.Join(wd, "..", "..", "scripts", "e2e-fixtures.sh")
	if _, err := os.Stat(scriptPath); os.IsNotExist(err) {
		scriptPath = filepath.Join(wd, "..", "scripts", "e2e-fixtures.sh")
	}

	if _, err := os.Stat(scriptPath); os.IsNotExist(err) {
		t.Fatalf("scripts/e2e-fixtures.sh not found at: %s", scriptPath)
	}

	scriptBytes, err := os.ReadFile(scriptPath)
	if err != nil {
		t.Fatalf("failed to read scripts/e2e-fixtures.sh: %v", err)
	}
	scriptContent := string(scriptBytes)

	// Regression Assertion 1: Must default to http://localhost:8080
	if !strings.Contains(scriptContent, `API_URL="http://localhost:8080"`) {
		t.Errorf("scripts/e2e-fixtures.sh must contain explicit default API_URL=\"http://localhost:8080\"")
	}

	// Regression Assertion 2: Must support configurable API_URL or USE_HTTPS
	if !strings.Contains(scriptContent, `USE_HTTPS`) {
		t.Errorf("scripts/e2e-fixtures.sh must support USE_HTTPS environment variable")
	}
	if !strings.Contains(scriptContent, `API_URL=`) {
		t.Errorf("scripts/e2e-fixtures.sh must support API_URL environment variable")
	}

	// Regression Assertion 3: Never print generated or provided passwords
	if strings.Contains(scriptContent, `echo "[fixtures] Creating admin '${USERNAME}' with password '${PASSWORD}'"`) ||
		strings.Contains(scriptContent, `echo "[fixtures] Generated password: ${PASSWORD}"`) {
		t.Errorf("scripts/e2e-fixtures.sh must never log/print password secrets to stdout")
	}

	// Test executing help command (exit 1 with usage)
	cmd := exec.Command("bash", scriptPath, "help")
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	_ = cmd.Run()

	combinedOutput := stdout.String() + stderr.String()
	if !strings.Contains(combinedOutput, "http://localhost:8080") {
		t.Errorf("expected usage output to mention default http://localhost:8080, got: %s", combinedOutput)
	}
	if !strings.Contains(combinedOutput, "USE_HTTPS") {
		t.Errorf("expected usage output to mention USE_HTTPS, got: %s", combinedOutput)
	}
}

func TestE2EPreloadConfiguration(t *testing.T) {
	wd, err := os.Getwd()
	if err != nil {
		t.Fatalf("failed to get working dir: %v", err)
	}

	repoRoot := filepath.Join(wd, "..", "..")
	if _, err := os.Stat(filepath.Join(repoRoot, "docker-compose.yml")); os.IsNotExist(err) {
		repoRoot = filepath.Join(wd, "..")
	}

	// 1. Verify Dockerfile.frontend ARG VITE_E2E_MODE=false (fail-closed default)
	dockerfileBytes, err := os.ReadFile(filepath.Join(repoRoot, "Dockerfile.frontend"))
	if err != nil {
		t.Fatalf("failed to read Dockerfile.frontend: %v", err)
	}
	dockerfileContent := string(dockerfileBytes)
	if !strings.Contains(dockerfileContent, "ARG VITE_E2E_MODE=false") {
		t.Errorf("Dockerfile.frontend must define fail-closed default 'ARG VITE_E2E_MODE=false'")
	}
	if !strings.Contains(dockerfileContent, "ENV VITE_E2E_MODE=$VITE_E2E_MODE") {
		t.Errorf("Dockerfile.frontend must pass ENV VITE_E2E_MODE=$VITE_E2E_MODE to build step")
	}

	// 2. Verify docker-compose.yml passes VITE_E2E_MODE: "true" for local E2E harness
	composeBytes, err := os.ReadFile(filepath.Join(repoRoot, "docker-compose.yml"))
	if err != nil {
		t.Fatalf("failed to read docker-compose.yml: %v", err)
	}
	composeContent := string(composeBytes)
	if !strings.Contains(composeContent, `VITE_E2E_MODE: "true"`) {
		t.Errorf("docker-compose.yml must specify frontend build arg VITE_E2E_MODE: \"true\"")
	}

	// 3. Verify frontend/vite.config.ts contains E2E preload plugin
	viteConfigBytes, err := os.ReadFile(filepath.Join(repoRoot, "frontend", "vite.config.ts"))
	if err != nil {
		t.Fatalf("failed to read frontend/vite.config.ts: %v", err)
	}
	viteConfigContent := string(viteConfigBytes)
	if !strings.Contains(viteConfigContent, "e2e-preload-plugin") || !strings.Contains(viteConfigContent, "window.__E2E_MODE__ = true;") {
		t.Errorf("frontend/vite.config.ts must configure e2e-preload-plugin with window.__E2E_MODE__ = true;")
	}
}

