---
name: aif-review
description: Perform code review on staged changes or a pull request. Checks for bugs, security issues, performance problems, and best practices. Use when user says "review code", "check my code", "review PR", or "is this code okay". The +check flag validates findings via a fresh-context subagent; validation also runs automatically when the review produced confidence markers.
argument-hint: "[PR number | branch/commit/tag | empty] [+check]"
allowed-tools: Bash(git *) Bash(gh *) Read Glob Grep Task Agent AskUserQuestion
disable-model-invocation: false
---

# Code Review Assistant

Perform thorough code reviews focusing on correctness, security, performance, and maintainability.

## Step 0: Load Config

**FIRST:** Read `.ai-factory/config.yaml` if it exists to resolve:
- **Paths:** `paths.description`, `paths.architecture`, `paths.rules_file`, `paths.roadmap`, and `paths.rules`
- **Language:** `language.ui` for review summary language
- **Git:** `git.base_branch` for branch comparison guidance

If config.yaml doesn't exist, use defaults:
- Paths: `.ai-factory/` for all artifacts
- Language: `en` (English)
- Git: `base_branch: main`

## Behavior

### Argument flags

Before routing the argument string into one of the modes below, extract any standalone tokens that flag optional behavior. Strip them from the argument string and route the remainder normally.

- `+check` — runs the optional findings validator after the review is produced. The full procedure (when to run, failure modes, output additions, gate-result recomputation) lives in `references/CHECK-MODE.md`. The validator runs when this token is present **or** when the review produced at least one confidence marker — see "Resolving markers before the gate" below. For a marker-free review the flag is the only trigger, so nothing is dispatched unless it is given. The token may appear before or after the main argument (e.g. `/aif-review +check`, `/aif-review 123 +check`, `/aif-review main +check`).

If the leftover argument string is empty, fall back to the empty-argument mode (staged review). Unknown `+`-prefixed tokens are passed through as part of the main argument so they are not silently consumed.

> Edge case: a git ref literally named `+check` will be consumed by the flag stripper — acceptable compromise.

### Without Arguments (Review Staged Changes)

1. Run `git diff --cached` to get staged changes
2. If nothing staged, run `git diff` for unstaged changes
3. Analyze each file's changes

### With PR Number/URL

1. Use `gh pr view <number> --json` to get PR details
2. Use `gh pr diff <number>` to get the diff
3. Review all changes in the PR

### With Git Ref (Commits Mode)

Argument routing chain:
1. **Empty** → staged review (see above)
2. **Digits or `#N`** → PR mode (see above)
3. **Everything else** → validate via `git rev-parse --verify` → commits mode or ask user

Validation:
```bash
git rev-parse --verify <argument> 2>/dev/null
```

- **Valid ref** → enter commits mode (steps below)
- **Invalid ref** → do NOT fall back to staged review silently. Ask the user to clarify:

  ```
  AskUserQuestion: `<argument>` is not a valid git ref. What did you mean?

  Options:
  1. Review staged changes instead
  2. Cancel
  ```

  **Based on choice:**
  - "Review staged changes" → run staged review (default mode)
  - "Cancel" → inform the user that review was cancelled → **STOP**
  - "Other" → user provides corrected ref → re-validate via `rev-parse`

> Edge case: a branch with a purely numeric name (e.g. `123`) will be interpreted as a PR number — acceptable compromise.

**Steps:**

1. **Get commit list** between the ref and HEAD:
   ```bash
   git log --oneline --reverse <ref>..HEAD
   ```
   If no commits found (HEAD is at or behind `<ref>`), inform the user and **stop**.

2. **Check commit count:**
   If more than 20 commits, ask the user before proceeding:

   ```
   AskUserQuestion: Found <N> commits to review. Reviewing all of them will be slow and consume significant context. How to proceed?

   Options:
   1. Review all <N> commits
   2. Review only the last 20
   3. Cancel
   ```

   **Based on choice:**
   - "Review all" → continue with the full commit list
   - "Review only the last 20" → truncate the list to the 20 most recent commits (keep chronological order)
   - "Cancel" → inform the user that review was cancelled → **STOP**

3. **Review each commit:**
   ```bash
   git show <commit-hash> --stat
   git show <commit-hash>
   ```
   For each commit check:
   - Does the commit message match the actual changes?
   - Are changes atomic (single logical unit per commit)?
   - Are there any issues introduced in this specific commit?

4. **Provide combined summary** with per-commit notes

## Context Gates (Read-Only)

Before finalizing review findings, run read-only context gates:

- Check the resolved architecture artifact (if present) for boundary/dependency alignment issues.
- Check the resolved RULES.md artifact (if present) for explicit convention violations.
- Check the resolved roadmap artifact (if present) for milestone alignment and mention missing linkage for likely `feat`/`fix`/`perf` work.

Human gate result severity:
- `WARN` for non-blocking inconsistencies or missing optional files.
- `ERROR` only for explicit blocking criteria requested by the user/review policy.

If the user wants a standalone rules-only pass, suggest `/aif-rules-check`. Keep human `/aif-review` gate labels at `WARN` / `ERROR`, then append the standard machine-readable gate result with `pass|warn|fail` status.

### Machine-readable gate result

This section is the single owner of `aif-gate-result` computation:
- Append one final fenced `aif-gate-result` JSON block after the human-readable review.
- Use `"gate": "review"`.
- `"status": "pass|warn|fail"` — the more severe (`fail` > `warn` > `pass`) of two independent inputs:
  - **findings input** — `fail` when any "Critical Issues" item remains (critical correctness, security, data-loss, performance, downstream regression — see `references/SEVERITY.md` for the authoritative critical/suggestion definitions); `warn` when only "Suggestions", missing optional context, or review uncertainty remain; `pass` when nothing material remains.
  - **context-gate input** — `fail` for a blocking (`ERROR`) gate finding; `warn` for a non-blocking (`WARN`) one; `pass` when none.
  - A failing context gate keeps `"status"` at `fail` even with zero Critical Issues — a clean findings list must never mask a failed gate.
- **No unresolved markers reach the gate.** The projection expects marker-free findings: a `(confidence: low)` / `(confidence: medium)` marker is resolved by the validation pass *before* the gate is computed — see "Resolving markers before the gate" below. Schema v1 has no encoding for "unverified potential blocker", and the gate never tries to express one (`warn` + `command: null` is not a state, it is a bug).
- **An unresolved marker is a validation failure, and the gate reports the failure itself.** If a marked finding still carries its marker when the gate is computed — the validation pass was dispatched and did not resolve it: per-item contract violation, malformed per-item response, or whole-dispatch failure (`references/CHECK-MODE.md`, Failure modes) — the review did not complete, and the block says so in the machine-readable fields, not only in the `WARN [+check]` line:
  - `"status": "fail"`, `"blocking": true`;
  - `"blockers"` gains exactly one synthetic entry `{"id": "review-validation-failed", "severity": "error", "summary": "<N> marked finding(s) left unresolved: <cause>"}`, alongside the established blockers (below);
  - the unresolved findings stay in their human-readable sections with their markers, but are **not** established blockers and never appear in `"blockers"` — the gate does not guess whether they are real;
  - `"suggested_next.command"` is `null` and the reason names the failure and the recovery: re-run `/aif-review +check`. That command is not on the allowlist, so `null` is the only honest value; the block is already `fail` + `blocking`, so no orchestrator can read `null` as "cleared".
- `"blocking": true|false` — `true` only when `"status"` is `fail`.
- `"blockers"` — established merge-blocking findings only: every "Critical Issues" item that carries no confidence marker (after a successful validation pass that is every item), every blocking context-gate finding, plus the `review-validation-failed` entry when validation failed — nothing else.
- `"affected_files"` — reviewed or implicated paths.
- `"suggested_next.command"` follows `"status"`: `fail` → `/aif-fix` by default, but if every blocker came from a single context gate point at that gate's command instead (rules gate → `/aif-rules`, architecture gate → `/aif-architecture`, roadmap gate → `/aif-roadmap`); `warn`/`pass` → `/aif-commit`. When the `review-validation-failed` blocker is present the command is `null` regardless of the other blockers — a fix pass on an incomplete blocker list would consume a report the review never finished. `null` keeps its original meaning — no allowlisted command fits — and is not used to encode an unresolved finding.

### Resolving markers before the gate

A review that produced at least one `(confidence: low)` / `(confidence: medium)` marker runs the `+check` validation automatically, even when the flag was not given. The flag stays opt-in for everything else: a review with no markers behaves exactly as before and dispatches nothing.

- Every marked finding is either **confirmed** — the validator returns it without the marker, and it counts as an ordinary finding of its section (a confirmed critical is a blocker and drives `fail`) — or **refuted** and dropped.
- The gate is then computed from the post-validation findings, so the published block never contains a marker and never needs a state schema v1 cannot express.
- If the pass leaves a marker unresolved, the gate reports the validation failure (`review-validation-failed`, "Machine-readable gate result" above) instead of publishing a verdict the review did not earn. The marker stays visible in the human-readable section, and the `WARN [+check]` line names the cause.
- The dispatch is paid only in runs that would otherwise produce that unrepresentable state. Since coverage-first deliberately surfaces uncertain findings rather than suppressing them, those runs are common enough that leaving the resolution to the user would stall the pipeline on every one of them.

Procedure, counters, and failure handling are identical to an explicit `+check` (`references/CHECK-MODE.md`); the only difference is what triggered it.

`/aif-review` is read-only for context artifacts by default. Do not modify context files unless user explicitly asks.

### Project Context

**Read `.ai-factory/skill-context/aif-review/SKILL.md`** — MANDATORY if the file exists.

This file contains project-specific rules accumulated by `/aif-evolve` from patches,
codebase conventions, and tech-stack analysis. These rules are tailored to the current project.

**How to apply skill-context rules:**
- Treat them as **project-level overrides** for this skill's general instructions
- When a skill-context rule conflicts with a general rule written in this SKILL.md,
  **the skill-context rule wins** (more specific context takes priority — same principle as nested CLAUDE.md files)
- When there is no conflict, apply both: general rules from SKILL.md + project rules from skill-context
- Do NOT ignore skill-context rules even if they seem to contradict this skill's defaults —
  they exist because the project's experience proved the default insufficient
- **CRITICAL:** skill-context rules apply to ALL outputs of this skill — including the review
  summary format and the checklist criteria. If a skill-context rule says "review MUST check X"
  or "summary MUST include section Y" — you MUST augment the output accordingly. Producing a
  review that ignores skill-context rules is a bug.

**Enforcement:** After generating any output artifact, verify it against all skill-context rules.
If any rule is violated — fix the output before presenting it to the user.

## Finding stage: coverage over filtering

At the finding stage your job is **coverage, not filtering**. Report every issue you find, including ones you are uncertain about or judge low-severity — do not omit a finding because it feels minor or you are not fully sure. Filtering happens downstream (the `+check` validator, the human, or the gate's Critical/Suggestion split), never here.

- Uncertain findings still get surfaced — in the section their **impact** warrants, carrying an explicit confidence marker (see "Findings taxonomy and the validation boundary" below). Never in **Questions**: uncertainty marks a finding, it never exempts one from validation.
- Do not self-censor to satisfy "only high-severity" / "be conservative" framing: investigate fully, then report what you found and let the downstream stage rank it.
- Keep the Critical-vs-Suggestion split honest (the gate blocks on confirmed Criticals) — confidence belongs in the finding text, it never justifies omission or demotion.

> Why: Opus 4.8 follows "report only important issues" more literally than earlier models — same investigation depth, but fewer findings converted to output. Coverage-first framing keeps recall up; ranking is a separate step.

## Findings taxonomy and the validation boundary

Every item in the review output belongs to exactly one class. The class decides where the item is rendered and whether `+check` validates it:

| Class | Rendered in | Validated by `+check` |
|---|---|---|
| **actionable code finding** — a claim about the reviewed change: defect, risk, or improvement, normally anchored to `file:line` | Critical Issues or Suggestions | yes |
| **context-gate finding** — architecture / roadmap / rules drift | Context Gates | no |
| **commit-structure finding** — commit-message accuracy or atomicity (commits mode) | inline in the review | no |
| **non-actionable observation** — acknowledgement of a good pattern | Positive Notes | no |
| **genuinely open clarification** — carries no claim of its own | Questions | no |

The invariant that matters: **an actionable code finding is never rendered outside Critical Issues or Suggestions**, so it always enters the validated path when `+check` is set. The other classes are exempt because the validator's input cannot adjudicate them — it receives the reviewed diff, not the architecture/rules artifacts (context gates) and not per-commit boundaries (the commits-mode diff is squashed). The exemption is a limit of the validator's evidence, not an escape hatch: a claim about the changed code belongs in the validated path however it is phrased.

Litmus test: if an item asserts something about the reviewed change that could be true or false, it is an actionable code finding. When a draft "question" smuggles such a claim ("is it intended that X leaks the connection?"), split it: the claim becomes a finding with a confidence marker, and only the genuinely open part may stay in Questions.

### Confidence markers

Confidence and severity are independent dimensions:

- **Severity picks the section** — by the impact of the cited behavior *assuming the finding is true*. A potential merge-blocker sits in Critical Issues even when you are unsure it is real; a well-established nitpick sits in Suggestions.
- **Confidence marks the text** — an uncertain finding ends with exactly one of `(confidence: low)` or `(confidence: medium)`. High confidence is the default and carries no marker; never emit the literal string `(confidence: low|medium)`.

A marker never survives to the published gate: its presence triggers the validation pass (see "Resolving markers before the gate"), which either confirms the finding — returning the corrected text without the marker, after which it counts as an ordinary finding of its section — or drops it. Marking a finding therefore costs nothing in correctness: it records honest uncertainty and schedules its resolution, rather than downgrading the finding or hiding it.

## Review Checklist

### Correctness
- [ ] Logic errors or bugs
- [ ] Edge cases handling
- [ ] Null/undefined checks
- [ ] Error handling completeness
- [ ] Type safety (if applicable)

### Security
- [ ] SQL injection vulnerabilities
- [ ] XSS vulnerabilities
- [ ] Command injection
- [ ] Sensitive data exposure
- [ ] Authentication/authorization issues
- [ ] CSRF protection
- [ ] Input validation

### Performance
- [ ] N+1 query problems
- [ ] Unnecessary re-renders (React)
- [ ] Memory leaks
- [ ] Inefficient algorithms
- [ ] Missing indexes (database)
- [ ] Large payload sizes

### Best Practices
- [ ] Code duplication
- [ ] Dead code
- [ ] Magic numbers/strings
- [ ] Proper naming conventions
- [ ] SOLID principles
- [ ] DRY principle

### Testing
- [ ] Test coverage for new code
- [ ] Edge cases tested
- [ ] Mocking appropriateness

## Output Format

```markdown
## Code Review Summary

**Files Reviewed:** [count]
**Risk Level:** 🟢 Low / 🟡 Medium / 🔴 High

### Context Gates
[Architecture / Rules / Roadmap gate results with WARN/ERROR labels]

### Critical Issues
[Each item is a short paragraph in prose, not a labeled record. Order inside the paragraph:
1. Behavioral impact — what breaks for the user or downstream code.
2. Optional note — a code citation, a consequence, or extra context. Include only if it adds signal; skip otherwise.
3. Path — file:line of the affected location (or the closest anchor).
4. Suggested fix — concrete edit that addresses the behavior above.

Example:
> Two clients buying the last item both get a confirmation and stock goes negative — the order creation and stock reservation run in separate transactions. `src/services/order.ts:42`. Wrap `OrderService.create` and `InventoryService.reserve` in a shared transaction so the second buyer fails fast with "out of stock".
]

### Suggestions
[Same item shape as Critical Issues. The behavioral impact describes a non-blocking improvement (clarity, performance budget, missing log), not a bug.

In either findings section, an item you are not sure about ends with a `(confidence: low)` or `(confidence: medium)` marker — the section still follows impact, not certainty (see "Findings taxonomy and the validation boundary").

Example of a marked item, sitting in Critical Issues because its impact would be merge-blocking if real:
> Retries reuse the same idempotency key after a 5xx, so a duplicate charge is possible when the provider did commit the first attempt. `src/payments/retry.ts:88`. Generate a fresh key per attempt, or record the provider's response before retrying. (confidence: medium)

The marker never reaches the published gate as a finding: it is resolved by the validation pass (see "Resolving markers before the gate") — confirmed items come back without it, refuted ones are dropped, and a marker the pass failed to resolve turns the gate into a `review-validation-failed` failure.]

### Questions
[Free-form clarifications. Path optional, fix optional — these are open questions for the author, never findings (see "Findings taxonomy and the validation boundary").]

### Positive Notes
[Free-form acknowledgements of good patterns. No path/fix required.]
```

When `+check` reclassifies an item, a short ` [+check: …]` suffix is appended to the item text; see `references/CHECK-MODE.md` for the exact wording.

Append the final machine-readable result after the markdown summary:

```aif-gate-result
{
  "schema_version": 1,
  "gate": "review",
  "status": "pass",
  "blocking": false,
  "blockers": [],
  "affected_files": [],
  "suggested_next": {
    "command": "/aif-commit",
    "reason": "Review found no blocking issues."
  }
}
```

When the validation pass ran, the `aif-gate-result` block is assembled **after** validator filtering — `status`, `blockers`, `affected_files`, and `suggested_next` are recomputed accordingly. On a whole-dispatch failure the input is the unfiltered draft instead: for a marker-free review that reproduces the pre-validation gate, for a review with markers it yields the `review-validation-failed` gate. See `references/CHECK-MODE.md` for the full procedure.

The failure block, for a review whose only marked critical could not be validated:

```aif-gate-result
{
  "schema_version": 1,
  "gate": "review",
  "status": "fail",
  "blocking": true,
  "blockers": [
    {
      "id": "review-validation-failed",
      "severity": "error",
      "summary": "1 marked finding left unresolved: validator response for item 1 violated the marked-item contract"
    }
  ],
  "affected_files": ["src/payments/retry.ts"],
  "suggested_next": {
    "command": null,
    "reason": "Validation of the marked finding failed, so the review is incomplete and no blocker verdict exists for it. Re-run /aif-review +check."
  }
}
```

## Review Style

- Be constructive, not critical
- Explain the "why" behind suggestions
- Provide code examples when helpful
- Acknowledge good code
- Order feedback by importance — but never drop low-severity findings; surface them as Suggestions (see "Finding stage: coverage over filtering")
- Ask questions instead of making assumptions

## Examples

**User:** `/aif-review`
Review staged changes in current repository.

**User:** `/aif-review 123`
Review PR #123 using GitHub CLI.

**User:** `/aif-review https://github.com/org/repo/pull/123`
Review PR from URL.

**User:** `/aif-review 2.x`
Review all commits on the current branch compared to branch `2.x`.

**User:** `/aif-review main`
Review all commits on the current branch compared to `main` (or to whatever branch is configured as `git.base_branch` in this repository).

**User:** `/aif-review v1.0.0`
Review all commits on the current branch compared to tag `v1.0.0`.

**User:** `/aif-review +check`
Review staged changes, then run the `+check` validator over Critical Issues and Suggestions before rendering. The validator can drop invented items, rewrite partially-correct ones, and reclassify items between the two severity levels (promote a suggestion to critical or demote a critical to suggestion — see `references/SEVERITY.md` for the rules). It adds a filtering-summary line and rebuilds the gate result from the surviving findings; see `references/CHECK-MODE.md` for the exact line format.

**User:** `/aif-review 123 +check`
Review PR #123 with `+check` validation enabled.

## Integration

If GitHub MCP is configured, can:
- Post review comments directly to PR
- Request changes or approve
- Add labels based on review outcome

> **Tip:** Context is heavy after code review. Consider `/clear` or `/compact` before continuing with other tasks.
