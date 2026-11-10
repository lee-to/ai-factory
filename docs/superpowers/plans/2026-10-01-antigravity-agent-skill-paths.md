# Antigravity 2.0 Agent Skill Path Format Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Update all Antigravity 2.0 native agent manifests to declare skill dependencies as paths (`skills/<skill-name>`) instead of bare skill names, matching Google Antigravity custom-agent schema and resolving PR #166 review blocker.

**Architecture:**
1. In `subagents/antigravity/agents/*.md`, update the `skills:` frontmatter section across all 10 agent manifests to prefix declared skills with `skills/` (e.g. `skills/aif-plan` instead of `aif-plan`).
2. In `scripts/test-antigravity-e2e.mjs`, add explicit schema validation ensuring all installed Antigravity subagents declare skills using the documented `skills/<name>` path format.
3. Validate full build, linter, Antigravity E2E tests, user lifecycle simulation, and overall test suite.

**Tech Stack:** YAML frontmatter in Markdown, Node.js E2E test runner (`scripts/test-antigravity-e2e.mjs`).

**Spec:** PR #166 author review (`lee-to` review finding on commit `4d4dc971a8a5512ad529139bfd2761e0e31c5ffd`), [Antigravity Custom Agent Schema](https://antigravity.google/docs/subagents?tab=cli).

## Global Constraints

- **Schema Compliance:** All declared skills in Antigravity agent manifests (`subagents/antigravity/agents/*.md`) MUST use the relative path form `skills/<name>`.
- **Integrity & Formatting:** Preserve all prompt text, frontmatter keys, indentation, and comments in agent manifests.
- **Zero Regressions:** Must pass `npm run build`, `npm run lint`, `npm run test:antigravity`, `npm run test:simulate`, and `npm test`.

---

### Task 1: Add Skill Path Schema Assertions to Antigravity E2E Tests

**Files:**
- Modify: `scripts/test-antigravity-e2e.mjs:146-152`
- Test: `scripts/test-antigravity-e2e.mjs`

**Interfaces:**
- Consumes:
  - Installed subagents in `.agents/agents/*.md` generated during `ai-factory init --agents antigravity`
- Produces:
  - E2E validation verifying that every declared skill in subagent frontmatter starts with `skills/`

- [ ] **Step 1: Add failing assertion to `scripts/test-antigravity-e2e.mjs`**

Add check to the subagent loop in Test 2:
```javascript
    // Verify Antigravity runtime skill path format contract (skills/aif-* rather than bare names)
    const skillsMatch = content.match(/skills:\s*\n((?:\s*-\s*[^\n]+\n)+)/);
    if (skillsMatch) {
      const declaredSkills = skillsMatch[1]
        .split('\n')
        .map(line => line.replace(/^\s*-\s*/, '').trim())
        .filter(Boolean);
      for (const skill of declaredSkills) {
        assert(
          skill.startsWith('skills/'),
          `Subagent ${subagent} skill "${skill}" must use path format "skills/<name>"`,
        );
      }
    }
```

- [ ] **Step 2: Run test to verify it fails as expected**

Run: `node scripts/test-antigravity-e2e.mjs`
Expected: FAIL with `AssertionError: Subagent best-practices-sidecar.md skill "aif-best-practices" must use path format "skills/<name>"`

---

### Task 2: Update All 10 Antigravity Agent Manifests to `skills/<name>`

**Files:**
- Modify: `subagents/antigravity/agents/best-practices-sidecar.md`
- Modify: `subagents/antigravity/agents/commit-preparer.md`
- Modify: `subagents/antigravity/agents/docs-auditor.md`
- Modify: `subagents/antigravity/agents/implement-coordinator.md`
- Modify: `subagents/antigravity/agents/implement-worker.md`
- Modify: `subagents/antigravity/agents/plan-coordinator.md`
- Modify: `subagents/antigravity/agents/plan-polisher.md`
- Modify: `subagents/antigravity/agents/review-sidecar.md`
- Modify: `subagents/antigravity/agents/rules-sidecar.md`
- Modify: `subagents/antigravity/agents/security-sidecar.md`

**Interfaces:**
- Produces:
  - Valid Antigravity 2.0 subagent manifests with path-prefixed skill references:
    - `best-practices-sidecar.md` -> `skills/aif-best-practices`
    - `commit-preparer.md` -> `skills/aif-commit`
    - `docs-auditor.md` -> `skills/aif-docs`
    - `implement-coordinator.md` -> `skills/aif-implement`, `skills/aif-verify`, `skills/aif-docs`, `skills/aif-commit`
    - `implement-worker.md` -> `skills/aif-implement`, `skills/aif-verify`, `skills/aif-docs`, `skills/aif-review`
    - `plan-coordinator.md` -> `skills/aif-plan`, `skills/aif-explore`, `skills/aif-roadmap`
    - `plan-polisher.md` -> `skills/aif-plan`, `skills/aif-improve`
    - `review-sidecar.md` -> `skills/aif-review`
    - `rules-sidecar.md` -> `skills/aif-rules-check`
    - `security-sidecar.md` -> `skills/aif-security-checklist`

- [ ] **Step 1: Update single-skill sidecars**
  - Update `best-practices-sidecar.md` (`skills/aif-best-practices`)
  - Update `commit-preparer.md` (`skills/aif-commit`)
  - Update `docs-auditor.md` (`skills/aif-docs`)
  - Update `review-sidecar.md` (`skills/aif-review`)
  - Update `rules-sidecar.md` (`skills/aif-rules-check`)
  - Update `security-sidecar.md` (`skills/aif-security-checklist`)

- [ ] **Step 2: Update multi-skill coordinators and workers**
  - Update `implement-coordinator.md` (`skills/aif-implement`, `skills/aif-verify`, `skills/aif-docs`, `skills/aif-commit`)
  - Update `implement-worker.md` (`skills/aif-implement`, `skills/aif-verify`, `skills/aif-docs`, `skills/aif-review`)
  - Update `plan-coordinator.md` (`skills/aif-plan`, `skills/aif-explore`, `skills/aif-roadmap`)
  - Update `plan-polisher.md` (`skills/aif-plan`, `skills/aif-improve`)

- [ ] **Step 3: Run `node scripts/test-antigravity-e2e.mjs` to verify it passes**

Run: `node scripts/test-antigravity-e2e.mjs`
Expected: PASS (all 16/16 test scenarios pass)

---

### Task 3: Full Verification and Regression Gate

**Files:**
- None (verification run)

**Interfaces:**
- Consumes: Built package and all test runners
- Produces: Clean zero-error verification evidence

- [ ] **Step 1: Run TypeScript build**
Run: `npm run build`
Expected: PASS (exit code 0)

- [ ] **Step 2: Run linter checks**
Run: `npm run lint`
Expected: PASS (0 unused symbols, 0 dead exports, exit code 0)

- [ ] **Step 3: Run Antigravity E2E tests**
Run: `npm run test:antigravity`
Expected: PASS (16/16 scenarios passed)

- [ ] **Step 4: Run Real-World Lifecycle Simulations**
Run: `npm run test:simulate`
Expected: PASS (20/20 lifecycle simulations passed)

- [ ] **Step 5: Run Skills Smoke Tests**
Run: `npm test`
Expected: PASS (155/155 tests passed)
