# Build Automation Best Practices

Reference guide for generating high-quality build automation files across four tools.

---

## 1. Makefile

### Required Preamble

Every generated Makefile MUST start with this strict preamble:

```makefile
SHELL := bash
.ONESHELL:
.SHELLFLAGS := -eu -o pipefail -c
.DELETE_ON_ERROR:
MAKEFLAGS += --warn-undefined-variables
MAKEFLAGS += --no-builtin-rules
```

**Why each line matters:**
- `SHELL := bash` — Ensures bash features work (arrays, `[[`, `<()`)
- `.ONESHELL` — Runs entire recipe in one shell invocation (variables persist across lines)
- `.SHELLFLAGS` — Fails on errors (`-e`), undefined vars (`-u`), pipe failures (`-o pipefail`)
- `.DELETE_ON_ERROR` — Removes targets if recipe fails (prevents corrupt artifacts)
- `--warn-undefined-variables` — Catches typos in variable names
- `--no-builtin-rules` — Disables implicit rules (faster, less confusing)

### Self-Documenting Pattern

Use `##` comments after targets for auto-generated help:

```makefile
.DEFAULT_GOAL := help

help: ## Show this help message
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'
```

Use `##@` for section headers:

```makefile
##@ Development
dev: ## Start development server
	...

##@ Testing
test: ## Run test suite
	...
```

Enhanced help target with sections:

```makefile
help: ## Show this help
	@awk 'BEGIN {FS = ":.*##"; printf "Usage:\n  make \033[36m<target>\033[0m\n"} \
		/^[a-zA-Z_-]+:.*?## / {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2} \
		/^##@/ {printf "\n\033[1m%s\033[0m\n", substr($$0, 5)}' $(MAKEFILE_LIST)
```

### Variable Conventions

```makefile
# Use ?= for overridable defaults
VERSION ?= $(shell git describe --tags --always --dirty 2>/dev/null || echo "dev")
COMMIT  ?= $(shell git rev-parse --short HEAD 2>/dev/null || echo "unknown")

# Use := for computed-once values
BUILD_TIME := $(shell date -u '+%Y-%m-%dT%H:%M:%SZ')

# Group related variables with comments
# --- Docker ---
DOCKER_REGISTRY ?= ghcr.io
DOCKER_IMAGE    ?= $(DOCKER_REGISTRY)/$(PROJECT)
DOCKER_TAG      ?= $(VERSION)
```

### .PHONY Rules

Always declare `.PHONY` for non-file targets. Group them near the target:

```makefile
.PHONY: build
build: ## Build the project
	...
```

Or declare all at once at the top:

```makefile
.PHONY: all build test lint clean help
```

### Anti-Patterns to Avoid

- **Never use spaces for indentation** — Makefiles require hard tabs
- **Never use `make` recursively** (`$(MAKE) -C subdir`) — Use `include` or target dependencies instead
- **Never suppress errors blindly** (`-rm ...`) — Use conditional checks or `|| true` explicitly
- **Never hardcode paths** — Use variables for tools (`GO ?= go`, `NPM ?= npm`)
- **Never put secrets in Makefiles** — Use environment variables or `.env` files
- **Avoid overly long recipes** — Extract to shell scripts if recipe exceeds ~15 lines

---

## 2. Taskfile (task)

### Required Structure

```yaml
version: '3'

output: prefixed

dotenv: ['.env', '.env.local']

vars:
  PROJECT: '{{.ROOT_DIR | base}}'
  VERSION:
    sh: git describe --tags --always --dirty 2>/dev/null || echo "dev"
```

### Task Definition Conventions

Every task MUST have a `desc` field:

```yaml
tasks:
  build:
    desc: Build the project
    cmds:
      - go build -o bin/app ./cmd/app
```

### Sources and Generates (Caching)

Use `sources` and `generates` to skip up-to-date tasks:

```yaml
tasks:
  build:
    desc: Build the project
    sources:
      - ./**/*.go
      - go.mod
      - go.sum
    generates:
      - ./bin/app
    cmds:
      - go build -o bin/app ./cmd/app
```

### Parallel Dependencies

Use `deps` for tasks that can run in parallel:

```yaml
tasks:
  ci:
    desc: Run CI pipeline
    deps: [lint, test, build]
```

Use `cmds` with `task:` for sequential execution:

```yaml
tasks:
  release:
    desc: Create a release
    cmds:
      - task: test
      - task: build
      - task: docker:push
```

### Preconditions

Guard tasks with preconditions:

```yaml
tasks:
  deploy:
    desc: Deploy to production
    preconditions:
      - sh: '[ "{{.ENV}}" = "production" ]'
        msg: "ENV must be set to 'production'"
      - sh: git diff --quiet
        msg: "Working directory must be clean"
    cmds:
      - ./deploy.sh
```

### Namespacing with Includes

```yaml
includes:
  docker:
    taskfile: ./taskfiles/Docker.yml
    dir: .
  db:
    taskfile: ./taskfiles/Database.yml
    dir: .
```

Or use colon-separated naming:

```yaml
tasks:
  docker:build:
    desc: Build Docker image
  docker:push:
    desc: Push Docker image
```

### Anti-Patterns to Avoid

- **Never omit `desc`** — Tasks without descriptions don't show in `task --list`
- **Never use `silent: true` globally** — Makes debugging impossible
- **Never hardcode OS-specific commands** — Use `{{OS}}` and `{{ARCH}}` variables
- **Never ignore `sources/generates`** — Missing caching leads to slow rebuilds
- **Avoid deeply nested includes** — Keep task graph flat and readable

---

## 3. Justfile (just)

### Required Preamble

```justfile
set shell := ["bash", "-euo", "pipefail", "-c"]
set dotenv-load
set export
set positional-arguments
```

**Why each setting matters:**
- `set shell` — Uses bash with strict mode (like Make preamble)
- `set dotenv-load` — Automatically loads `.env` file
- `set export` — Exports all variables as environment variables
- `set positional-arguments` — Allows `$1`, `$2` in recipes

### Self-Documenting Pattern

Just has built-in `--list` but enhance with groups and docs:

```justfile
# Default recipe - show help
[doc("Show available recipes")]
default:
    @just --list --unsorted
```

### Groups and Documentation

Use `[group]` to organize recipes and `[doc]` for descriptions:

```justfile
[group("development")]
[doc("Start development server with hot reload")]
dev:
    npm run dev

[group("testing")]
[doc("Run the full test suite")]
test *args:
    npm test {{args}}
```

### Variables and Expressions

```justfile
# Backtick variables (evaluated once)
version := `git describe --tags --always --dirty 2>/dev/null || echo "dev"`
commit  := `git rev-parse --short HEAD 2>/dev/null || echo "unknown"`

# Built-in functions for cross-platform
os_name := os()
arch_name := arch()

# Conditional expressions
docker_cmd := if os_name == "linux" { "docker" } else { "docker" }
```

### Parameters and Variadic Arguments

```justfile
# Required parameter
build target:
    go build -o bin/{{target}} ./cmd/{{target}}

# Optional parameter with default
deploy env="staging":
    ./deploy.sh {{env}}

# Variadic arguments
test *args:
    go test {{args}} ./...
```

### Confirmation for Dangerous Operations

```justfile
[confirm("Are you sure you want to clean all build artifacts?")]
[group("maintenance")]
[doc("Remove all build artifacts and caches")]
clean:
    rm -rf bin/ dist/ node_modules/.cache
```

### Cross-Platform Support

```justfile
# OS-specific commands
[linux]
install-deps:
    sudo apt-get install -y build-essential

[macos]
install-deps:
    brew install gcc

[windows]
install-deps:
    choco install mingw
```

### Anti-Patterns to Avoid

- **Never use `#!/usr/bin/env bash` shebang per recipe** — Use `set shell` globally
- **Never hardcode absolute paths** — Use variables and `justfile_directory()`
- **Never ignore the `[confirm]` attribute** — Always guard destructive operations
- **Never use `@` on every line** — Use `[no-exit-message]` attribute instead
- **Avoid complex logic in recipes** — Extract to shell scripts for anything over ~10 lines

---

## 4. Magefile (mage)

### Required Build Tag and Imports

```go
//go:build mage

package main

import (
    "fmt"
    "os"

    "github.com/magefile/mage/mg"
    "github.com/magefile/mage/sh"
)
```

The `//go:build mage` constraint ensures the file is only compiled by Mage, not `go build`.

### Function Documentation

Every exported function MUST have a doc comment (shown in `mage -l`):

```go
// Build compiles the project binary.
func Build() error {
    return sh.RunV("go", "build", "-o", "bin/app", "./cmd/app")
}
```

### Dependencies

Use `mg.Deps` for parallel and `mg.SerialDeps` for sequential:

```go
// CI runs the full CI pipeline (lint, test, build in parallel).
func CI() {
    mg.Deps(Lint, Test, Build)
}

// Release creates a new release (test first, then build, then publish).
func Release() error {
    mg.SerialDeps(Test, Build)
    return publish()
}
```

### Namespaces

Group related targets using namespace types:

```go
type Docker mg.Namespace

// Build creates the Docker image.
func (Docker) Build() error {
    tag := fmt.Sprintf("%s:%s", imageName(), version())
    return sh.RunV("docker", "build", "-t", tag, ".")
}

// Push pushes the Docker image to the registry.
func (Docker) Push() error {
    tag := fmt.Sprintf("%s:%s", imageName(), version())
    return sh.RunV("docker", "push", tag)
}
```

### Shell Helpers

Use `sh` package functions appropriately:

```go
// sh.Run     — run, discard output
// sh.RunV    — run, stream output to stdout (verbose)
// sh.RunWith — run with env vars
// sh.Output  — run, capture output as string

func version() string {
    v, _ := sh.Output("git", "describe", "--tags", "--always", "--dirty")
    if v == "" {
        return "dev"
    }
    return v
}
```

### Default Target and Aliases

```go
// Default target when `mage` is run without arguments.
var Default = Build

// Aliases maps short names to targets.
var Aliases = map[string]interface{}{
    "b": Build,
    "t": Test,
    "l": Lint,
}
```

### Error Handling

Always return `error` from targets that can fail:

```go
// Clean removes build artifacts.
func Clean() error {
    if err := sh.Rm("bin"); err != nil {
        return fmt.Errorf("removing bin: %w", err)
    }
    if err := sh.Rm("dist"); err != nil {
        return fmt.Errorf("removing dist: %w", err)
    }
    return nil
}
```

### Environment Variables

```go
func env(key, fallback string) string {
    if v := os.Getenv(key); v != "" {
        return v
    }
    return fallback
}

// Usage
func Deploy() error {
    target := env("DEPLOY_ENV", "staging")
    return sh.RunV("./deploy.sh", target)
}
```

### Anti-Patterns to Avoid

- **Never forget the build tag** — Without `//go:build mage`, the file breaks `go build`
- **Never use `os/exec` directly** — Always use `sh.Run*` helpers (they handle errors and output)
- **Never use `log.Fatal` or `os.Exit`** — Return errors and let Mage handle exit codes
- **Never skip doc comments** — Undocumented functions don't appear in `mage -l`
- **Never put non-mage code in the magefile** — Keep it focused on build targets
- **Avoid global state** — Use function parameters or environment variables

---

## 5. PHP-Specific Patterns

PHP projects don't have a dedicated build tool like Mage for Go. Use Makefile, Taskfile, or Justfile. The following patterns apply regardless of which tool wraps them.

### Composer as the Foundation

Always use Composer for dependency management. Detect the presence of `composer.json` and `composer.lock`:

```bash
# Install (CI-friendly, reproducible)
composer install --no-interaction --prefer-dist --optimize-autoloader

# Install for production (skip dev deps)
composer install --no-dev --no-interaction --prefer-dist --optimize-autoloader
```

### Laravel Artisan Commands

When Laravel is detected (`artisan` file exists, `laravel/framework` in composer.json), include Artisan-based targets:

```
serve       → php artisan serve
migrate     → php artisan migrate
seed        → php artisan db:seed
fresh       → php artisan migrate:fresh --seed  (DANGEROUS — guard with confirm)
tinker      → php artisan tinker
routes      → php artisan route:list
cache:clear → php artisan cache:clear + config:clear + route:clear + view:clear
optimize    → php artisan config:cache + route:cache + view:cache
```

### Symfony Console Commands

When Symfony is detected (`bin/console` exists, `symfony/framework-bundle` in composer.json):

```
serve       → symfony server:start (or php -S localhost:8000 -t public/)
migrate     → php bin/console doctrine:migrations:migrate
cache:clear → php bin/console cache:clear
routes      → php bin/console debug:router
```

### Testing Tools

| Tool | Command | Detection |
|------|---------|-----------|
| PHPUnit | `./vendor/bin/phpunit` | `phpunit.xml` or `phpunit.xml.dist` |
| Pest | `./vendor/bin/pest` | `pestphp/pest` in composer.json |
| Paratest | `./vendor/bin/paratest` | `brianium/paratest` in composer.json |

### Linting & Static Analysis

| Tool | Command | Detection |
|------|---------|-----------|
| PHP-CS-Fixer | `./vendor/bin/php-cs-fixer fix` | `.php-cs-fixer.php` or `.php-cs-fixer.dist.php` |
| PHP_CodeSniffer | `./vendor/bin/phpcs` / `phpcbf` | `phpcs.xml` or `phpcs.xml.dist` |
| PHPStan | `./vendor/bin/phpstan analyse` | `phpstan.neon` or `phpstan.neon.dist` |
| Psalm | `./vendor/bin/psalm` | `psalm.xml` or `psalm.xml.dist` |
| Pint (Laravel) | `./vendor/bin/pint` | `laravel/pint` in composer.json |

### Anti-Patterns to Avoid

- **Never run `composer install` without `--no-interaction`** in CI — it hangs on prompts
- **Never use `php artisan migrate:fresh` without a confirmation guard** — it drops all tables
- **Never hardcode `php` path** — use a variable (`PHP ?= php`) for flexibility (e.g., `php8.2`)
- **Never skip `--optimize-autoloader`** in production installs — significant performance impact
- **Never cache config in development** — `config:cache` breaks `.env` loading with `env()` calls

---

## Cross-Cutting Concerns (All Tools)

### Standard Targets

Every build file should include these core targets:

| Target | Purpose |
|--------|---------|
| `help` / `default` | Show available targets |
| `build` | Compile / bundle the project |
| `test` | Run test suite |
| `lint` | Run linters and formatters |
| `clean` | Remove build artifacts |
| `dev` | Start development server/watcher |
| `fmt` / `format` | Format source code |

### Optional Targets (include when relevant)

| Target | When to Include |
|--------|-----------------|
| `docker:build` / `docker:push` | Dockerfile exists |
| `db:migrate` / `db:seed` | Database migrations detected |
| `deploy` | CI/CD or deploy scripts detected |
| `generate` | Code generation tools detected |
| `release` | Tag-based release workflow |
| `install` / `setup` | First-time project setup |
| `ci` | Aggregate target for CI pipelines |
| `cache:clear` / `optimize` | PHP/Laravel framework detected |
| `phpstan` / `typecheck` | Static analysis tool detected |

### Variable Naming

- Use `SCREAMING_SNAKE_CASE` for Makefile and Justfile variables
- Use `PascalCase` for Taskfile vars (Go template convention)
- Use `camelCase` for Magefile variables (Go convention)

### Git Integration

Always include version/commit detection:

```
VERSION = git describe --tags --always --dirty
COMMIT  = git rev-parse --short HEAD
BUILD_TIME = date -u +%Y-%m-%dT%H:%M:%SZ
```

### .env Support

- **Makefile**: Include `-include .env` or use `$(shell cat .env | xargs)`
- **Taskfile**: Use `dotenv: ['.env']`
- **Justfile**: Use `set dotenv-load`
- **Magefile**: Use `godotenv` package or manual `os.Getenv`
