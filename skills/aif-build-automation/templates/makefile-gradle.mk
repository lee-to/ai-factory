# --- Makefile for JVM Projects (Gradle) ---
# Usage: make [target]
# Canonical quality/migration targets; remove recipes your build.gradle does not wire (see SKILL Step 5).

SHELL := bash
.ONESHELL:
.SHELLFLAGS := -eu -o pipefail -c
.DELETE_ON_ERROR:
MAKEFLAGS += --warn-undefined-variables
MAKEFLAGS += --no-builtin-rules

# --- Project ---
PROJECT ?= $(shell basename $(CURDIR))

# --- Entrypoint ---
ENTRYPOINT ?= $(shell if [ -f ./gradlew ]; then echo "./gradlew"; else echo "gradle"; fi)

# --- Git ---
VERSION    ?= $(shell git describe --tags --always --dirty 2>/dev/null || echo "dev")
COMMIT     ?= $(shell git rev-parse --short HEAD 2>/dev/null || echo "unknown")

# --- Docker ---
DOCKER_REGISTRY ?= ghcr.io
DOCKER_IMAGE    ?= $(DOCKER_REGISTRY)/$(PROJECT)
DOCKER_TAG      ?= $(VERSION)

# --- Multi-module (set JVM_MODULE to subproject id, e.g. export JVM_MODULE=api) ---
JVM_MODULE ?= change-me-subproject

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
check: ## Run tests and static analysis (Gradle lifecycle)
	$(ENTRYPOINT) check

##@ Multi-module

.PHONY: module-build
module-build: ## Build one subproject (Gradle :JVM_MODULE:build)
	$(ENTRYPOINT) :$(JVM_MODULE):build

.PHONY: module-test
module-test: ## Tests for one subproject
	$(ENTRYPOINT) :$(JVM_MODULE):test

.PHONY: module-check
module-check: ## Check one subproject (tests + static analysis)
	$(ENTRYPOINT) :$(JVM_MODULE):check

##@ Code Quality

.PHONY: lint
lint: check ## Full verification (delegates to Gradle `check`)

.PHONY: fmt
fmt: ## Apply Spotless (`spotlessApply`)
	$(ENTRYPOINT) spotlessApply

.PHONY: lint-checkstyle
lint-checkstyle: ## Checkstyle (`checkstyleMain`)
	$(ENTRYPOINT) checkstyleMain

.PHONY: lint-spotbugs
lint-spotbugs: ## SpotBugs (`spotbugsMain`)
	$(ENTRYPOINT) spotbugsMain

.PHONY: lint-pmd
lint-pmd: ## PMD (`pmdMain`)
	$(ENTRYPOINT) pmdMain

.PHONY: lint-spotless
lint-spotless: ## Spotless check only, no write (`spotlessCheck`)
	$(ENTRYPOINT) spotlessCheck

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

.PHONY: db-migrate-liquibase
db-migrate-liquibase: ## Liquibase update (`liquibaseUpdate`)
	$(ENTRYPOINT) liquibaseUpdate

.PHONY: db-migrate-flyway
db-migrate-flyway: ## Flyway migrate (`flywayMigrate`; adjust if plugin uses another task name)
	$(ENTRYPOINT) flywayMigrate

##@ CI

.PHONY: ci
ci: clean build ## Clean then full Gradle build

##@ Help

.PHONY: help
help: ## Show this help
	@awk 'BEGIN {FS = ":.*##"; printf "Usage:\n  make \033[36m<target>\033[0m\n"} \
		/^[a-zA-Z_-]+:.*?## / {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2} \
		/^##@/ {printf "\n\033[1m%s\033[0m\n", substr($$0, 5)}' $(MAKEFILE_LIST)
