# --- Makefile for Ruby (Bundler) Projects ---
# Usage: make [target]

SHELL := bash
.ONESHELL:
.SHELLFLAGS := -eu -o pipefail -c
.DELETE_ON_ERROR:
MAKEFLAGS += --warn-undefined-variables
MAKEFLAGS += --no-builtin-rules

# --- Project ---
PROJECT  ?= $(shell basename $(CURDIR))
BUNDLE   ?= bundle

# --- Git ---
VERSION    ?= $(shell git describe --tags --always --dirty 2>/dev/null || echo "dev")
COMMIT     ?= $(shell git rev-parse --short HEAD 2>/dev/null || echo "unknown")

# --- Docker ---
DOCKER_REGISTRY ?= ghcr.io
DOCKER_IMAGE    ?= $(DOCKER_REGISTRY)/$(PROJECT)
DOCKER_TAG      ?= $(VERSION)

# --- Rails (uncomment / adapt if using Rails) ---
# RAILS := $(BUNDLE) exec rails

# ============================================================================
.DEFAULT_GOAL := help

##@ Development

.PHONY: install
install: ## Install gems (bundle install)
	$(BUNDLE) install

.PHONY: update
update: ## Update gems
	$(BUNDLE) update

.PHONY: dev
dev: ## Start app (override per project: rails server, rackup, etc.)
	$(BUNDLE) exec ruby -S rackup -o 0.0.0.0 -p 9292

.PHONY: console
console: ## Rails console (requires rails)
	$(BUNDLE) exec rails console

##@ Testing

.PHONY: test
test: ## Run tests (RSpec — use rake test if project uses Minitest)
	$(BUNDLE) exec rspec

.PHONY: test-rake
test-rake: ## Run via Rake
	$(BUNDLE) exec rake test

##@ Code Quality

.PHONY: lint
lint: ## Rubocop (no auto-correct)
	$(BUNDLE) exec rubocop

.PHONY: lint-fix
lint-fix: ## Rubocop auto-correct
	$(BUNDLE) exec rubocop -A

.PHONY: fmt
fmt: lint-fix ## Alias for RuboCop auto-correct

.PHONY: check
check: lint test ## Static checks + tests

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

##@ CI

.PHONY: ci
ci: install lint test ## Run full CI pipeline

##@ Cleanup

.PHONY: clean
clean: ## Remove bundled artifacts / tmp (adjust per app server)
	rm -rf tmp/ log/*.log

##@ Help

.PHONY: help
help: ## Show this help
	@awk 'BEGIN {FS = ":.*##"; printf "Usage:\n  make \033[36m<target>\033[0m\n"} \
		/^[a-zA-Z_-]+:.*?## / {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2} \
		/^##@/ {printf "\n\033[1m%s\033[0m\n", substr($$0, 5)}' $(MAKEFILE_LIST)
