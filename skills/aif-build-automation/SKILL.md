---
name: aif-build-automation
description: >-
  Analyze project and generate or enhance build automation file (Makefile, Taskfile.yml, Justfile, Magefile.go).
  If a build file already exists, improves it by adding missing targets and best practices.
  Use when user says "generate makefile", "create taskfile", "add justfile", "setup mage", or "build automation".
argument-hint: "[makefile|taskfile|justfile|mage]"
allowed-tools: Read Edit Glob Grep Write Bash(git *) AskUserQuestion Questions
disable-model-invocation: true
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

Detect the project profile by scanning the repository. Run these checks using `Glob` and `Grep`:

### 2.1 Primary Language

Check for these files (first match wins):

| File | Language |
|------|----------|
| `go.mod` | Go |
| `package.json` | Node.js / JavaScript / TypeScript |
| `pyproject.toml` or `setup.py` or `setup.cfg` | Python |
| `Cargo.toml` | Rust |
| `composer.json` | PHP |
| `Gemfile` | Ruby |
| `build.gradle` or `pom.xml` | Java/Kotlin |
| `*.csproj` or `*.sln` | C# / .NET |

### 2.2 Package Manager

Check lock files:

| File | Package Manager |
|------|-----------------|
| `bun.lockb` | bun |
| `pnpm-lock.yaml` | pnpm |
| `yarn.lock` | yarn |
| `package-lock.json` | npm |
| `poetry.lock` | poetry |
| `uv.lock` | uv |
| `Pipfile.lock` | pipenv |

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
Grep: prisma|drizzle|knex|typeorm|sequelize|alembic|django.*migrate|goose|migrate|atlas|sqlx
```

Check for:
- `prisma/schema.prisma` → Prisma
- `drizzle.config.ts` → Drizzle
- `alembic/` directory → Alembic
- `migrations/` directory → Generic migrations

### 2.7 Test Framework

| Language | Check For |
|----------|-----------|
| Node.js | `jest`, `vitest`, `mocha`, `ava` in package.json |
| Python | `pytest` in pyproject.toml/requirements, `unittest` imports |
| Go | Go has built-in testing; check for `testify` in go.mod |
| Rust | Built-in; check for integration test directory `tests/` |

### 2.8 Linters & Formatters

```
Glob: .eslintrc*, eslint.config.*, .prettierrc*, biome.json, .golangci.yml, .golangci.yaml
Grep in pyproject.toml: ruff|black|flake8|pylint|isort
```

### 2.9 Monorepo Detection

```
Glob: turbo.json, nx.json, lerna.json, pnpm-workspace.yaml
```

### Summary

Build a `PROJECT_PROFILE` object with:
- `language`: primary language
- `package_manager`: detected PM
- `framework`: detected framework (if any)
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
Read skills/build-automation/references/BEST-PRACTICES.md
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

| Tool | Go | Node.js | Python | PHP | Other |
|------|----|---------|--------|-----|-------|
| Makefile | `makefile-go.mk` | `makefile-node.mk` | `makefile-python.mk` | `makefile-php.mk` | Use closest match |
| Taskfile | `taskfile-go.yml` | `taskfile-node.yml` | `taskfile-python.yml` | `taskfile-php.yml` | Use closest match |
| Justfile | `justfile-go` | `justfile-node` | `justfile-python` | `justfile-php` | Use closest match |
| Magefile | `magefile-basic.go` | `magefile-full.go` | `magefile-full.go` | N/A (use Makefile) | `magefile-basic.go` |

For Magefile: use `magefile-full.go` if `HAS_DOCKER` or `has_migrations` is true, otherwise `magefile-basic.go`.

For PHP + Magefile: Mage is Go-specific and not applicable to PHP projects. If the user explicitly requested `mage` for a PHP project, explain this and suggest Makefile as the closest alternative (universal, no install needed). Ask via `AskUserQuestion` whether to proceed with Makefile instead.

Read the selected template:

```
Read skills/build-automation/templates/<selected-template>
```

---

## Step 5: Generate or Enhance File

### Mode B — Generate New File

Using the `PROJECT_PROFILE`, best practices, and template as reference, generate a customized build file from scratch.

#### Generation Rules

1. **Start with the tool's required preamble** (from best practices)
2. **Include all standard targets**: help/default, build, test, lint, clean, dev, fmt
3. **Add conditional targets** based on project profile:
   - Docker targets → only if `has_docker`
   - Database targets → only if `has_migrations` (use correct migration tool)
   - Deploy targets → only if CI/CD detected
   - Generate target → only if code generation detected
   - Typecheck target → only if TypeScript or mypy detected
4. **Use correct package manager** commands (not hardcoded npm/pip/go)
5. **Include CI aggregate target** that runs lint + test + build
6. **Follow the template's structure** for organization and grouping
7. **Adapt variable names** to match the actual project (module name, binary name, source dirs)
8. **Include version/commit/build-time** detection via git
9. **Docker-aware targets** — if `has_docker`, generate a dedicated Docker section (see below)

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

- **Binary name**: Use the actual project name from `go.mod`, `package.json`, or directory name
- **Source directory**: Use actual src dir (e.g., `src/`, `app/`, `cmd/`)
- **Dev server command**: Match the framework's dev server (e.g., `next dev`, `uvicorn --reload`, `air`)
- **Test command**: Match the detected test runner
- **Lint command**: Match the detected linters
- **Migration commands**: Match the detected migration tool exactly
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
- `build`, `test`, `lint`, `clean`, `dev`, `fmt`
- `ci` (aggregate target)

**Missing project-specific targets** — Based on `PROJECT_PROFILE`, check for:
- Docker targets (if `has_docker` but no docker targets in file)
- Database/migration targets (if `has_migrations` but no db targets)
- Typecheck target (if TypeScript/mypy detected but no typecheck target)
- Generate target (if code generation tools detected)
- Coverage target (if test target exists but no coverage variant)

**Quality issues** — Check for anti-patterns from best practices:
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
- [ ] Package manager detection is correct
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
