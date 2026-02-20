# Skill Examples

Real-world examples of well-structured skills.

## Example 1: Code Review Skill

```yaml
---
name: code-review
description: Performs comprehensive code review checking for bugs, security issues, performance problems, and style violations. Use when reviewing pull requests, commits, or specific files.
argument-hint: [file-or-directory]
allowed-tools: Read Grep Glob Bash(git diff *)
---

# Code Review

Review $ARGUMENTS for:

## 1. Correctness
- Logic errors
- Edge cases
- Null/undefined handling
- Type mismatches

## 2. Security
- Input validation
- SQL injection
- XSS vulnerabilities
- Sensitive data exposure

## 3. Performance
- N+1 queries
- Unnecessary loops
- Memory leaks
- Blocking operations

## 4. Style
- Naming conventions
- Code organization
- Documentation
- Test coverage

Output format:
- List issues by severity (Critical > High > Medium > Low)
- Include file:line references
- Suggest specific fixes
```

## Example 2: Deployment Skill

```yaml
---
name: deploy
description: Deploy application to production with safety checks and rollback capability.
disable-model-invocation: true
context: fork
allowed-tools: Bash(git *) Bash(npm *) Bash(docker *) Bash(kubectl *)
argument-hint: [environment]
---

# Deployment

Deploy to $ARGUMENTS environment:

## Pre-flight Checks
1. Verify all tests pass: `npm test`
2. Check for uncommitted changes: `git status`
3. Verify on correct branch: `git branch --show-current`
4. Pull latest changes: `git pull origin main`

## Build
1. Install dependencies: `npm ci`
2. Build application: `npm run build`
3. Run smoke tests: `npm run test:smoke`

## Deploy
1. Tag release: `git tag -a v$(date +%Y%m%d-%H%M%S)`
2. Push to registry: `docker push`
3. Deploy to cluster: `kubectl apply`

## Verify
1. Check pod status: `kubectl get pods`
2. Verify health endpoint: `curl /health`
3. Monitor logs for errors

## Rollback (if needed)
```bash
kubectl rollout undo deployment/app
```
```

## Example 3: Visual Report Skill

```yaml
---
name: test-coverage
description: Generate interactive HTML test coverage report with charts and drill-down. Use after running tests or when analyzing test quality.
allowed-tools: Bash(python *) Bash(npm test *)
---

# Test Coverage Report

Generate coverage visualization:

1. Run tests with coverage:
   ```bash
   npm test -- --coverage --coverageReporters=json
   ```

2. Generate visual report:
   ```bash
   python ~/{{skills_dir}}/test-coverage/scripts/visualize.py coverage/coverage-final.json
   ```

3. Opens `coverage-report.html` in browser

The report shows:
- Overall coverage percentage
- File-by-file breakdown
- Uncovered line highlighting
- Trend over time (if history available)
```

## Example 4: Research Skill

```yaml
---
name: architecture-analysis
description: Analyze codebase architecture, identify patterns, layers, and potential issues. Use when onboarding to a new project or reviewing system design.
context: fork
agent: Explore
user-invocable: false
---

# Architecture Analysis

When analyzing a codebase:

1. **Identify Structure**
   - Find entry points
   - Map directory organization
   - Identify frameworks/libraries

2. **Map Layers**
   - Presentation/UI
   - Business logic
   - Data access
   - Infrastructure

3. **Analyze Dependencies**
   - Internal module coupling
   - External dependencies
   - Circular dependencies

4. **Check Patterns**
   - Design patterns used
   - Architectural style (MVC, DDD, etc.)
   - Anti-patterns present

5. **Generate Report**
   - Architecture diagram (ASCII)
   - Layer breakdown
   - Recommendations
```

## Example 5: Dynamic Context Skill

```yaml
---
name: pr-review
description: Review current pull request with full context from GitHub.
context: fork
agent: Explore
allowed-tools: Bash(gh *)
---

# PR Review

## Context
(Use dynamic context syntax: exclamation + backtick + command + backtick)
- PR diff: gh pr diff
- PR description: gh pr view
- Changed files: gh pr diff --name-only
- CI status: gh pr checks

## Review Checklist

Based on the changes above:

1. **Code Quality**
   - Review each changed file
   - Check for bugs/issues
   - Verify test coverage

2. **PR Hygiene**
   - Clear title and description
   - Appropriate size
   - Linked issues

3. **Output**
   - Summary of changes
   - Issues found (if any)
   - Approval recommendation
```

## Example 6: Template-Based Skill

```yaml
---
name: api-endpoint
description: Generate new API endpoint with controller, service, tests, and documentation. Use when adding new REST endpoints.
argument-hint: [resource-name] [http-method]
allowed-tools: Read Write Grep Glob
---

# API Endpoint Generator

Generate endpoint for `$0` with method `$1`:

1. Read existing patterns in codebase
2. Generate files from templates:
   - Controller: `src/controllers/${resource}Controller.ts`
   - Service: `src/services/${resource}Service.ts`
   - Test: `tests/${resource}.test.ts`
   - Types: `src/types/${resource}.ts`

3. Follow conventions in [templates/api-endpoint.md](templates/api-endpoint.md)

4. Register route in router

5. Update API documentation
```
