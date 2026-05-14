---
name: aif-build-automation
description: >-
  Analyze project and generate or enhance build automation file (Makefile, Taskfile.yml, Justfile, Magefile.go).
  If a build file already exists, improves it by adding missing targets and best practices.
  Use when user says "generate makefile", "create taskfile", "add justfile", "setup mage", or "build automation".
argument-hint: "[makefile|taskfile|justfile|mage]"
allowed-tools: Read Edit Glob Grep Write Bash(git *) AskUserQuestion Questions
disable-model-invocation: false
metadata:
  author: AI Factory
  version: "1.0"
  category: build-automation
---

# Build Automation Generator

Generate or enhance a build automation file for any project. Supports Makefile, Taskfile.yml, Justfile, and Magefile.go.

**Two modes:**
- **Generate** — No build file exists → create one from scratch using best-practice templates
- **Enhance** — Build file already exists → analyze gaps, add missing targets, fix anti-patterns, preserve existing work

---

## Step 0: Load Project Context

Read the project description if available:

```
Read .ai-factory/DESCRIPTION.md
```

Store the project context (tech stack, framework, architecture) for use in later steps. If the file doesn't exist, that's fine — we'll detect everything in Step 2.

**Read `.ai-factory/skill-context/aif-build-automation/SKILL.md`** — MANDATORY if the file exists.

This file contains project-specific rules accumulated by `/aif-evolve` from patches,
codebase conventions, and tech-stack analysis. These rules are tailored to the current project.

**How to apply skill-context rules:**
- Treat them as **project-level overrides** for this skill's general instructions
- When a skill-context rule conflicts with a general rule written in this SKILL.md,
  **the skill-context rule wins** (more specific context takes priority — same principle as nested CLAUDE.md files)
- When there is no conflict, apply both: general rules from SKILL.md + project rules from skill-context
- Do NOT ignore skill-context rules even if they seem to contradict this skill's defaults —
  they exist because the project's experience proved the default insufficient
- **CRITICAL:** skill-context rules apply to ALL outputs of this skill — including the generated
  build files (Makefile, Taskfile, justfile, magefile). Templates in this skill are **base structures**.
  If a skill-context rule says "build file MUST include target X" or "MUST follow convention Y" —
  you MUST comply. Generating build automation that violates skill-context rules is a bug.

**Enforcement:** After generating any output artifact, verify it against all skill-context rules.
If any rule is violated — fix the output before presenting it to the user.

---

## Step 1: Detect Existing Build Files & Determine Mode

### 1.1 Scan for Existing Build Files

Before anything else, check if the project already has build automation:

```
Glob: Makefile, makefile, GNUmakefile, Taskfile.yml, Taskfile.yaml, taskfile.yml, justfile, Justfile, .justfile, magefile.go, magefiles/*.go
```

Build a list of `EXISTING_FILES` from the results.

### 1.2 Determine Mode

**Mode A — Enhance Existing** (if `EXISTING_FILES` is not empty):

- Set `MODE = "enhance"`
- Set `TARGET_TOOL` automatically from the detected file (Makefile → `makefile`, Taskfile.yml → `taskfile`, etc.)
- If multiple build files exist AND `$ARGUMENTS` specifies one, use the argument to pick which one to enhance
- If multiple build files exist AND no argument, ask which one to enhance:

```
AskUserQuestion: This project has multiple build files. Which one should I improve?

Options (dynamic, based on what exists):
1. Makefile — Enhance the existing Makefile
2. Taskfile.yml — Enhance the existing Taskfile
...
```

- Read the existing file content — this is the baseline for enhancement
- Store as `EXISTING_CONTENT`

**Mode B — Generate New** (if `EXISTING_FILES` is empty):

- Set `MODE = "generate"`
- Parse `$ARGUMENTS` to determine tool:

| Argument | Tool | Output File |
|----------|------|-------------|
| `makefile` or `make` | GNU Make | `Makefile` |
| `taskfile` or `task` | Taskfile | `Taskfile.yml` |
| `justfile` or `just` | Just | `justfile` |
| `mage` or `magefile` | Mage | `magefile.go` |

- If `$ARGUMENTS` is empty or doesn't match, ask the user interactively:

```
AskUserQuestion: Which build automation tool do you want to generate?

Options:
1. Makefile — GNU Make (universal, no install needed)
2. Taskfile.yml — Task runner (YAML, modern, cross-platform)
3. justfile — Just command runner (simple, fast, ergonomic)
4. magefile.go — Mage (Go-native, type-safe, no shell scripts)
```

Store the chosen tool as `TARGET_TOOL`.

---

## Step 2: Analyze Project

Detect the project profile by scanning the repository with `Glob` and `Grep`. **Use the same flow for every stack:** primary language → package manager / build entrypoints → frameworks → Docker → CI → migrations → tests → linters → monorepo, then the Summary object. JVM projects are handled **inside those steps** (not a separate pipeline).

### 2.1 Primary Language

Check for these files (first match wins in the table order below). For **Java / Kotlin (JVM)**, infer language from build files: default **Java** unless Kotlin plugins / `kotlin("jvm")` / dominant `.kt` layout suggests **Kotlin**.

| File / signal | Language |
|----------------|----------|
| `go.mod` | Go |
| `package.json` | Node.js / JavaScript / TypeScript |
| `pyproject.toml` or `setup.py` or `setup.cfg` | Python |
| `Cargo.toml` | Rust |
| `composer.json` | PHP |
| `Gemfile` | Ruby |
| JVM: Gradle root or wrapper (see §2.2) | Java / Kotlin (JVM) |
| JVM: `pom.xml` | Java / Kotlin (JVM) |
| `*.csproj` or `*.sln` | C# / .NET |

### 2.2 Package manager & build entrypoints

**Lock files and wrappers (same idea as `package-lock.json` → npm):**

| File | Package manager / tool |
|------|-------------------------|
| `bun.lockb` | bun |
| `pnpm-lock.yaml` | pnpm |
| `yarn.lock` | yarn |
| `package-lock.json` | npm |
| `poetry.lock` | poetry |
| `uv.lock` | uv |
| `Pipfile.lock` | pipenv |
| `gradle/wrapper/gradle-wrapper.properties` | `./gradlew` |
| `.mvn/wrapper/maven-wrapper.properties` | `./mvnw` |

**Java / Kotlin (JVM) — Gradle vs Maven:** Detect Gradle with **one batch** of checks (single `Glob` over the paths below, or parallel existence checks — avoid redundant sequential walks):

- `settings.gradle`, `settings.gradle.kts`, `build.gradle`, `build.gradle.kts` (repo root), `gradle/wrapper/gradle-wrapper.properties`

If any Gradle signal matches → Gradle is in play. **`pom.xml`** indicates Maven. Set `PROJECT_PROFILE.java_build.build_tool` from this table:

| Condition | `build_tool` | Notes |
|-----------|--------------|--------|
| Gradle signals present | `gradle` | Wire targets to Gradle commands below. |
| No Gradle, `pom.xml` present | `maven` | Wire targets to Maven commands below. |
| Gradle **and** `pom.xml` | `gradle` | Set `java_build.mixed_maven_gradle: true` and append a **warning** to `PROJECT_PROFILE.warnings` (both builds present; recipes follow Gradle — user confirms authoritative build). |

**Concrete JVM Entrypoint:** Persist the detected entrypoint in `PROJECT_PROFILE.build_entrypoint` based on wrapper presence:
- If `build_tool` is `gradle`: use `./gradlew` if `gradlew` or `gradle/wrapper/gradle-wrapper.properties` exists, else fallback to `gradle`.
- If `build_tool` is `maven`: use `./mvnw` if `mvnw` or `.mvn/wrapper/maven-wrapper.properties` exists, else fallback to `mvn`.

**Single source of truth:** The predicate above is **the same rule** the JVM templates implement in shell (`ENTRYPOINT` / `entrypoint` — test `./gradlew` **or** `gradle/wrapper/gradle-wrapper.properties`; test `./mvnw` **or** `.mvn/wrapper/maven-wrapper.properties`). When generating or enhancing build files, set `PROJECT_PROFILE.build_entrypoint` to the **result** those tests imply (`./gradlew` vs `gradle`, `./mvnw` vs `mvn`). Do not emit a different entrypoint string than that predicate unless the user overrides (e.g. Makefile `ENTRYPOINT=…`). Templates re-resolve at recipe runtime so clones stay correct without editing.

**Version catalog:** If `gradle/libs.versions.toml` exists, set `java_build.has_version_catalog` and document `PROJECT_PROFILE.build_entrypoint` / catalog usage in comments where helpful.

**Commands to wire** into Makefile / Taskfile / Just for JVM (same role as `npm run build` / `pytest` for other stacks; use `gradlew.bat` on Windows):

| Goal | Gradle | Maven |
|------|--------|--------|
| Full compile + checks | `<build_entrypoint> build` | `<build_entrypoint> verify` |
| Unit / integration tests | `<build_entrypoint> test` | `<build_entrypoint> test` |
| Verification (tests + static analysis where configured) | `<build_entrypoint> check` | `<build_entrypoint> verify` |
| Package only | `<build_entrypoint> assemble` (or `jar` / `bootJar`) | `<build_entrypoint> package` |
| Dev server — Spring Boot (see §2.3) | `<build_entrypoint> bootRun` | `<build_entrypoint> spring-boot:run` |
| Dev server — Quarkus | `<build_entrypoint> quarkusDev` | `<build_entrypoint> quarkus:dev` |
| Dev server — Micronaut | `<build_entrypoint> run` | `<build_entrypoint> mn:run` |
| Dev server — Vert.x | `<build_entrypoint> vertxRun` | `<build_entrypoint> vertx:run` |
| Spring Boot — runnable JAR | `<build_entrypoint> bootJar` | `<build_entrypoint> package` (spring-boot repackage) |
| Clean | `<build_entrypoint> clean` | `<build_entrypoint> clean` |
| Multi-module | `<build_entrypoint> :subproject:build` | `<build_entrypoint> -pl module -am package` |

**`dev` target (templates + generated files):** Resolve the **framework dev task/goal** from the same signals as §2.3, **fixed priority** (first match wins): **Quarkus → Micronaut → Vert.x → Spring Boot**. Scan **Gradle:** `build.gradle`, `build.gradle.kts`, `settings.gradle`, `settings.gradle.kts`, `gradle/libs.versions.toml` with the same `grep -E` patterns you use for §2.3 (`quarkus` / `io.quarkus`; `micronaut` / `io.micronaut`; Vert.x Gradle plugin — `vertx-plugin` or `io.vertx.vertx`; Spring Boot — fallback). Scan **Maven:** `pom.xml` only; Vert.x Maven — `vertx-maven-plugin` or `io.reactiverse`. If the repo root is an aggregator and detection misses, override the template’s dev task variable (same idea as **`JVM_MODULE`**).

**Templates:** JVM Makefile/Taskfile/Just ship a **fixed catalog**: **`lint`** → Gradle `check` / Maven `verify`; **`fmt`** → `spotlessApply` / `spotless:apply`; **`lint-checkstyle`**, **`lint-spotbugs`**, **`lint-pmd`**, **`lint-spotless`** (Taskfile `lint:*`); **`db-migrate-liquibase`**, **`db-migrate-flyway`** (Taskfile `db:migrate:*`). Multi-module: **`module-*`** with **`JVM_MODULE`**. Step 5 **removes** catalog entries the repo does not wire (see JVM template rules).

### 2.3 Framework Detection

For Node.js projects, check `package.json` dependencies for:
- `next` → Next.js
- `nuxt` → Nuxt
- `@remix-run/node` → Remix
- `express` → Express
- `fastify` → Fastify
- `hono` → Hono
- `@nestjs/core` → NestJS

For Python projects, check `pyproject.toml` or imports for:
- `fastapi` → FastAPI
- `django` → Django
- `flask` → Flask

For PHP projects, check `composer.json` require for:
- `laravel/framework` → Laravel
- `symfony/framework-bundle` → Symfony
- `slim/slim` → Slim
- `cakephp/cakephp` → CakePHP

For Go projects, check `go.mod` for:
- `gin-gonic/gin` → Gin
- `labstack/echo` → Echo
- `gofiber/fiber` → Fiber
- `go-chi/chi` → Chi

For Rust projects, read `Cargo.toml` (workspace members and `[dependencies]` / `[workspace.dependencies]`) for:
- `axum` → Axum
- `actix-web` → Actix Web
- `rocket` → Rocket
- `warp` → Warp

For Ruby projects, read `Gemfile` for:
- `rails` → Ruby on Rails
- `sinatra` → Sinatra
- `hanami` → Hanami
- `roda` → Roda

For Java / JVM projects, read `pom.xml`, `build.gradle*`, and `gradle/libs.versions.toml` (when present) for dependencies and plugins — same discovery depth as `package.json` for Node:

- `spring-boot`, `spring-boot-starter`, `spring-boot-parent` → Spring Boot
- `grpc`, `protobuf`, `spring-grpc` or `*.proto` in repo → gRPC / protobuf
- `quarkus`, `io.quarkus` → Quarkus
- `micronaut` → Micronaut
- `vertx` / Vert.x stack → Vert.x
- `liquibase` in deps or `db.changelog*` → Liquibase (see §2.6)
- Flyway `org.flywaydb` / `flyway-core` / `flyway-maven-plugin` / Flyway Gradle plugin in `pom.xml`, `build.gradle*`, or `gradle/libs.versions.toml` → Flyway (see §2.6)
- Prefer **Jakarta** (`jakarta.*`) for Java 9+ / Spring Boot 3+; flag legacy `javax.*` migration if both appear

Map findings into `framework` / `java_build` flags (`spring_boot`, `grpc`, `liquibase`, `flyway`) like other ecosystems map Express vs NestJS.

### 2.4 Docker (Deep Scan)

```
Glob: Dockerfile, Dockerfile.*, docker-compose.yml, docker-compose.yaml, compose.yml, compose.yaml, .dockerignore
```

If any exist, set `HAS_DOCKER=true` and perform a deeper analysis:

**Read the Dockerfile(s)** to detect:
- Multi-stage builds (separate `dev` / `prod` stages) → `DOCKER_MULTISTAGE=true`
- Exposed ports → `DOCKER_PORTS` (e.g., `3000`, `8080`)
- Base image → `DOCKER_BASE` (e.g., `node:20-alpine`, `golang:1.22`)
- Entrypoint/CMD → understand how the app is started inside the container

**Read docker-compose / compose file** to detect:
- Service names → `DOCKER_SERVICES` (e.g., `app`, `db`, `redis`, `worker`)
- Volume mounts → understand dev vs prod setup
- Profiles (if any) → `dev`, `production`, `test`
- Dependency services (postgres, redis, rabbitmq, etc.) → `DOCKER_DEPS`

Store as `DOCKER_PROFILE`:
- `has_compose`: boolean
- `has_multistage`: boolean
- `services`: list of service names
- `deps`: list of infrastructure services (db, cache, queue)
- `ports`: exposed ports
- `has_dev_stage`: boolean (Dockerfile has a `dev` or `development` stage)

### 2.5 CI/CD

```
Glob: .github/workflows/*.yml, .gitlab-ci.yml, .circleci/config.yml, Jenkinsfile, .travis.yml
```

Note which CI system is in use.

### 2.6 Database & Migrations

Search for migration tools:

```
Grep: prisma|drizzle|knex|typeorm|sequelize|alembic|django.*migrate|goose|migrate|atlas|sqlx|liquibase|flyway
```

Check for:
- `prisma/schema.prisma` → Prisma
- `drizzle.config.ts` → Drizzle
- `alembic/` directory → Alembic
- `migrations/` directory → Generic migrations
- Liquibase — `db.changelog*`, `liquibase` in Gradle/Maven or resources → Liquibase (JVM and others); set **`java_build.liquibase: true`**
- Flyway — dependency or plugin (`org.flywaydb`, `flyway-core`, `flyway-maven-plugin`, Flyway Gradle plugin) in `pom.xml`, `build.gradle*`, or `gradle/libs.versions.toml`; set **`java_build.flyway: true`**

### 2.7 Test Framework

| Language | Check For |
|----------|-----------|
| Node.js | `jest`, `vitest`, `mocha`, `ava` in package.json |
| Python | `pytest` in pyproject.toml/requirements, `unittest` imports |
| Go | Go has built-in testing; check for `testify` in go.mod |
| Rust | Built-in; check for integration test directory `tests/` |
| Ruby | `rspec` in Gemfile → RSpec; `minitest` / `minitest-` gems → Minitest; else default `rake test` when `Rakefile` exists |
| Java / Kotlin (JVM) | `junit-jupiter`, `junit-jupiter-api`, `JUnitPlatform`, `JUnit5`, `testcontainers`, `mockito`, `rest-assured`, `cucumber` in Gradle/Maven / `libs.versions.toml` |

### 2.8 Linters & Formatters

Scan for formatter/linter configs (EditorConfig, Checkstyle on JVM, ESLint/Prettier/Biome, Python tools, PHP, Go, Rust, Ruby):

```
Glob: .eslintrc*, eslint.config.*, .prettierrc*, biome.json, biome.jsonc, .golangci.yml, .golangci.yaml
Glob: checkstyle.xml, .checkstyle.xml, config/checkstyle/checkstyle.xml, .editorconfig
Glob: ruff.toml, .ruff.toml, .flake8, phpcs.xml, phpcs.xml.dist
Glob: rustfmt.toml, .rustfmt.toml, clippy.toml, .rubocop.yml, .rubocop_todo.yml, .standard.yml
Grep in pyproject.toml: ruff|black|flake8|pylint|isort
Grep in build.gradle*, pom.xml: spotless|spotbugs|pmd|errorprone|checkstyle (when not covered by config files alone)
```

Merge JVM matches into **`PROJECT_PROFILE.linters`** as normalized ids (e.g. `checkstyle`, `spotless`, `spotbugs`, `pmd`, `errorprone`) for use when wiring **`lint`** / **`fmt`** targets (Step 5).

### 2.9 Monorepo Detection

```
Glob: turbo.json, nx.json, lerna.json, pnpm-workspace.yaml
```

### Summary

Build a `PROJECT_PROFILE` object with:
- `language`: primary language
- `package_manager`: detected PM (npm, pnpm, Gradle, Maven, …)
- `build_entrypoint`: the exact entrypoint command detected (e.g. `./gradlew`, `mvn`, `npm`, `cargo`)
- `framework`: detected framework (if any); JVM frameworks map here the same way as NestJS or Django
- `warnings`: optional string array (e.g. mixed Maven+Gradle from §2.2)
- `java_build`: optional — when language is JVM: `{ build_tool: "gradle"|"maven", mixed_maven_gradle?: boolean, has_version_catalog: boolean, spring_boot: boolean, grpc: boolean, liquibase: boolean, flyway: boolean }`
- `has_docker`: boolean
- `docker_profile`: `DOCKER_PROFILE` object (if `has_docker`)
- `ci_system`: detected CI (if any)
- `has_migrations`: boolean + tool name
- `test_framework`: detected test runner
- `linters`: list of detected linters
- `is_monorepo`: boolean
- `has_dev_server`: boolean (framework with dev server)

---

## Step 3: Read Best Practices

Read the best practices reference for the chosen tool:

```
Read skills/aif-build-automation/references/BEST-PRACTICES.md
```

Focus on the section matching `TARGET_TOOL`:
- Makefile → Section 1
- Taskfile → Section 2
- Justfile → Section 3
- Magefile → Section 4

Also read the "Cross-Cutting Concerns" section for standard targets.

---

## Step 4: Select & Read Template

Pick the closest matching template based on `language` + `TARGET_TOOL`:

| Tool | Go | Node.js | Python | PHP | Rust | Ruby | Java / JVM | Other |
|------|----|---------|--------|-----|------|------|------------|------------------------|
| Makefile | `makefile-go.mk` | `makefile-node.mk` | `makefile-python.mk` | `makefile-php.mk` | `makefile-rust.mk` | `makefile-ruby.mk` | `makefile-gradle.mk` or `makefile-maven.mk` | Use closest match |
| Taskfile | `taskfile-go.yml` | `taskfile-node.yml` | `taskfile-python.yml` | `taskfile-php.yml` | `taskfile-rust.yml` | `taskfile-ruby.yml` | `taskfile-gradle.yml` or `taskfile-maven.yml` | Use closest match |
| Justfile | `justfile-go` | `justfile-node` | `justfile-python` | `justfile-php` | `justfile-rust` | `justfile-ruby` | `justfile-gradle` or `justfile-maven` | Use closest match |
| Magefile | `magefile-basic.go` | `magefile-full.go` | `magefile-full.go` | N/A (use Makefile) | N/A (use Makefile) | N/A (use Makefile) | N/A (use Makefile) | N/A (use Makefile) |

For Java / JVM, select the Gradle or Maven template based on `PROJECT_PROFILE.java_build.build_tool`.

If `language` is **not** among Go, Node.js, Python, PHP, Rust, Ruby, or Java / JVM in the table above, use the **Node.js** template as the structural fallback and adapt it to the detected `build_entrypoint` and language conventions (e.g., `dotnet build`).

For Magefile: use `magefile-full.go` if `HAS_DOCKER` or `has_migrations` is true, otherwise `magefile-basic.go`.

For PHP, Rust, Ruby, or Java/JVM + Magefile: Mage is Go-specific and not generally applicable to these stacks. If the user explicitly requested `mage` for such a project, explain this and suggest Makefile as the closest alternative (universal, no install needed). Ask via `AskUserQuestion` whether to proceed with Makefile instead.

Read the selected template:

```
Read skills/aif-build-automation/templates/<selected-template>
```

---

## Step 5: Generate or Enhance File

### Mode B — Generate New File

Using the `PROJECT_PROFILE`, best practices, and template as reference, generate a customized build file from scratch.

#### Generation Rules

1. **Start with the tool's required preamble** (from best practices)
2. **Include all standard targets** from the selected template (help/default, build, test, lint, clean, dev, fmt, `ci`). **JVM:** the template is a **complete catalog**; prune targets in Mode B per Step 5 JVM rules (do not invent one-off `lint` recipes).
3. **Add conditional targets** based on project profile:
   - Docker targets → only if `has_docker`
   - Database targets → only if `has_migrations` (non-JVM); **JVM:** use the canonical **`db-migrate-liquibase`** / **`db-migrate-flyway`** (or Taskfile `db:migrate:*`) **only when** the matching **`java_build`** flag is true — omit the other
   - Deploy targets → only if CI/CD detected
   - Generate target → only if code generation detected
   - Typecheck target → only if TypeScript or mypy detected
4. **Use correct package manager** — match `PROJECT_PROFILE` (§2.2): JVM → `<build_entrypoint>` (from §2.2); Node → npm/pnpm/yarn/bun; Python → uv/poetry/pip; Go → `go`; Rust → `cargo`; Ruby → Bundler (`bundle`, `bundle exec`); do not substitute the wrong ecosystem (e.g. npm scripts for a Gradle-only repo)
5. **Include CI aggregate target** — default **`ci`** = **clean** + **build** on JVM (already runs `check`/`verify`); add **`lint`** / **`fmt`** to **`ci`** only if those targets remain after pruning
6. **Follow the template's structure** for organization and grouping
7. **Adapt variable names** to match the actual project (module name, binary name, source dirs); **JVM multi-module** repos → set **`JVM_MODULE`** for `module-*` targets (§2.2)
8. **Include version/commit/build-time** detection via git
9. **Docker-aware targets** — if `has_docker`, generate a dedicated Docker section (see below)

**JVM template catalog (fixed names; prune unused tools in Mode B)** — Source of truth is **`skills/aif-build-automation/templates/*gradle*`** and **`*maven*`**. Always use these **exact** Gradle/Maven task names in generated files unless the build files use a different official task name for the same plugin (document in a comment next to the recipe).

| Target (Make/Just) | Taskfile task | Gradle command | Maven command |
|--------------------|---------------|----------------|---------------|
| `lint` | `lint` | `check` | `verify` |
| `fmt` | `fmt` | `spotlessApply` | `spotless:apply` |
| `lint-checkstyle` | `lint:checkstyle` | `checkstyleMain` | `checkstyle:check` |
| `lint-spotbugs` | `lint:spotbugs` | `spotbugsMain` | `spotbugs:check` |
| `lint-pmd` | `lint:pmd` | `pmdMain` | `pmd:check` |
| `lint-spotless` | `lint:spotless` | `spotlessCheck` | `spotless:check` |
| `db-migrate-liquibase` | `db:migrate:liquibase` | `liquibaseUpdate` | `liquibase:update` |
| `db-migrate-flyway` | `db:migrate:flyway` | `flywayMigrate` | `flyway:migrate` |
| `dev` | `dev` | see §2.2 dev tasks + template `DEV_GRADLE_TASK` resolver (§2.3 priority) | see §2.2 dev goals + template `DEV_MAVEN_GOAL` resolver (§2.3 priority) |

- **Mode B (generate):** Copy the catalog from the template, then **delete** targets whose tools are **absent**: e.g. remove **`lint-checkstyle`** if `checkstyle` ∉ **`linters`**; remove **`lint-spotbugs`** / **`lint-pmd`** if those ids are missing; remove **`fmt`** and **`lint-spotless`** if **`spotless`** ∉ **`linters`**; remove **`db-migrate-liquibase`** if not **`java_build.liquibase`**; remove **`db-migrate-flyway`** if not **`java_build.flyway`**. **Always keep** **`lint`** (= `check` / `verify`) unless the project truly has no Java plugin lifecycle (rare). Never substitute **`verify -DskipTests`** or **`check -x test`** as `lint`. For **`dev`**, templates already resolve the task/goal from build files; when enhancing, replace a wrong constant **`bootRun`** / **`spring-boot:run`** with the correct framework command from **`PROJECT_PROFILE`** (same strings as the template resolver).
- **Mode A (enhance):** Prefer missing catalog targets over ad-hoc names; remove recipes that contradict **`java_build`** / **`linters`**.

#### Docker-Aware Target Generation

When `has_docker` is true, generate **two layers** of commands:

**Layer 1 — Container lifecycle** (always when Docker detected):

| Target | Purpose |
|--------|---------|
| `docker-build` or `docker:build` | Build the Docker image |
| `docker-run` or `docker:run` | Run the container |
| `docker-stop` or `docker:stop` | Stop running containers |
| `docker-logs` or `docker:logs` | Tail container logs |
| `docker-push` or `docker:push` | Push image to registry |
| `docker-clean` or `docker:clean` | Remove images and stopped containers |

**Layer 2 — Dev vs Production separation** (when compose or multistage detected):

```
##@ Docker — Development
docker-dev:          ## Start all services in dev mode (with hot reload, mounted volumes)
docker-dev-build:    ## Rebuild dev containers
docker-dev-down:     ## Stop dev environment and remove volumes

##@ Docker — Production
docker-prod-build:   ## Build production image (optimized, multi-stage)
docker-prod-run:     ## Run production container locally for testing
docker-prod-push:    ## Push production image to registry
```

**Generation logic:**

- If `has_compose` → use `docker compose` commands (not `docker-compose`)
- If compose has profiles → use `--profile dev` / `--profile production`
- If `has_multistage` → use `--target dev` for dev builds, no target (or `--target production`) for prod
- If `docker_profile.deps` exist (db, redis, etc.) → add `infra-up` / `infra-down` targets to start/stop only infrastructure services without the app
- If compose detected → `docker-dev` should run `docker compose up` with correct profile/services
- If no compose but Dockerfile → `docker-dev` should run `docker build --target dev` + `docker run` with volume mounts

**Layer 3 — Container-based commands** (mirror host commands via container):

When the project is Docker-based, also generate container-exec variants so that users who run everything in Docker can use the same targets:

```
# Run tests inside the container
docker-test:         ## Run tests inside the Docker container
  docker compose exec app [test command]

# Run linter inside the container
docker-lint:         ## Run linter inside the Docker container
  docker compose exec app [lint command]

# Open shell in the container
docker-shell:        ## Open a shell inside the running container
  docker compose exec app sh
```

Only generate `docker-*` exec variants if the project appears to be Docker-first (compose file mounts source code as volumes, or no local language runtime setup is apparent).

#### Customization from Project Profile

- **JVM (`java_build` / Gradle or Maven)**: Use **`PROJECT_PROFILE.build_entrypoint`** from §2.2 Summary for every tool invocation. **Quality and DB:** use only the **canonical target names and task names** from the JVM template catalog (Step 5 table); when enhancing, add/remove recipes to match **`java_build`** and **`linters`**, not one-off guesses.
- **Binary name**: Use the actual project name from `go.mod`, `package.json`, or directory name
- **Source directory**: Use actual src dir (e.g., `src/`, `app/`, `cmd/`)
- **Dev server command**: Match the framework (e.g., `next dev`, `uvicorn --reload`, `air`; JVM → **`build_entrypoint`** plus the §2.2 dev task for the detected stack — Quarkus `quarkusDev` / `quarkus:dev`, Micronaut `run` / `mn:run`, Vert.x `vertxRun` / `vertx:run`, Spring Boot `bootRun` / `spring-boot:run`)
- **Test command**: Match the detected test runner (§2.7)
- **Lint command (JVM)**: After pruning, **`lint`** must remain **`check`** / **`verify`**; per-tool rows use the Step 5 catalog table
- **Migration commands (JVM)**: Use **`db-migrate-liquibase`** vs **`db-migrate-flyway`** (or Taskfile **`db:migrate:*`**) per **`java_build`**
- **Port numbers**: Use framework defaults (3000 for Node, 8000 for Python, 8080 for Go)

### Mode A — Enhance Existing File

When `MODE = "enhance"`, do NOT replace the file from scratch. Instead, analyze it and improve it surgically.

#### 5A.1 Analyze Existing File

Compare `EXISTING_CONTENT` against the `PROJECT_PROFILE` and best practices. Build a gap analysis:

**Missing preamble/config** — Check if the file has the recommended preamble:
- Makefile: `SHELL := bash`, `.ONESHELL`, `.SHELLFLAGS`, `.DELETE_ON_ERROR`, `MAKEFLAGS`
- Taskfile: `version: '3'`, `output:`, `dotenv:`
- Justfile: `set shell`, `set dotenv-load`, `set export`
- Magefile: `//go:build mage`, proper imports

**Missing standard targets** — Check which of these are absent:
- `help` / `default` (self-documenting)
- `build`, `test`, `lint`, `clean`, `dev`, `fmt`, and JVM catalog targets (`lint-checkstyle`, `db-migrate-flyway`, …) **after** template pruning
- `ci` (aggregate target)

**Missing project-specific targets** — Based on `PROJECT_PROFILE`, check for:
- Docker targets (if `has_docker` but no docker targets in file)
- Database: canonical **`db-migrate-*`** / **`db:migrate:*`** matching **`java_build`**
- Typecheck target (if TypeScript/mypy detected but no typecheck target)
- Generate target (if code generation tools detected)
- Coverage target (if test target exists but no coverage variant)
- JVM: `build` / `test` / `check` delegating to `<build_entrypoint>` when `java_build` is set (not only generic shell or wrong ecosystem)
- JVM multi-module: `module-build` / `module-test` / `module-check` (or Taskfile `module:*`) when the repo is a Gradle multi-project or Maven reactor and per-module commands are useful

**Quality issues** — Check for anti-patterns from best practices:
- **JVM:** recipes that are **not** in the Step 5 catalog table (or wrong tool on a recipe, e.g. Liquibase task on a Flyway-only repo) — replace with catalog names or delete
- Targets without descriptions/documentation
- Missing `.PHONY` declarations (Makefile)
- Hardcoded tool paths that should be variables
- Missing version/commit detection
- No self-documenting help target

#### 5A.2 Plan Changes

Build a list of specific changes to make:

```
CHANGES = [
  { type: "add_preamble", detail: "Add .SHELLFLAGS and .DELETE_ON_ERROR" },
  { type: "add_target", name: "docker-build", detail: "Dockerfile detected but no docker target" },
  { type: "add_target", name: "help", detail: "No self-documenting help target" },
  { type: "fix_quality", detail: "Add ## comments to 3 targets missing descriptions" },
  { type: "add_variable", detail: "Add VERSION/COMMIT detection via git" },
  ...
]
```

#### 5A.3 Apply Changes

- **Preserve the existing structure** — Keep the user's ordering, naming, and style
- **Preserve existing targets exactly** — Do NOT modify working targets unless fixing a clear bug or adding a missing description
- **Add new targets in the appropriate section** — Follow the existing grouping pattern (if the file uses `##@` sections, add to matching section; if no sections, append logically)
- **Add missing preamble lines** at the top, before existing content
- **Add missing variables** near existing variable declarations
- Use the template as reference for the syntax of new targets, but adapt to match the style already present in the file (e.g., if existing Makefile uses tabs + simple recipes, don't introduce complex multi-line scripts)

### Quality Checks (Both Modes)

Before writing the file, verify:
- [ ] All targets have descriptions/documentation (## comments, desc:, [doc()], doc comments)
- [ ] No hardcoded paths that should be variables
- [ ] Package manager / build entrypoint detection matches the repo (Gradle/Maven wrappers, npm/pnpm, etc.)
- [ ] Self-documenting help target is included
- [ ] `.PHONY` declarations for all non-file targets (Makefile only)
- [ ] Dangerous operations have confirmations (Justfile) or warnings

---

## Step 6: Write File & Report

### 6.1 Write the File

**Mode B (Generate New):**

Write the generated content using the `Write` tool:

| Tool | Output Path |
|------|-------------|
| Makefile | `Makefile` |
| Taskfile | `Taskfile.yml` |
| Justfile | `justfile` |
| Magefile | `magefile.go` |

**Mode A (Enhance Existing):**

Write the enhanced content to the same path where the existing file was found (preserving the original filename casing and location). The file is updated in-place — no need to ask about overwriting since we're improving, not replacing.

### 6.2 Display Summary

Display summary using format from `references/SUMMARY-FORMAT.md`. Shows targets table, project profile used, and quick start command for Mode B (generate), or what changed + new/existing targets for Mode A (enhance). Include installation hints if the tool requires setup.

---

## Step 7: Project Documentation Integration

After writing the build file, integrate quick commands into project docs.
For detailed integration procedures (README, AGENTS.md, existing markdown) → read `references/DOC-INTEGRATION.md`

Brief: scan for existing command sections, update or append quick reference, suggest AGENTS.md creation if missing.

## Artifact Ownership and Config Policy

- Primary ownership: generated or enhanced build automation files (`Makefile`, `Taskfile.yml`, `justfile`, `magefile.go`).
- Allowed companion updates: quick command snippets in existing docs or `AGENTS.md` when directly tied to the generated build workflow.
- Config policy: config-agnostic by design. This skill uses repository detection and fixed AI Factory context files rather than `config.yaml`.
