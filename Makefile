.PHONY: all build test clean run-backend run-frontend docker-up docker-down cli test-backend test-frontend certs e2e-setup e2e-fixtures e2e-smoke e2e-cleanup e2e-test

all: build test

# Build targets
build: build-backend build-frontend

build-backend:
	cd backend && go build -o bin/nebengbeli-server ./cmd/server
	cd backend && go build -o bin/nebengbeli-cli ./cmd/cli

build-frontend:
	cd frontend && npm install && npm run build

# Test targets
test: test-backend test-frontend

test-backend:
	cd backend && go test -v -race ./tests/...

test-frontend:
	cd frontend && npm run build

# Development run targets
run-backend:
	cd backend && go run ./cmd/server/main.go

run-frontend:
	cd frontend && npm run dev

# Docker Compose targets
docker-up:
	docker compose up --build -d

docker-down:
	docker compose down

docker-logs:
	docker compose logs -f

# CLI helper (example: make cli CMD="users" or make cli CMD="stats")
cli:
	cd backend && go run ./cmd/cli/main.go $(CMD)

# Local HTTPS Camofox E2E Harness targets
certs:
	./scripts/generate-certs.sh

e2e-setup:
	./scripts/e2e-setup.sh

e2e-fixtures:
	./scripts/e2e-fixtures.sh $(CMD)

e2e-smoke:
	./scripts/e2e-smoke.sh

e2e-cleanup:
	./scripts/e2e-cleanup.sh $(FLAGS)

e2e-test:
	./scripts/e2e-runner.sh

clean:
	rm -rf backend/bin frontend/dist frontend/node_modules certs
