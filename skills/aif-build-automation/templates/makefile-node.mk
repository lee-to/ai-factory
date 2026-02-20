# --- Makefile for Node.js Projects ---
# Usage: make [target]

SHELL := bash
.ONESHELL:
.SHELLFLAGS := -eu -o pipefail -c
.DELETE_ON_ERROR:
MAKEFLAGS += --warn-undefined-variables
MAKEFLAGS += --no-builtin-rules

# --- Project ---
PROJECT  ?= $(shell node -p "require('./package.json').name" 2>/dev/null || basename $(CURDIR))
NODE_ENV ?= development

# --- Git ---
VERSION    ?= $(shell git describe --tags --always --dirty 2>/dev/null || echo "dev")
COMMIT     ?= $(shell git rev-parse --short HEAD 2>/dev/null || echo "unknown")
BUILD_TIME := $(shell date -u '+%Y-%m-%dT%H:%M:%SZ')

# --- Package Manager Detection ---
# Override: make PM=yarn [target]
PM ?= $(shell \
	if [ -f bun.lockb ]; then echo "bun"; \
	elif [ -f pnpm-lock.yaml ]; then echo "pnpm"; \
	elif [ -f yarn.lock ]; then echo "yarn"; \
	else echo "npm"; fi)

PMX := $(shell \
	if [ "$(PM)" = "bun" ]; then echo "bunx"; \
	elif [ "$(PM)" = "pnpm" ]; then echo "pnpm exec"; \
	elif [ "$(PM)" = "yarn" ]; then echo "yarn"; \
	else echo "npx"; fi)

# --- Docker ---
DOCKER_REGISTRY ?= ghcr.io
DOCKER_IMAGE    ?= $(DOCKER_REGISTRY)/$(PROJECT)
DOCKER_TAG      ?= $(VERSION)

# ============================================================================
.DEFAULT_GOAL := help

##@ Development

.PHONY: install
install: ## Install dependencies
	$(PM) install

.PHONY: dev
dev: ## Start development server
	$(PM) run dev

.PHONY: build
build: ## Build for production
	NODE_ENV=production $(PM) run build

.PHONY: start
start: ## Start production server
	NODE_ENV=production $(PM) run start

.PHONY: generate
generate: ## Run code generation (if applicable)
	$(PM) run generate

##@ Testing

.PHONY: test
test: ## Run tests
	$(PM) run test

.PHONY: test-watch
test-watch: ## Run tests in watch mode
	$(PM) run test -- --watch

.PHONY: test-cover
test-cover: ## Run tests with coverage
	$(PM) run test -- --coverage

.PHONY: e2e
e2e: ## Run end-to-end tests
	$(PM) run test:e2e

##@ Code Quality

.PHONY: lint
lint: ## Run linter
	$(PM) run lint

.PHONY: lint-fix
lint-fix: ## Run linter with auto-fix
	$(PM) run lint -- --fix

.PHONY: fmt
fmt: ## Format code with Prettier
	$(PMX) prettier --write .

.PHONY: fmt-check
fmt-check: ## Check code formatting
	$(PMX) prettier --check .

.PHONY: typecheck
typecheck: ## Run TypeScript type checking
	$(PMX) tsc --noEmit

.PHONY: check
check: lint typecheck test ## Run all checks

##@ Docker

.PHONY: docker-build
docker-build: ## Build Docker image
	docker build \
		--build-arg VERSION=$(VERSION) \
		--build-arg COMMIT=$(COMMIT) \
		-t $(DOCKER_IMAGE):$(DOCKER_TAG) \
		-t $(DOCKER_IMAGE):latest \
		.

.PHONY: docker-push
docker-push: ## Push Docker image
	docker push $(DOCKER_IMAGE):$(DOCKER_TAG)
	docker push $(DOCKER_IMAGE):latest

.PHONY: docker-run
docker-run: ## Run Docker container locally
	docker run --rm -p 3000:3000 --env-file .env $(DOCKER_IMAGE):$(DOCKER_TAG)

##@ Database

.PHONY: db-migrate
db-migrate: ## Run database migrations
	$(PM) run db:migrate

.PHONY: db-seed
db-seed: ## Seed the database
	$(PM) run db:seed

.PHONY: db-reset
db-reset: ## Reset database (migrate + seed)
	$(PM) run db:reset

##@ CI

.PHONY: ci
ci: install lint typecheck test build ## Run full CI pipeline

##@ Cleanup

.PHONY: clean
clean: ## Remove build artifacts and caches
	rm -rf dist/ build/ .next/ out/ coverage/ .turbo/ node_modules/.cache

.PHONY: clean-all
clean-all: clean ## Remove everything including node_modules
	rm -rf node_modules/

##@ Help

.PHONY: help
help: ## Show this help
	@awk 'BEGIN {FS = ":.*##"; printf "Usage:\n  make \033[36m<target>\033[0m\n"} \
		/^[a-zA-Z_-]+:.*?## / {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2} \
		/^##@/ {printf "\n\033[1m%s\033[0m\n", substr($$0, 5)}' $(MAKEFILE_LIST)
