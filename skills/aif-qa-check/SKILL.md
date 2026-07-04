---
name: aif-qa-check
description: Executes QA test cases created by /aif-qa in human-guided or automated-agent mode. Use when you need to walk through QA one case at a time, record pass/fail results, or have an agent verify cases through browser, CLI, API, automated tests, or file/document checks.
argument-hint: "[human | agent] [<branch>]"
allowed-tools: Read Write Grep Glob Bash AskUserQuestion Browser mcp__playwright__*
disable-model-invocation: true
---

# QA Check — Execute Test Cases

Runs the `test-cases.md` artifact produced by `/aif-qa` and records execution status in `qa-check.md`.
In agent mode, it also maintains reusable cross-QA execution memory under the QA root:
- `agent-context.md` — curated, current, reusable non-sensitive setup facts for future automated QA runs
- `agent-history.md` — append-only reusable learnings extracted from prior runs, not a per-run audit log

The skill is stack-free and agent-free: it does not assume a framework, package manager, browser tool name, or agent runtime. In agent mode, it uses the appropriate available execution surface for each case: live browser automation, CLI commands, project test runners, HTTP/API calls, database-safe read checks, file/document inspection, or other non-destructive automated verification.

## Modes

| Argument | Mode | What you do |
|----------|------|-------------|
| `human` | Human-guided QA | Show exactly one test case, ask the user whether it works, and record their answer |
| `agent` | Automated-agent QA | Execute test cases through the most appropriate available capability and record observed results |

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
- `qa_root = resolved paths.qa || ".ai-factory/qa/"`
- `qa_agent_context_path = <qa_root>/agent-context.md`
- `qa_agent_history_path = <qa_root>/agent-history.md`

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

Read `<paths.qa>/agent-context.md` if it exists. Treat it as reusable, user-approved QA execution context for future automated runs: stable environment classes, canonical local/staging URLs, login route, test account role, allowed non-sensitive usernames, required seed data patterns, stable selectors, field identifiers, known redirects, startup prerequisites, safe command patterns, reusable test-filter conventions, environment notes, and service startup instructions.

Read `<paths.qa>/agent-history.md` if it exists. Treat it as append-only cross-QA memory from prior `/aif-qa-check` runs. Before asking the user or attempting automated execution, search it for reusable prior answers to the same blocker so the skill does not repeat avoidable mistakes.

`agent-context.md` and `agent-history.md` are global to all QA sets under `paths.qa`. They MUST NOT become logs for a specific QA plan. Do not write branch names, branch slugs, QA target paths, current `artifact_dir`, `TC-*` mappings, per-run summary counts, exhaustive command transcripts, assertion counts from a single run, one-off file checks, or plan-specific labels such as a numbered QA folder name. Write those details only to `<paths.qa>/<branch-slug>/qa-check.md`.

Only promote information into `agent-context.md` or `agent-history.md` when it is likely to help future unrelated QA runs. Prefer stable patterns over concrete one-off run facts. Example: `Laravel backend checks use php artisan test --filter=<TestClass>` is reusable; `05-profile-formula-recommendations ran ProfileReaderTest with 4 tests / 13 assertions` is run-specific and belongs only in `qa-check.md`.

Never write global negative capability or scope claims unless they are true for the whole project. Do not write statements like `browser automation is not required`, `browser URL is not used`, `all QA is backend/CLI`, or `these cases are backend-test/cli/file-docs` to `agent-context.md` or `agent-history.md` when that conclusion came from one QA plan. Instead, keep it branch-specific in `qa-check.md`, or phrase a reusable conditional rule such as `For backend-only QA cases, browser automation is not required; browser/UI cases still require Browser or Playwright MCP`.

Never treat either file as a source of secrets. If either file contains an apparent password, token, cookie, authorization header, one-time code, or other secret, ignore that value for execution and redact it the next time the file is rewritten or appended to.

### Step 0.2: Parse Arguments and Resolve Branch

Parse `$ARGUMENTS`:

1. Detect mode: first word matching `human` or `agent`; remove it from arguments.
2. Detect branch: remaining text, if any, is the branch label.
3. If no mode was provided, ask in `ui_language` which mode to run:
   - Human-guided QA
   - Automated-agent QA

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

Read `test-cases.md`. Extract test cases by IDs (`TC-001`, `TC-002`, etc.), titles, priority, type, execution surface when present, preconditions, steps, expected results, and test data. Preserve their order.

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

### Step 1.1: Agent Mode Capability and Safety Preflight

Agent mode is user-only (`disable-model-invocation: true`) because it can perform live browser actions, shell commands, local service calls, and other checks with meaningful side effects.

Before executing any case or writing `qa-check.md` in agent mode:
1. Detect available execution capabilities from the current runtime tools:
   - shell/CLI command execution
   - project test runners and build tools available through shell
   - live browser automation through in-app Browser or Playwright MCP
   - HTTP/API checks available through existing project tooling or safe shell commands
   - file, document, and repository inspection through Read/Grep/Glob
2. Classify each test case by the evidence surface it requires: `browser-ui`, `cli`, `backend-test`, `api`, `file-docs`, `database-read`, `hybrid`, `human`, or `unknown`. If the case has an explicit `Execution surface:` field, use it unless the case text clearly contradicts it; record any override in `agent-history.md`.
3. Choose the least invasive capability that can produce concrete evidence for that case. Browser automation is REQUIRED for browser/UI-observable cases and hybrid cases whose expected result depends on rendered web behavior. Do not substitute CLI commands, unit tests, static inspection, or backend checks for a browser/UI case; those may be recorded only as supporting evidence.
4. If a case requires browser automation, prefer the in-app Browser capability if available. If in-app Browser is not available, use Playwright MCP if available.
5. If a browser/UI case requires live browser automation and neither in-app Browser nor Playwright MCP is available, keep only that case unchecked, set status to `Blocked`, ask the user in `ui_language` to enable a live browser capability, and append this blocker to `<paths.qa>/agent-history.md`. Continue with other cases that can be verified through CLI, tests, API, or file/document checks.
6. Use `<paths.qa>/agent-context.md`, `<paths.qa>/agent-history.md`, `test-cases.md`, `change-summary.md`, project docs, current browser state, and repository scripts to determine the target URL, service startup commands, test commands, and environment.
7. For browser/UI cases that require authentication or specific user state, resolve a browser test identity before marking the case blocked:
   - First search `agent-context.md`, `agent-history.md`, test data, seeders/factories/fixtures, docs, local database-safe reads, and existing test users for a matching non-sensitive test identity.
   - If the environment is clearly `local`, `test`, or disposable `development`, and repository tooling provides a safe way to create or seed a synthetic test user/state, create the minimal disposable fixture needed for the case. Record the fixture identifier and setup command/evidence in `qa-check.md`.
   - If creating a fixture requires a password, role, tenant, workspace, feature flag, seed command, or any unclear setup decision, ask the user before blocking. Ask whether to provide an existing test account or authorize creating a disposable fixture.
   - If the user provides or authorizes disposable test credentials for a `local` or `test` environment, use them for this run. Store credentials in `agent-context.md` only if the user explicitly says they are reusable test-only credentials and safe to persist. Otherwise store only the username/role and where to retrieve the secret.
   - Never store production credentials, personal credentials, cookies, session tokens, one-time codes, or shared secrets in `agent-context.md` or `agent-history.md`.
8. If a user-suppliable prerequisite is missing, ask the user before blocking:
   - application URL or login URL
   - test account role or non-sensitive username
   - where to find credentials without exposing them in artifacts
   - authorization to create a disposable local/test browser fixture and the desired initial state
   - required startup state, seed data, feature flag, tenant, organization, or workspace
   - ambiguous login mechanism or authentication provider
   - stable selector, field identifier, or page route needed to continue
   - exact project command, test filter, service startup command, or safe API endpoint needed to continue
9. Save reusable non-sensitive answers to `<paths.qa>/agent-context.md` immediately only when the answer is general enough to help future QA sets. Append the redacted answer summary to `<paths.qa>/agent-history.md` only when it captures a reusable lesson; otherwise keep it in the branch-specific `qa-check.md` evidence/comment.
10. Determine and display the target environment, including URL when applicable and inferred environment class: `local`, `development`, `staging`, `test`, `production`, or `unknown`.
11. Do not execute browser actions, API writes, CLI commands with side effects, database writes, destructive commands, payment, permission, email, notification, data export, or other external-side-effect steps against `production` or `unknown` targets without explicit user authorization immediately before execution. Record the authorization decision and target class in `qa-check.md`. Append it to `agent-history.md` only when it creates a reusable cross-QA policy or recurring authorization lesson; do not persist broad production authorization for future runs.
12. Inspect each case and proposed command for destructive, irreversible, payment, permission, email, notification, data export, database mutation, service restart, deployment, filesystem deletion, or other external-side-effect risk. Require explicit per-case authorization before executing any such case.
13. Prefer read-only and test-scoped commands. Do not run destructive shell commands such as `rm`, `git reset`, `git checkout --`, database resets, migrations against shared environments, deploy commands, or cleanup commands that delete user data unless the user explicitly authorizes the exact action.
14. If authorization is denied or unclear, leave the case unchecked, set status to `Blocked`, and write the blocker to `qa-check.md` without executing the risky action. Append the decision to `agent-history.md` only when it is a reusable cross-QA lesson, not merely a case-specific denial.

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

Agent mode MUST produce concrete, case-appropriate evidence. Browser execution, CLI output, automated test output, API responses, backend command results, database-safe read results, or file/document inspection can each be enough to mark a case passed when that evidence directly covers the case steps and expected result.

Internal deterministic invariants MUST be treated as automated checks, not manual QA. Cases involving service-method calls, cache state, materialized rows, exact arrays, raw database values, formula outputs, CLI internals, or similar non-human-observable behavior should be classified as `backend-test`, `cli`, `api`, or `database-read` as appropriate. First look for existing tests or commands that already cover the invariant. If existing tests are found and pass, mark the corresponding `TC-*` case `Passed` with the test class/name, command/filter, exit status, and assertion/result summary as evidence. If one test run covers multiple `TC-*` cases, reuse that evidence on every covered case and optionally summarize the shared run under "Supporting Automated Checks". If no suitable automated coverage exists, keep the case `Blocked` with a blocker such as `Missing automated test coverage for backend invariant`; do not ask the user to manually verify internal arrays or raw database values.

Determine the test target:
- If `agent-context.md`, `agent-history.md`, `test-cases.md`, `change-summary.md`, project docs, or current browser state clearly identify a URL, use it.
- If repository scripts, test files, package manifests, Makefiles, framework commands, or docs clearly identify a safe command or test filter for a CLI/backend/API/docs case, use it.
- If no URL, command, startup state, credentials location, test filter, or required fixture is clear, ask the user for the missing detail, then persist only the non-sensitive reusable facts to `agent-context.md`.
- Do not invent credentials, URLs, commands, fixtures, or environment assumptions.
- Use the target environment and authorizations collected in Step 1.1. Reconfirm if navigation redirects to a different host or a more sensitive environment.

For each pending or selected case:
1. Select the execution surface from the case classification:
   - `browser-ui`: navigate with Browser or Playwright MCP and execute UI steps.
   - `cli`: run the relevant project command and inspect exit code/output.
   - `backend-test`: find and run the narrowest existing relevant test command or test filter first; broaden only when needed for confidence. Passing automated coverage is valid pass evidence for the case.
   - `api`: call the endpoint through existing project tooling, safe local commands, or browser/network capability as appropriate.
   - `file-docs`: inspect generated files, docs, config, or repository contents with Read/Grep/Glob and, when useful, project validation commands.
   - `database-read`: use only safe read-only checks unless the user explicitly authorizes mutation in a test-scoped environment.
   - `hybrid`: combine the necessary surfaces and record each evidence type.
2. Execute the test steps as written, adapting only mechanics that are obvious from the selected surface.
3. If execution stalls because of missing credentials, missing browser fixture, unavailable services, unclear setup, blocked navigation, missing selector knowledge, ambiguous field mapping, unknown route, unknown command, missing fixture, or unclear test filter, search `agent-context.md` and `agent-history.md` first. For browser/UI auth or user-state gaps, try safe local/test fixture discovery or creation as described in Step 1.1 before blocking. If the answer or fixture is not already available, ask the user exactly for the missing information or authorization before marking the case blocked.
4. When the user provides usable non-sensitive information, continue the case in the same run. Update `agent-context.md` with durable cross-QA facts and append the resolved friction to `agent-history.md` only if it is likely to recur in future QA sets. Keep case-specific details in `qa-check.md`.
5. If the user cannot provide the missing information, the service remains unavailable, authorization is denied, the required capability is unavailable, or a side-effect risk remains unresolved, keep the checkbox unchecked (`[ ]`), set status to `Blocked`, and write the blocker.
6. Compare the observed result to the expected result.
7. If observed behavior matches, mark the case checked (`[x]`), set status to `Passed`, and add concise redacted evidence. Evidence may be a browser observation, command and exit status, test name and result, API response summary, file path and matched condition, or other concrete observation.
8. If observed behavior does not match, keep the checkbox unchecked (`[ ]`), set status to `Failed`, and write a concrete redacted problem comment with observed vs expected behavior.
9. Save `qa-check.md` after every case.

Before the final summary, write detailed per-run evidence to `qa-check.md`, not to root-level memory. This includes the current branch/QA target, commands executed, exit codes, assertion counts, supporting file checks, case mappings, summary counts, and one-off blockers.

After writing `qa-check.md`, extract only reusable cross-QA learnings:
- Update `<paths.qa>/agent-context.md` when a discovered fact is durable and likely useful for future QA sets.
- Append to `<paths.qa>/agent-history.md` only when a blocker, selector, command pattern, test-filter convention, API endpoint pattern, route, setup note, or authorization decision is likely to recur beyond the current QA set.
- It is valid to append nothing to `agent-history.md` for a successful run that produced no new reusable learning.
- Never append a full run transcript, branch/QA target, per-run summary counts, exact assertion totals, or current QA-plan label to `agent-history.md`.

Keep `<paths.qa>/agent-context.md` concise and current; prefer stable facts over one-off observations. Do not write raw passwords, tokens, cookies, authorization headers, one-time codes, private personal data, token-bearing URLs, branch names, QA target paths, or run summaries.

Use screenshots or browser state observations when the active runtime makes them available, but do not require screenshots to pass a test.

### Step 4: Final Summary

After stopping or finishing, report in `ui_language`:
- total test cases
- passed
- failed
- blocked
- pending
- path to `qa-check.md`
- path to `agent-context.md` and `agent-history.md` when agent mode ran or requested missing execution context
- next recommended action

If `mode = agent` and one or more current cases are `Blocked`, split them into human-verifiable blocked cases and automation-only blocked cases before ending.
- Offer human-guided continuation only for blocked cases whose execution surface is `human`, `browser-ui`, `hybrid` with human-observable steps, or `unknown`.
- Do NOT offer human-guided continuation for blocked `backend-test`, `cli`, `api`, `file-docs`, or `database-read` cases when the blocker is missing automated coverage, missing command/test filter, unavailable service, or another technical automation prerequisite. For those cases, recommend adding/running the appropriate automated check or providing the missing command/fixture/context.
- If at least one human-verifiable blocked case exists, ask the user in `ui_language` whether to run those eligible blocked cases now in human-guided mode.
- If the user agrees, continue in the same invocation using Step 2, but only for eligible blocked cases. Preserve existing agent blocker comments as context and append the human result/comment under the same case.
- If the user declines or stops, keep those cases unchecked and `Blocked`.
- Write the handoff decision and any resolved blocked cases to `qa-check.md`. Append to `agent-history.md` only when the handoff revealed a reusable cross-QA lesson.

If any case failed, the next recommended action should be to fix the issue and rerun `/aif-qa-check <mode> <resolved_branch>`.

If human-verifiable cases remain blocked after an agent-mode run and the user did not continue them in human mode, the next recommended action should be to run `/aif-qa-check human <resolved_branch>` for those cases or provide the missing execution context. If automation-only cases remain blocked, recommend adding/running the required automated test, command, fixture, service, or context instead. Do not imply that a blocked case is a product defect unless there is concrete observed evidence.

## Artifact Ownership and Config Policy

- Primary ownership: `<paths.qa>/<branch-slug>/qa-check.md`, `<paths.qa>/agent-context.md`, and `<paths.qa>/agent-history.md`.
- Read policy: may read `<paths.qa>/<branch-slug>/change-summary.md`, `test-plan.md`, `test-cases.md`, `<paths.qa>/agent-context.md`, and `<paths.qa>/agent-history.md` as QA context.
- Write policy: persistent writes are limited to `qa-check.md`, `agent-context.md`, and `agent-history.md`; do not rewrite `test-cases.md`, `test-plan.md`, `change-summary.md`, or `config.yaml`.
- Config policy: config-aware, read-only. Reads `paths.description`, `paths.architecture`, `paths.qa`, `language.ui`, `language.artifacts`, `language.technical_terms`, and `git.enabled`; never writes `config.yaml`.

## Critical Rules

1. MUST NOT run without `test-cases.md`.
2. MUST show only one case at a time in human mode.
3. MUST ask the user whether the case works in human mode.
4. MUST preserve failed-user comment wording except mandatory redaction of sensitive values before writing.
5. MUST NOT mark a case passed in agent mode without concrete evidence from an appropriate execution surface for that case.
6. MUST NOT block non-browser cases merely because live browser automation is unavailable.
7. MUST classify deterministic internal/backend/CLI/API/database invariant cases as automated checks and MUST NOT route them to human manual QA as a substitute for missing automated coverage.
8. MUST bind current results to (`tested_revision` and `worktree_digest`) or `manual_build_id`, plus `source_digest` and `case_digests`.
9. MUST mark stale results stale when the tested revision, worktree digest, manual build id, full source digest, or per-case digest changes.
10. MUST require explicit authorization for production/unknown targets and destructive or external-side-effect cases.
11. MUST redact credentials, cookies, authorization values, tokens, and sensitive URL parameters before writing comments or evidence.
12. MUST save progress after every case.
13. MUST read `agent-context.md` and `agent-history.md` before automated execution and before asking the user for setup facts, so prior answers are reused.
14. MUST ask the user for missing user-suppliable execution context before blocking an agent-mode case for missing URL, credentials, login route, field identifiers, setup state, selectors, commands, test filters, fixtures, or similar recoverable information.
15. MUST NOT block a browser/UI case for missing login credentials or user state until it has searched reusable context, existing fixtures, seeders/factories, docs, and safe local/test data; attempted safe disposable fixture creation when the environment is local/test and tooling is available; or asked the user for credentials, fixture setup, or authorization to create a disposable fixture.
16. MUST persist reusable test-only credentials in `agent-context.md` only after explicit user permission, and MUST never persist production credentials, personal credentials, cookies, session tokens, one-time codes, or shared secrets.
17. MUST write only reusable non-sensitive cross-QA answers and discovered stable execution facts to `agent-context.md`, and MUST append to `agent-history.md` only when a recurring reusable learning or blocker pattern was discovered.
18. MUST ask whether to continue eligible blocked agent-mode cases in human mode before ending an agent run with any current human-verifiable `Blocked` cases.
