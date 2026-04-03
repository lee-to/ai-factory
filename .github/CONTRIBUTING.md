# Contributing to AI Factory

Thanks for your interest in contributing! This guide will help you get started.

## Prerequisites

- Node.js >= 18
- npm
- Git

## Setup

1. Fork the repository on GitHub
2. Clone your fork:

```bash
git clone https://github.com/<your-username>/ai-factory.git
cd ai-factory
```

3. Install dependencies and build:

```bash
npm install
npm run build
```

To use your local build as a global CLI:

```bash
npm run link
```

## Development

```bash
# Build the project
npm run build

# Watch mode (rebuild on changes)
npm run watch

# Run tests
npm run test

# Lint (unused exports + dead code)
npm run lint
```

## Project Structure

```
src/
├── cli/       # CLI commands and entry point
├── core/      # Core logic (skill loading, config, etc.)
└── utils/     # Shared utilities
skills/        # Built-in agent skills (each has SKILL.md)
scripts/       # Build and test scripts
examples/      # Usage examples
```

Each skill lives in `skills/<skill-name>/` and contains a `SKILL.md` file that defines the skill's behavior following the [Agent Skills](https://agentskills.io) spec.

## Reporting Issues

Open an issue at [github.com/lee-to/ai-factory/issues](https://github.com/lee-to/ai-factory/issues). 
