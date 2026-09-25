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

## AI Review

The `AI Review` workflow sends signed requests to the project's VPS runner.
Opening a PR from this repository automatically requests its first review.
For fork PRs, a trusted maintainer must request review explicitly.

Trusted users can post these commands in a PR comment:

- `/code-review` — review the current PR head.
- `/fix` — apply fixes from the latest review verdict.
- `/code-review-and-fix` — review, then apply fixes.

Repository administrators configure four GitHub Actions secrets:

| Secret | Value |
| --- | --- |
| `RUNNER_URL` | HTTPS review endpoint on the VPS, ending in `/review` |
| `RUNNER_HMAC_SECRET` | The signing secret configured on the runner |
| `RUNNER_GH_PAT` | PAT granting this repository Contents, Pull requests and Issues read/write, plus Metadata read |
| `RUNNER_TRUSTED_USERS` | JSON array of GitHub logins allowed to invoke commands, such as `["lee-to"]` |

The runner needs a PAT because processing continues after the Actions job ends.
Keep secret values out of the repository. Missing runner secrets skip dispatch
with a warning; an empty trusted-users list disables comment commands.
A successful Actions job confirms that the runner accepted the request;
the review or fixes arrive asynchronously on the PR.

The repository-specific review instructions live in
[`ai-review/pr-review/SKILL.md`](ai-review/pr-review/SKILL.md), outside the npm
package's built-in skills. Deploy that directory to the runner's mounted
`projects/lee-to-ai-factory/skills/pr-review` directory. Its `runner.yml` entry
uses `name: lee-to/ai-factory`, `default_agent: codex`, and a `review` action with
`skill_path: /projects/lee-to-ai-factory/skills/pr-review`,
`review_mode: checkout`, and `posts_own_comment: true`. Include the repository
in `ALLOW_REPOS` as well. Fix actions use the runner's existing fallback behavior.
Workflow comment triggers become available after the workflow reaches the
default branch (`2.x`).

## Reporting Issues

Open an issue at [github.com/lee-to/ai-factory/issues](https://github.com/lee-to/ai-factory/issues). 
