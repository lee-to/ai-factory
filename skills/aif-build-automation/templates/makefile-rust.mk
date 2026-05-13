# --- Makefile for Rust Projects ---
# Usage: make [target]

SHELL := bash
.ONESHELL:
.SHELLFLAGS := -eu -o pipefail -c
.DELETE_ON_ERROR:
MAKEFLAGS += --warn-undefined-variables
MAKEFLAGS += --no-builtin-rules

# --- Project ---
PROJECT    ?= $(shell basename $(CURDIR))
CARGO      ?= cargo
CARGOFLAGS ?=

# --- Git ---
VERSION    ?= $(shell git describe --tags --always --dirty 2>/dev/null || echo "dev")
COMMIT     ?= $(shell git rev-parse --short HEAD 2>/dev/null || echo "unknown")

# --- Docker ---
DOCKER_REGISTRY ?= ghcr.io
DOCKER_IMAGE    ?= $(DOCKER_REGISTRY)/$(PROJECT)
DOCKER_TAG      ?= $(VERSION)

# --- Tools ---
CLIPPYFLAGS ?= -D warnings

# ============================================================================
.DEFAULT_GOAL := help

##@ Development

.PHONY: build
build: ## Build the workspace (debug)
	$(CARGO) build $(CARGOFLAGS)

.PHONY: build-release
build-release: ## Build release binaries
	$(CARGO) build --release $(CARGOFLAGS)

.PHONY: run
run: ## Run the default binary (cargo run)
	$(CARGO) run $(CARGOFLAGS)

.PHONY: dev
dev: ## Watch and rebuild (requires cargo-watch)
	$(CARGO) watch -x check -x test

.PHONY: check
check: ## Fast compile check without producing binaries
	$(CARGO) check $(CARGOFLAGS)

##@ Testing

.PHONY: test
test: ## Run tests
	$(CARGO) test $(CARGOFLAGS)

.PHONY: test-doc
test-doc: ## Run documentation tests
	$(CARGO) test --doc $(CARGOFLAGS)

##@ Code Quality

.PHONY: lint
lint: ## Run clippy
	$(CARGO) clippy --all-targets --all-features -- $(CLIPPYFLAGS)

.PHONY: fmt
fmt: ## Format with rustfmt
	$(CARGO) fmt

.PHONY: fmt-check
fmt-check: ## Verify formatting (CI)
	$(CARGO) fmt -- --check

.PHONY: doc
doc: ## Build rustdoc locally
	$(CARGO) doc --no-deps $(CARGOFLAGS)

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
ci: fmt-check lint test build ## Run full CI pipeline

##@ Cleanup

.PHONY: clean
clean: ## Remove build artifacts
	$(CARGO) clean

##@ Help

.PHONY: help
help: ## Show this help
	@awk 'BEGIN {FS = ":.*##"; printf "Usage:\n  make \033[36m<target>\033[0m\n"} \
		/^[a-zA-Z_-]+:.*?## / {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2} \
		/^##@/ {printf "\n\033[1m%s\033[0m\n", substr($$0, 5)}' $(MAKEFILE_LIST)
