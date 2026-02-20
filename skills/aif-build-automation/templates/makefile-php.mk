# --- Makefile for PHP Projects ---
# Usage: make [target]

SHELL := bash
.ONESHELL:
.SHELLFLAGS := -eu -o pipefail -c
.DELETE_ON_ERROR:
MAKEFLAGS += --warn-undefined-variables
MAKEFLAGS += --no-builtin-rules

# --- Project ---
PROJECT  ?= $(shell basename $(CURDIR))
PHP      ?= php
COMPOSER ?= composer

# --- Git ---
VERSION    ?= $(shell git describe --tags --always --dirty 2>/dev/null || echo "dev")
COMMIT     ?= $(shell git rev-parse --short HEAD 2>/dev/null || echo "unknown")
BUILD_TIME := $(shell date -u '+%Y-%m-%dT%H:%M:%SZ')

# --- Docker ---
DOCKER_REGISTRY ?= ghcr.io
DOCKER_IMAGE    ?= $(DOCKER_REGISTRY)/$(PROJECT)
DOCKER_TAG      ?= $(VERSION)

# --- Laravel (uncomment if using Laravel) ---
# ARTISAN := $(PHP) artisan

# ============================================================================
.DEFAULT_GOAL := help

##@ Development

.PHONY: install
install: ## Install dependencies
	$(COMPOSER) install

.PHONY: update
update: ## Update dependencies
	$(COMPOSER) update

.PHONY: dev
dev: ## Start development server
	$(PHP) -S localhost:8000 -t public/

.PHONY: serve
serve: ## Start Laravel dev server (requires Laravel)
	$(PHP) artisan serve

.PHONY: tinker
tinker: ## Open interactive REPL (requires Laravel)
	$(PHP) artisan tinker

.PHONY: routes
routes: ## List application routes (requires Laravel)
	$(PHP) artisan route:list

##@ Testing

.PHONY: test
test: ## Run tests
	./vendor/bin/phpunit

.PHONY: test-cover
test-cover: ## Run tests with coverage report
	./vendor/bin/phpunit --coverage-html coverage/ --coverage-text
	@echo "Coverage report: coverage/index.html"

.PHONY: test-filter
test-filter: ## Run filtered tests (usage: make test-filter FILTER="ClassName::testMethod")
	./vendor/bin/phpunit --filter="$(FILTER)"

.PHONY: test-parallel
test-parallel: ## Run tests in parallel (requires paratest)
	./vendor/bin/paratest

##@ Code Quality

.PHONY: lint
lint: ## Run PHP linter (PHP-CS-Fixer dry-run)
	./vendor/bin/php-cs-fixer fix --dry-run --diff

.PHONY: lint-fix
lint-fix: ## Fix code style issues
	./vendor/bin/php-cs-fixer fix

.PHONY: phpstan
phpstan: ## Run static analysis
	./vendor/bin/phpstan analyse

.PHONY: fmt
fmt: lint-fix ## Alias for lint-fix

.PHONY: check
check: lint phpstan test ## Run all quality checks

##@ Database

.PHONY: db-migrate
db-migrate: ## Run database migrations
	$(PHP) artisan migrate

.PHONY: db-rollback
db-rollback: ## Rollback last migration
	$(PHP) artisan migrate:rollback

.PHONY: db-seed
db-seed: ## Seed the database
	$(PHP) artisan db:seed

.PHONY: db-fresh
db-fresh: ## Drop all tables and re-run all migrations + seeds
	$(PHP) artisan migrate:fresh --seed

##@ Cache & Optimization

.PHONY: cache-clear
cache-clear: ## Clear all caches
	$(PHP) artisan cache:clear
	$(PHP) artisan config:clear
	$(PHP) artisan route:clear
	$(PHP) artisan view:clear

.PHONY: optimize
optimize: ## Cache config, routes, and views for production
	$(PHP) artisan config:cache
	$(PHP) artisan route:cache
	$(PHP) artisan view:cache

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
	docker run --rm -p 8000:8000 --env-file .env $(DOCKER_IMAGE):$(DOCKER_TAG)

##@ CI

.PHONY: ci
ci: install lint phpstan test ## Run full CI pipeline

##@ Cleanup

.PHONY: clean
clean: ## Remove generated files and caches
	rm -rf vendor/ coverage/ bootstrap/cache/*.php storage/framework/cache/*
	rm -rf storage/framework/sessions/* storage/framework/views/*

##@ Help

.PHONY: help
help: ## Show this help
	@awk 'BEGIN {FS = ":.*##"; printf "Usage:\n  make \033[36m<target>\033[0m\n"} \
		/^[a-zA-Z_-]+:.*?## / {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2} \
		/^##@/ {printf "\n\033[1m%s\033[0m\n", substr($$0, 5)}' $(MAKEFILE_LIST)
