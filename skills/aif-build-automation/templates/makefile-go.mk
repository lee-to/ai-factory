# --- Makefile for Go Projects ---
# Usage: make [target]

SHELL := bash
.ONESHELL:
.SHELLFLAGS := -eu -o pipefail -c
.DELETE_ON_ERROR:
MAKEFLAGS += --warn-undefined-variables
MAKEFLAGS += --no-builtin-rules

# --- Project ---
PROJECT   ?= $(shell basename $(CURDIR))
GO        ?= go
GOFLAGS   ?=
LDFLAGS   ?= -s -w

# --- Git ---
VERSION   ?= $(shell git describe --tags --always --dirty 2>/dev/null || echo "dev")
COMMIT    ?= $(shell git rev-parse --short HEAD 2>/dev/null || echo "unknown")
BUILD_TIME := $(shell date -u '+%Y-%m-%dT%H:%M:%SZ')

# --- Build ---
MODULE     := $(shell head -1 go.mod | awk '{print $$2}')
BIN_DIR    := bin
MAIN_PKG   ?= ./cmd/$(PROJECT)
BINARY     := $(BIN_DIR)/$(PROJECT)
LDFLAGS    += -X $(MODULE)/internal/version.Version=$(VERSION)
LDFLAGS    += -X $(MODULE)/internal/version.Commit=$(COMMIT)
LDFLAGS    += -X $(MODULE)/internal/version.BuildTime=$(BUILD_TIME)

# --- Docker ---
DOCKER_REGISTRY ?= ghcr.io
DOCKER_IMAGE    ?= $(DOCKER_REGISTRY)/$(PROJECT)
DOCKER_TAG      ?= $(VERSION)

# --- Tools ---
GOLANGCI_LINT ?= golangci-lint
GOTEST        ?= $(GO) test
GOTESTFLAGS   ?= -race -count=1

# ============================================================================
.DEFAULT_GOAL := help

##@ Development

.PHONY: build
build: ## Build the binary
	$(GO) build $(GOFLAGS) -ldflags '$(LDFLAGS)' -o $(BINARY) $(MAIN_PKG)

.PHONY: run
run: build ## Build and run
	$(BINARY)

.PHONY: dev
dev: ## Run with hot reload (requires air)
	air

.PHONY: generate
generate: ## Run go generate
	$(GO) generate ./...

##@ Testing

.PHONY: test
test: ## Run tests
	$(GOTEST) $(GOTESTFLAGS) ./...

.PHONY: test-cover
test-cover: ## Run tests with coverage report
	$(GOTEST) $(GOTESTFLAGS) -coverprofile=coverage.out ./...
	$(GO) tool cover -html=coverage.out -o coverage.html
	@echo "Coverage report: coverage.html"

.PHONY: test-integration
test-integration: ## Run integration tests
	$(GOTEST) $(GOTESTFLAGS) -tags=integration ./...

.PHONY: bench
bench: ## Run benchmarks
	$(GO) test -bench=. -benchmem ./...

##@ Code Quality

.PHONY: lint
lint: ## Run linters
	$(GOLANGCI_LINT) run ./...

.PHONY: fmt
fmt: ## Format code
	$(GO) fmt ./...
	goimports -w .

.PHONY: vet
vet: ## Run go vet
	$(GO) vet ./...

.PHONY: tidy
tidy: ## Tidy and verify go.mod
	$(GO) mod tidy
	$(GO) mod verify

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
ci: lint test build ## Run full CI pipeline

##@ Cleanup

.PHONY: clean
clean: ## Remove build artifacts
	rm -rf $(BIN_DIR) coverage.out coverage.html

##@ Help

.PHONY: help
help: ## Show this help
	@awk 'BEGIN {FS = ":.*##"; printf "Usage:\n  make \033[36m<target>\033[0m\n"} \
		/^[a-zA-Z_-]+:.*?## / {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2} \
		/^##@/ {printf "\n\033[1m%s\033[0m\n", substr($$0, 5)}' $(MAKEFILE_LIST)
