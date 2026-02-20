# Summary Display Formats

## Mode B (Generate New) — show what was created:

```
## Generated: [Filename]

### Targets
| Target | Description |
|--------|-------------|
| build  | Compile the project binary |
| test   | Run test suite |
| lint   | Run golangci-lint |
| ...    | ... |

### Project Profile Used
- Language: Go
- Package Manager: go modules
- Framework: Chi
- Docker: yes
- Migrations: goose
- Linters: golangci-lint

### Quick Start
  [tool-specific run command, e.g., "make help", "task --list", "just", "mage -l"]
```

## Mode A (Enhance Existing) — show what was changed:

```
## Enhanced: [Filename]

### What Changed
- Added missing preamble: `.SHELLFLAGS`, `.DELETE_ON_ERROR`
- Added `help` target with self-documenting pattern
- Added `docker-build` and `docker-push` targets (Dockerfile detected)
- Added `db-migrate` target (Prisma detected)
- Added `##` descriptions to 3 existing targets
- Added VERSION/COMMIT variables via git

### New Targets Added
| Target | Description |
|--------|-------------|
| help   | Show available targets |
| docker-build | Build Docker image |
| db-migrate   | Run Prisma migrations |

### Existing Targets (unchanged)
| Target | Description |
|--------|-------------|
| build  | Build the project |
| test   | Run tests |
| ...    | ... |
```

## Installation Hint (both modes)

If the tool requires installation, include a note:

```
### Installation
  [install instructions for task/just/mage if not already installed]
```

Installation hints:
- **Task**: `go install github.com/go-task/task/v3/cmd/task@latest` or `brew install go-task`
- **Just**: `cargo install just` or `brew install just`
- **Mage**: `go install github.com/magefile/mage@latest` or `brew install mage`
- **Make**: Usually pre-installed; `brew install make` on macOS for GNU Make 4+
