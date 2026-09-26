.PHONY: all build test clean run-backend run-frontend docker-up docker-down cli test-backend test-frontend

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

clean:
	rm -rf backend/bin frontend/dist frontend/node_modules
