# --- Makefile for Python Projects ---
# Usage: make [target]

SHELL := bash
.ONESHELL:
.SHELLFLAGS := -eu -o pipefail -c
.DELETE_ON_ERROR:
MAKEFLAGS += --warn-undefined-variables
MAKEFLAGS += --no-builtin-rules

# --- Project ---
PROJECT ?= $(shell basename $(CURDIR))
PYTHON  ?= python3
SRC_DIR ?= src

# --- Git ---
VERSION    ?= $(shell git describe --tags --always --dirty 2>/dev/null || echo "dev")
COMMIT     ?= $(shell git rev-parse --short HEAD 2>/dev/null || echo "unknown")
BUILD_TIME := $(shell date -u '+%Y-%m-%dT%H:%M:%SZ')

# --- Package Manager Detection ---
# Override: make PKG=pip [target]
PKG ?= $(shell \
	if [ -f uv.lock ]; then echo "uv"; \
	elif [ -f poetry.lock ]; then echo "poetry"; \
	elif [ -f Pipfile.lock ]; then echo "pipenv"; \
	else echo "pip"; fi)

PKG_RUN := $(shell \
	if [ "$(PKG)" = "uv" ]; then echo "uv run"; \
	elif [ "$(PKG)" = "poetry" ]; then echo "poetry run"; \
	elif [ "$(PKG)" = "pipenv" ]; then echo "pipenv run"; \
	else echo ""; fi)

# --- Docker ---
DOCKER_REGISTRY ?= ghcr.io
DOCKER_IMAGE    ?= $(DOCKER_REGISTRY)/$(PROJECT)
DOCKER_TAG      ?= $(VERSION)

# ============================================================================
.DEFAULT_GOAL := help

##@ Development

.PHONY: install
install: ## Install dependencies
ifeq ($(PKG),uv)
	uv sync
else ifeq ($(PKG),poetry)
	poetry install
else ifeq ($(PKG),pipenv)
	pipenv install --dev
else
	$(PYTHON) -m pip install -e ".[dev]"
endif

.PHONY: dev
dev: ## Start development server
	$(PKG_RUN) $(PYTHON) -m uvicorn main:app --reload --host 0.0.0.0 --port 8000

.PHONY: run
run: ## Run the application
	$(PKG_RUN) $(PYTHON) -m $(PROJECT)

.PHONY: shell
shell: ## Open interactive Python shell
	$(PKG_RUN) $(PYTHON)

##@ Testing

.PHONY: test
test: ## Run tests
	$(PKG_RUN) pytest

.PHONY: test-watch
test-watch: ## Run tests in watch mode
	$(PKG_RUN) pytest-watch

.PHONY: test-cover
test-cover: ## Run tests with coverage
	$(PKG_RUN) pytest --cov=$(SRC_DIR) --cov-report=html --cov-report=term-missing
	@echo "Coverage report: htmlcov/index.html"

.PHONY: test-integration
test-integration: ## Run integration tests
	$(PKG_RUN) pytest tests/integration/ -v

##@ Code Quality

.PHONY: lint
lint: ## Run linters
	$(PKG_RUN) ruff check $(SRC_DIR) tests/

.PHONY: lint-fix
lint-fix: ## Run linters with auto-fix
	$(PKG_RUN) ruff check --fix $(SRC_DIR) tests/

.PHONY: fmt
fmt: ## Format code
	$(PKG_RUN) ruff format $(SRC_DIR) tests/

.PHONY: fmt-check
fmt-check: ## Check code formatting
	$(PKG_RUN) ruff format --check $(SRC_DIR) tests/

.PHONY: typecheck
typecheck: ## Run type checker
	$(PKG_RUN) mypy $(SRC_DIR)

.PHONY: check
check: lint fmt-check typecheck test ## Run all checks

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

##@ Database

.PHONY: db-migrate
db-migrate: ## Run database migrations
	$(PKG_RUN) alembic upgrade head

.PHONY: db-rollback
db-rollback: ## Rollback last migration
	$(PKG_RUN) alembic downgrade -1

.PHONY: db-migration
db-migration: ## Create new migration (usage: make db-migration MSG="add users table")
	$(PKG_RUN) alembic revision --autogenerate -m "$(MSG)"

##@ CI

.PHONY: ci
ci: install lint fmt-check typecheck test ## Run full CI pipeline

##@ Cleanup

.PHONY: clean
clean: ## Remove build artifacts and caches
	rm -rf dist/ build/ *.egg-info .pytest_cache .mypy_cache .ruff_cache htmlcov/ coverage.xml
	find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
	find . -type f -name "*.pyc" -delete 2>/dev/null || true

##@ Help

.PHONY: help
help: ## Show this help
	@awk 'BEGIN {FS = ":.*##"; printf "Usage:\n  make \033[36m<target>\033[0m\n"} \
		/^[a-zA-Z_-]+:.*?## / {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2} \
		/^##@/ {printf "\n\033[1m%s\033[0m\n", substr($$0, 5)}' $(MAKEFILE_LIST)
