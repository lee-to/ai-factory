---
name: aif-deploy
description: Prepare and execute deployments with pre-flight checks, release notes generation, and CI/CD integration. NEVER auto-deploy. Use when user explicitly says "deploy", "release", or "go live".
argument-hint: "[staging|production]"
allowed-tools: Bash(git *) Bash(npm *) Bash(docker *) Bash(gh *)
disable-model-invocation: true
---

# Deployment Assistant

Help prepare and execute deployments safely with automated checks and documentation.

## Behavior

### Without Arguments (Pre-flight Checks Only)

Run deployment readiness checks:

1. **Git Status Check**
   - Ensure working directory is clean
   - Verify on correct branch
   - Check if branch is up to date with remote

2. **Build Check**
   - Run build command (`npm run build`, `cargo build`, etc.)
   - Report any build errors

3. **Test Check**
   - Run test suite
   - Report coverage if available

4. **Environment Check**
   - Verify required environment variables
   - Check `.env.example` vs actual env

5. **Dependency Check**
   - Look for security vulnerabilities (`npm audit`, etc.)
   - Check for outdated critical packages

### With Environment Argument

#### `/aif-deploy staging`

1. Run pre-flight checks
2. Generate changelog since last staging deploy
3. Provide deployment commands for staging environment
4. Tag release as staging-{date}

#### `/aif-deploy production`

1. Run ALL pre-flight checks (more strict)
2. Require clean git status
3. Require all tests passing
4. Generate full release notes
5. Create git tag for release
6. Provide production deployment commands

## Pre-flight Check Output

```markdown
## Deployment Readiness Check

### Git Status
✅ Working directory clean
✅ On branch: main
✅ Up to date with origin/main

### Build
✅ Build successful
⏱️ Build time: 45s

### Tests
✅ All tests passing (142/142)
📊 Coverage: 78%

### Environment
✅ All required variables set
⚠️ Optional: SENTRY_DSN not set

### Dependencies
✅ No known vulnerabilities
⚠️ 3 packages have updates available

## Verdict: ✅ Ready for deployment
```

## Release Notes Generation

When deploying, generate release notes from:
- Git commits since last tag/release
- Merged PR titles and descriptions
- Conventional commit messages

Format:
```markdown
## Release v1.2.3

### Features
- feat(auth): Add OAuth2 support (#45)
- feat(api): New user endpoints (#48)

### Bug Fixes
- fix(ui): Correct button alignment (#46)

### Other Changes
- chore(deps): Update dependencies
- docs: Update API documentation
```

## CI/CD Integration

Detect and provide commands for:

- **Vercel**: `vercel --prod`
- **Netlify**: `netlify deploy --prod`
- **Railway**: `railway up`
- **Docker**: Build and push commands
- **Kubernetes**: `kubectl apply` commands
- **GitHub Actions**: Trigger workflow

## Safety Features

- Never auto-deploy to production
- Always show diff of what will be deployed
- Require confirmation for destructive actions
- Suggest rollback commands
- Log deployment actions

## Examples

**User:** `/aif-deploy`
Run all pre-flight checks, report readiness.

**User:** `/aif-deploy staging`
Prepare staging deployment with changelog.

**User:** `/aif-deploy production`
Full production deployment workflow with release notes.
