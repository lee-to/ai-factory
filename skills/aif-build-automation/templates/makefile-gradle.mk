# --- Makefile for JVM Projects (Gradle) ---
# Usage: make [target]

SHELL := bash
.ONESHELL:
.SHELLFLAGS := -eu -o pipefail -c
.DELETE_ON_ERROR:
MAKEFLAGS += --warn-undefined-variables
MAKEFLAGS += --no-builtin-rules

# --- Project ---
PROJECT ?= $(shell basename $(CURDIR))

# --- Entrypoint ---
# Will be resolved to ./gradlew or gradle during generation
ENTRYPOINT ?= ./gradlew

# --- Git ---
VERSION    ?= $(shell git describe --tags --always --dirty 2>/dev/null || echo "dev")
COMMIT     ?= $(shell git rev-parse --short HEAD 2>/dev/null || echo "unknown")
BUILD_TIME := $(shell date -u '+%Y-%m-%dT%H:%M:%SZ')

# --- Docker ---
DOCKER_REGISTRY ?= ghcr.io
DOCKER_IMAGE    ?= $(DOCKER_REGISTRY)/$(PROJECT)
DOCKER_TAG      ?= $(VERSION)

# ============================================================================
.DEFAULT_GOAL := help

##@ Development

.PHONY: clean
clean: ## Remove build artifacts
	$(ENTRYPOINT) clean

.PHONY: compile
compile: ## Compile source code
	$(ENTRYPOINT) compileJava

.PHONY: assemble
assemble: ## Build project and package artifacts (JAR/WAR)
	$(ENTRYPOINT) assemble

.PHONY: build
build: ## Full build including tests and checks
	$(ENTRYPOINT) build

.PHONY: dev
dev: ## Run application locally (Spring Boot/Quarkus/etc)
	$(ENTRYPOINT) bootRun

##@ Testing

.PHONY: test
test: ## Run unit tests
	$(ENTRYPOINT) test

.PHONY: check
check: ## Run tests and static analysis
	$(ENTRYPOINT) check

##@ Code Quality

.PHONY: lint
lint: ## Run linter/static analysis
	$(ENTRYPOINT) checkstyleMain

.PHONY: fmt
fmt: ## Format source code
	$(ENTRYPOINT) spotlessApply

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
db-migrate: ## Run database migrations (Liquibase/Flyway)
	$(ENTRYPOINT) liquibaseUpdate

##@ CI

.PHONY: ci
ci: clean check assemble ## Run full CI pipeline locally

##@ Help

.PHONY: help
help: ## Show this help
	@awk 'BEGIN {FS = ":.*##"; printf "Usage:\n  make \033[36m<target>\033[0m\n"} \
		/^[a-zA-Z_-]+:.*?## / {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2} \
		/^##@/ {printf "\n\033[1m%s\033[0m\n", substr($$0, 5)}' $(MAKEFILE_LIST)
