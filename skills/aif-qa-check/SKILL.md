---
name: aif-qa-check
description: Executes QA test cases created by /aif-qa in human-guided or browser-agent mode. Use when you need to walk through QA one case at a time, record pass/fail results, or have an agent run live browser checks.
argument-hint: "[human | agent] [<branch>]"
allowed-tools: Read Write Grep Glob Bash(git *) Bash(mkdir *) AskUserQuestion Browser mcp__playwright__*
disable-model-invocation: true
---

# QA Check — Execute Test Cases

Runs the `test-cases.md` artifact produced by `/aif-qa` and records execution status in `qa-check.md`.

The skill is stack-free and agent-free: it does not assume a framework, package manager, browser tool name, or agent runtime. In agent mode, it uses whatever live browser automation capability the current runtime exposes.

## Modes

| Argument | Mode | What you do |
|----------|------|-------------|
| `human` | Human-guided QA | Show exactly one test case, ask the user whether it works, and record their answer |
| `agent` | Browser-agent QA | Execute test cases through a live browser capability and record observed results |

If no mode is provided, ask the user which mode to run.

---

## Workflow

### Step 0: Load Config

**FIRST:** Read `.ai-factory/config.yaml` if it exists to resolve:
- **Paths:** `paths.description`, `paths.architecture`, `paths.qa` (default: `.ai-factory/qa`)
- **Language:**
  - `language.ui` for AskUserQuestion prompts, progress messages, summaries, and next-step guidance
  - `language.artifacts` for the persisted `qa-check.md` artifact
  - `language.technical_terms` for human-readable technical terminology style in the artifact
  - If `language.artifacts` is missing, use `language.ui`
  - If both are missing, use `en`
- **Git:** `git.enabled` for branch resolution

If config.yaml does not exist, use defaults:
- DESCRIPTION.md: `.ai-factory/DESCRIPTION.md`
- ARCHITECTURE.md: `.ai-factory/ARCHITECTURE.md`
- QA artifacts: `.ai-factory/qa/`
- `ui_language`: `en`
- `artifact_language`: `en`
- `technical_terms_policy`: `keep`
- Git enabled: `true`

Store:
- `ui_language = language.ui || "en"`
- `artifact_language = language.artifacts || language.ui || "en"`
- `technical_terms_policy = language.technical_terms || "keep"`
- `git_enabled = git.enabled` when present, otherwise `true`

All AskUserQuestion prompts, user-visible explanations, per-case summaries, and final summaries MUST be written in `ui_language`.

The persisted `qa-check.md` artifact MUST be written in `artifact_language`.

Templates define structure, not language. Use the canonical English template in `templates/QA-CHECK.md`. If `artifact_language` is not `en`, translate headings, labels, status text, comments you author, and explanatory text to `artifact_language` before saving. Preserve checkbox syntax, test case IDs (`TC-001`), commands, paths, config keys, URLs, selectors, package names, API names, branch names, and raw error messages.

For `artifact_language = ru`, write human-readable prose, headings, statuses, summaries, and agent-authored comments in Russian. Preserve user wording except mandatory redaction of sensitive values before writing.

Apply `technical_terms_policy` while writing artifacts:
- `keep` — keep common technical terms such as `browser`, `selector`, `viewport`, `endpoint`, `payload`, `regression`, and `fixture` when clearer
- `translate` — translate human-readable technical terms where a natural target-language term exists
- `mixed` — translate ordinary prose terms while keeping code, infrastructure, and ecosystem terms unchanged

### Step 0.1: Load Project Context

Read the resolved description path if it exists.

Read the resolved architecture path if it exists.

Read `.ai-factory/skill-context/aif-qa-check/SKILL.md` — MANDATORY if the file exists. Treat it as project-level overrides for this skill.

### Step 0.2: Parse Arguments and Resolve Branch

Parse `$ARGUMENTS`:

1. Detect mode: first word matching `human` or `agent`; remove it from arguments.
2. Detect branch: remaining text, if any, is the branch label.
3. If no mode was provided, ask in `ui_language` which mode to run:
   - Human-guided QA
   - Browser-agent QA

Resolve the working branch:

```text
If git_enabled = false or the repository is not a git work tree:
  If branch was provided in arguments → use it as the resolved branch label
  Otherwise → set resolved_branch = "manual"
If git_enabled = true and the repository is a git work tree:
  If branch was provided in arguments → use it as the resolved branch
  Otherwise → run: git branch --show-current
```

Store:
- `resolved_branch`
- `artifact_dir = <resolved paths.qa>/<branch-slug>`
- `test_cases_path = <artifact_dir>/test-cases.md`
- `qa_check_path = <artifact_dir>/qa-check.md`

Compute `branch-slug` with the exact same algorithm as `/aif-qa`:
1. Replace every character not in `[A-Za-z0-9._-]` with `-`, collapse consecutive `-`, trim leading/trailing `-`, and use `branch` if empty. Then MUST truncate `safe_slug` to the first 40 ASCII characters. Because the normalized `safe_slug` alphabet is `[A-Za-z0-9._-]`, byte length and character length are identical.
2. Run `git hash-object --stdin <<< "<resolved_branch>"` and take the first 8 hex characters as `hash8`.
3. Combine: `branch-slug = "<safe_slug>-<hash8>"`.

### Step 1: Verify QA Inputs

Check for `<artifact_dir>/test-cases.md`.

If it is missing, STOP and ask in `ui_language` whether to:
1. Run `/aif-qa test-cases <resolved_branch>` first
2. Cancel

Read `test-cases.md`. Extract test cases by IDs (`TC-001`, `TC-002`, etc.), titles, priority, type, preconditions, steps, expected results, and test data. Preserve their order.

Compute source binding metadata before creating or modifying `qa-check.md`:
- `source_digest` — deterministic digest of the full `test-cases.md` content using `git hash-object --no-filters <test_cases_path>` when available, or `git hash-object --stdin` over the exact file content.
- `case_digests` — deterministic per-case digest for each extracted `TC-NNN`, computed from that case's canonical block including title, priority, type, preconditions, steps, expected result, and test data.
- `tested_revision` — when `git_enabled = true` and the repository is a git work tree, run `git rev-parse HEAD` and record the resolved commit SHA.
- `worktree_digest` — when `git_enabled = true` and the repository is a git work tree, record a deterministic digest of the current working tree state so dirty-tree QA cannot be reused after local changes without a commit.
- `manual_build_id` — when `git_enabled = false` or the repository is not a git work tree, ask the user for an explicit build/version identifier before creating or resuming results. Do not accept an empty identifier.

Canonicalize each per-case digest input exactly:
1. Extract the raw Markdown block from the line containing the case's `TC-NNN` identifier through the line before the next `TC-NNN` block or end of file.
2. Normalize line endings from CRLF or CR to LF.
3. Remove trailing spaces and tabs from each line.
4. Trim leading and trailing blank lines from the extracted block.
5. Preserve the original field order, bullet markers, indentation, internal blank lines, Markdown punctuation, and all remaining whitespace. Do not sort fields, collapse whitespace, or rewrite bullets.
6. Wrap the normalized block with raw block boundaries before hashing: `BEGIN TC-NNN\n<normalized block>\nEND TC-NNN\n`.
7. Hash the wrapped block with `git hash-object --stdin` when available, or another stable SHA-1/SHA-256 digest if git is unavailable.

Compute `worktree_digest` exactly when git is enabled and a git work tree exists:
1. Capture `git status --porcelain=v1 --untracked-files=all`.
2. Capture `git diff --binary HEAD --`.
3. Exclude `qa_check_path` from the status, diff, and untracked-file digest inputs so saving `qa-check.md` does not stale its own results. Do not exclude `test_cases_path`; source changes are also tracked by `source_digest`.
4. For each untracked file listed by porcelain status except `qa_check_path`, append `UNTRACKED <path> <content-digest>` where `<content-digest>` is `git hash-object --no-filters <path>` when the file is readable.
5. Normalize line endings in the combined input to LF and hash it with `git hash-object --stdin`.
6. If the filtered work tree input is clean, record the digest of the canonical string `clean\n`.

If `mode = agent`, perform Step 1.1 before creating or modifying `qa-check.md`. Existing `qa-check.md` may be inspected read-only during this gate.

If `qa-check.md` exists, read it and resume from existing statuses only after comparing stored binding metadata to the current binding metadata:
- If `tested_revision` changed, mark every prior result as `Stale` and unchecked, preserve prior comments/evidence as historical context, and require retest. Do not count stale pass/fail/block statuses as current.
- If `worktree_digest` changed, mark every prior result as `Stale` and unchecked, preserve prior comments/evidence as historical context, and require retest. Do not count stale pass/fail/block statuses as current.
- If `manual_build_id` changed, treat it the same as a tested revision change.
- If `source_digest` changed, compare `case_digests`. Preserve current status only for cases whose per-case digest is unchanged and whose tested revision/manual build id and worktree digest are unchanged.
- If an existing case's digest changed, mark that case `Stale`, unchecked, and require retest.
- If a new case appears, add it as unchecked `Pending`.
- If a prior case no longer exists in `test-cases.md`, keep its historical entry marked `Stale` or move it to an artifact-language "Stale / Removed Cases" section; never count it as current.
- Do not overwrite prior pass/fail comments unless the user explicitly chooses to retest that case.

If `qa-check.md` does not exist, create it from `templates/QA-CHECK.md` using the extracted test cases and source binding metadata. Every case starts unchecked and `Pending`.

### Step 1.1: Agent Mode Safety Preflight

Agent mode is user-only (`disable-model-invocation: true`) because it can perform live browser actions with meaningful side effects.

Before executing any case or writing `qa-check.md` in agent mode:
1. Detect available live browser capability from the current runtime tools.
2. Prefer the in-app Browser capability if available.
3. If in-app Browser is not available, use Playwright MCP if available.
4. If neither is available, STOP before creating or modifying `qa-check.md`. Ask the user in `ui_language` to enable a live browser capability, for example by initializing the project with Playwright MCP (`ai-factory init --mcp playwright`) or enabling the agent's in-app Browser integration.
5. Determine and display the target environment, including URL and inferred environment class: `local`, `development`, `staging`, `test`, `production`, or `unknown`.
6. Do not execute against `production` or `unknown` targets without explicit user authorization immediately before browser execution.
7. Inspect each case for destructive, irreversible, payment, permission, email, notification, data export, or other external-side-effect steps. Require explicit per-case authorization before executing any such case.
8. If authorization is denied or unclear, leave the case unchecked, set status to `Blocked`, and write the blocker without executing browser actions.

Redaction is mandatory for agent comments/evidence and all human-entered comments/evidence:
- Redact credentials, cookies, authorization values, session tokens, API keys, bearer tokens, basic auth values, one-time codes, and personal secrets.
- Redact sensitive URL parameters such as `token`, `access_token`, `refresh_token`, `id_token`, `code`, `secret`, `password`, `passwd`, `pwd`, `auth`, `key`, `api_key`, `session`, `sid`, and `jwt`.
- Replace redacted values with `[REDACTED]` before writing comments or evidence to `qa-check.md`.
- Do not paste raw browser storage, cookies, request headers, authorization headers, or token-bearing URLs into the artifact.

### Step 2: Human Mode

Run exactly one pending or selected test case at a time.

For each case:
1. Show only that test case's title, priority, preconditions, steps, test data, and expected result.
2. Include a short per-case summary in `ui_language`.
3. The summary question MUST mean: "Test this and answer whether it works." For `ui_language = ru`, use exactly: `Протестируйте и ответьте работает или нет`.
4. Ask the user for the result:
   - Works / completed
   - Does not work / failed
   - Stop for now
5. If the user says it works, mark the case as checked (`[x]`) in `qa-check.md`, set status to `Passed`, and add the current mode as `human`.
6. If the user says it failed, keep the checkbox unchecked (`[ ]`), set status to `Failed`, ask for the reason, and write the user's explanation as the comment while preserving user wording except mandatory redaction of sensitive values.
7. Save `qa-check.md` after every case so progress survives context resets.

Do not show the next test case until the current one has a result or the user stops.

### Step 3: Agent Mode

Agent mode MUST perform live browser checks. Static code inspection, unit tests, or shell-only scripts are not enough to mark a case passed.

Determine the test target:
- If `test-cases.md`, `change-summary.md`, project docs, or current browser state clearly identify a URL, use it.
- If no URL or startup state is clear, ask the user for the application URL and any required credentials/test account.
- Do not invent credentials, URLs, or environment assumptions.
- Use the target environment and authorizations collected in Step 1.1. Reconfirm if navigation redirects to a different host or a more sensitive environment.

For each pending or selected case:
1. Open or navigate to the relevant URL with the chosen browser capability.
2. Execute the test steps as written, adapting only UI mechanics that are obvious from the live page.
3. Compare the observed result to the expected result.
4. If observed behavior matches, mark the case checked (`[x]`), set status to `Passed`, and add concise redacted browser evidence.
5. If observed behavior does not match, keep the checkbox unchecked (`[ ]`), set status to `Failed`, and write a concrete redacted problem comment with observed vs expected behavior.
6. If the case cannot be executed because of missing credentials, unavailable services, unclear setup, blocked navigation, denied authorization, or destructive-side-effect risk, keep it unchecked, set status to `Blocked`, and write the blocker.
7. Save `qa-check.md` after every case.

Use screenshots or browser state observations when the active runtime makes them available, but do not require screenshots to pass a test.

### Step 4: Final Summary

After stopping or finishing, report in `ui_language`:
- total test cases
- passed
- failed
- blocked
- pending
- path to `qa-check.md`
- next recommended action

If any case failed or is blocked, the next recommended action should be to fix the issue and rerun `/aif-qa-check <mode> <resolved_branch>`.

## Artifact Ownership and Config Policy

- Primary ownership: `<paths.qa>/<branch-slug>/qa-check.md`.
- Read policy: may read `<paths.qa>/<branch-slug>/change-summary.md`, `test-plan.md`, and `test-cases.md` as QA context.
- Write policy: persistent writes are limited to `qa-check.md`; do not rewrite `test-cases.md`, `test-plan.md`, `change-summary.md`, or `config.yaml`.
- Config policy: config-aware, read-only. Reads `paths.description`, `paths.architecture`, `paths.qa`, `language.ui`, `language.artifacts`, `language.technical_terms`, and `git.enabled`; never writes `config.yaml`.

## Critical Rules

1. MUST NOT run without `test-cases.md`.
2. MUST show only one case at a time in human mode.
3. MUST ask the user whether the case works in human mode.
4. MUST preserve failed-user comment wording except mandatory redaction of sensitive values before writing.
5. MUST NOT mark a case passed in agent mode without live browser execution.
6. MUST stop in agent mode when neither in-app Browser nor Playwright MCP is available before creating or modifying `qa-check.md`.
7. MUST bind current results to (`tested_revision` and `worktree_digest`) or `manual_build_id`, plus `source_digest` and `case_digests`.
8. MUST mark stale results stale when the tested revision, worktree digest, manual build id, full source digest, or per-case digest changes.
9. MUST require explicit authorization for production/unknown targets and destructive or external-side-effect cases.
10. MUST redact credentials, cookies, authorization values, tokens, and sensitive URL parameters before writing comments or evidence.
11. MUST save progress after every case.
