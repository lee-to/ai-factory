# --- Makefile for JVM Projects (Maven) ---
# Usage: make [target]
# Canonical quality/migration targets; remove recipes your pom/plugins do not define (see SKILL Step 5).

SHELL := bash
.ONESHELL:
.SHELLFLAGS := -eu -o pipefail -c
.DELETE_ON_ERROR:
MAKEFLAGS += --warn-undefined-variables
MAKEFLAGS += --no-builtin-rules

# --- Project ---
PROJECT ?= $(shell basename $(CURDIR))

# --- Entrypoint ---
ENTRYPOINT ?= $(shell if [ -f ./mvnw ] || [ -f .mvn/wrapper/maven-wrapper.properties ]; then echo "./mvnw"; else echo "mvn"; fi)

# --- Dev goal (§2.3): Quarkus > Micronaut > Vert.x > Spring Boot; override DEV_MAVEN_GOAL=… if parent POM omits deps ---
DEV_MAVEN_GOAL ?= $(shell if ! test -f pom.xml; then printf %s spring-boot:run; exit 0; fi; if grep -qE 'quarkus|io\.quarkus' pom.xml 2>/dev/null; then printf %s quarkus:dev; exit 0; fi; if grep -qE 'micronaut|io\.micronaut' pom.xml 2>/dev/null; then printf %s mn:run; exit 0; fi; if grep -qE 'vertx-maven-plugin|io\.reactiverse' pom.xml 2>/dev/null; then printf %s vertx:run; exit 0; fi; printf %s spring-boot:run)

# --- Git ---
VERSION    ?= $(shell git describe --tags --always --dirty 2>/dev/null || echo "dev")
COMMIT     ?= $(shell git rev-parse --short HEAD 2>/dev/null || echo "unknown")

# --- Docker ---
DOCKER_REGISTRY ?= ghcr.io
DOCKER_IMAGE    ?= $(DOCKER_REGISTRY)/$(PROJECT)
DOCKER_TAG      ?= $(VERSION)

# --- Multi-module (set JVM_MODULE to Maven module id / artifact dir, e.g. export JVM_MODULE=api) ---
JVM_MODULE ?= change-me-subproject

# ============================================================================
.DEFAULT_GOAL := help

##@ Development

.PHONY: clean
clean: ## Remove build artifacts
	$(ENTRYPOINT) clean

.PHONY: assemble
assemble: ## Build project and package artifacts (JAR/WAR)
	$(ENTRYPOINT) package

.PHONY: build
build: ## Full build including tests and checks (`verify`)
	$(ENTRYPOINT) verify

.PHONY: dev
dev: ## Run application locally (framework from §2.3 scan)
	$(ENTRYPOINT) $(DEV_MAVEN_GOAL)

##@ Testing

.PHONY: test
test: ## Run unit tests
	$(ENTRYPOINT) test

.PHONY: check
check: ## Run tests and static analysis (`verify`)
	$(ENTRYPOINT) verify

##@ Multi-module

.PHONY: module-build
module-build: ## Package one reactor subtree (-pl JVM_MODULE -am package)
	$(ENTRYPOINT) -pl $(JVM_MODULE) -am package

.PHONY: module-test
module-test: ## Tests for one reactor subtree
	$(ENTRYPOINT) -pl $(JVM_MODULE) -am test

.PHONY: module-check
module-check: ## Verify one reactor subtree
	$(ENTRYPOINT) -pl $(JVM_MODULE) -am verify

##@ Code Quality

.PHONY: lint
lint: check ## Full verification (delegates to Maven `verify`)

.PHONY: fmt
fmt: ## Apply Spotless (`spotless:apply`)
	$(ENTRYPOINT) spotless:apply

.PHONY: lint-checkstyle
lint-checkstyle: ## Checkstyle (`checkstyle:check`)
	$(ENTRYPOINT) checkstyle:check

.PHONY: lint-spotbugs
lint-spotbugs: ## SpotBugs (`spotbugs:check`)
	$(ENTRYPOINT) spotbugs:check

.PHONY: lint-pmd
lint-pmd: ## PMD (`pmd:check`)
	$(ENTRYPOINT) pmd:check

.PHONY: lint-spotless
lint-spotless: ## Spotless check only, no write (`spotless:check`)
	$(ENTRYPOINT) spotless:check

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
db-migrate-liquibase: ## Liquibase (`liquibase:update`)
	$(ENTRYPOINT) liquibase:update

.PHONY: db-migrate-flyway
db-migrate-flyway: ## Flyway (`flyway:migrate`)
	$(ENTRYPOINT) flyway:migrate

##@ CI

.PHONY: ci
ci: clean build ## Clean then full Maven verify

##@ Help

.PHONY: help
help: ## Show this help
	@awk 'BEGIN {FS = ":.*##"; printf "Usage:\n  make \033[36m<target>\033[0m\n"} \
		/^[a-zA-Z_-]+:.*?## / {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2} \
		/^##@/ {printf "\n\033[1m%s\033[0m\n", substr($$0, 5)}' $(MAKEFILE_LIST)
