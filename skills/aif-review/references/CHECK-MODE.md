# `+check` validation procedure

This file describes the findings-validation pass. It runs when `aif-review` is invoked with the `+check` flag, and automatically when a review produced at least one confidence marker (`SKILL.md`, "Resolving markers before the gate"). The parent skill defers to this document so the main `SKILL.md` stays focused on the default review workflow; for marker-free reviews the flag remains opt-in and most invocations dispatch nothing.

The two severity levels — **critical** (merge-blocking) and **suggestion** (non-blocking) — and the rules for moving an item between them are defined in `SEVERITY.md` next to this file. Do not redefine severity here.

## When to run

### Optional coupling methodology

`+coupling` selects the local COUPLING-REVIEW.md methodology; it does not trigger
validation. Pass the same methodology on explicit `+check` and automatic
confidence-marker validation. Automatic dispatch retains its enforced read-only
allowlist requirement; an unavailable or weaker validator means whole-dispatch
failure, never an automatic full-tool fallback. Existing severity/gate rules apply.

Protocol version 3 accepts optional `lenses:["coupling"]` on `prepare` (including
the automatic procedure and commits mode). Missing/`[]` means off. Unknown names,
duplicates and non-arrays fail. Preserve the prepared selection in `finish`;
there is no finish override. `run` selects only from exact argument tokens and
rejects caller-supplied `request.lenses` before calls. It still requires explicit
`+check`; automatic validation uses the existing procedure with prepare/finish.
The trusted methodology comes from the bundled file, never a caller path/prompt.
When off, no methodology content is loaded, no lens field is emitted, and no
extra source or validator action runs.

An enabled PR Reviewer must return top-level `coupling_dependencies` (an array,
including `[]`) for additional producer/consumer/rule files relied on outside
the diff. Records contain `repository`, full lowercase 40-hex `commit_sha`, safe
repository-relative `path`, and `status:"available"|"unavailable"`. Available
records require full UTF-8 `content`, integer `bytes`, `sha256`, and `blob_sha`;
unavailable records require `reason` and carry no content/byte/hash fields.
No other fields are accepted. Unknown external revisions belong in
`source.unavailable_context`, never invented SHA values.

For explicit PR `run`, coupling-context.mjs validates the entire declaration
before additional coupling context calls. Automatic PR prepare/finish callers
must first use that same helper with their pinned source and actual read-only
host transport, passing independently collected `projectEvidence.files` as its
fifth argument (never Reviewer-supplied files). Conflicting declarations fail
preflight; a later recheck failure/limit preserves those established file bytes
and records the coupling-recheck limitation separately. `prepare` alone assembles a prompt and does not independently
collect or attest sources. Identical records deduplicate by repository/commit/path;
conflicting duplicates or malformed data fail before source/validator calls.
Every `source.files` identity must be declared or match the separately collected
project evidence. Undeclared additional files fail before any coupling reads or
validator dispatch, even when other declarations are valid. Only canonical host
project records (including unavailable records) survive without a declaration;
Reviewer-supplied hashes or annotations never establish that provenance.
The host independently re-reads available declarations through pr-source.mjs
context, compares raw content/byte/hash/blob identities, and appends the verified
results AFTER mergeProjectContext using the composite identity. Both head and
merge-base of the same file, even config/description, reach validator and Review
Sources. Supplied content/hashes alone do not establish provenance.

Only the current PR repository's pinned head/merge-base may be read, with at most
16 unique records, 1 MiB/file, 2 MiB total UTF-8 bytes in declaration order.
Preflight excludes known over-budget entries without reads; verified bytes are
checked again after reading. Stop remaining reads when the total is exhausted.
External/out-of-revision sources and real missing/oversized sources remain
unavailable with reasons and the existing WARN floor. Forged identities/content
are integrity errors, not an unavailable shortcut. A declared unavailable source
stays unavailable and requires no read. This is declared coverage, not a graph
scan. Staged/commits retain the existing local read-only evidence policy.

After the full review is produced internally (all sections, including the gate result inputs) but **before** anything is rendered to the user. The validator only adjusts which items reach the user and what the final `aif-gate-result` block reports.

If `+check` is not set **and** the drafted review contains no `(confidence: low)` / `(confidence: medium)` marker, skip this entire procedure — render the review as-is, with no validator-related lines in the output. If markers are present, run the procedure even without the flag: the gate cannot be published while a marker is unresolved. The validator receives exactly one class of item: actionable code findings, which live in "Critical Issues" and "Suggestions". "Questions", "Positive Notes", the "Context Gates" block, and commit-structure findings in commits mode (see Procedure step 1) are NOT validated even when `+check` is set — the validator judges items against the reviewed diff, which is not evidence for context-gate or per-commit claims. That class table, and the rule that an actionable code finding is never rendered outside the two validated sections, live in `SKILL.md` ("Findings taxonomy and the validation boundary").

## Procedure

### Executable host protocol for explicit `+check`

For staged/PR mode run `node "<references>/check-workflow.mjs" run`, resolving `<references>` beside this file (including flat installations). Send JSON on stdin and keep the journal in memory; no project artifacts are written:

```json
{"request":{"argument":"123 +check","repository":"owner/repo","working_directory":"/path/to/project","validator":{"available":true,"read_only_enforced":true}},"responses":[]}
```

Set `validator` from the runtime's actual capabilities per step 4 below. In PR mode `request.working_directory` is required and contains only the runtime directory, never local description text. `request.project_context` is used in staged mode only and is ignored in PR mode. The helper returns `{done:false,next:{call_id,tool,args}}` or `{done:true,result:{output,gate,...}}`. Fulfil only `next`, append `{...next,response:<result>}` to `responses`, then invoke `run` again with the updated journal. Sequential call IDs distinguish identical status requests. Mismatched/extra responses fail explicitly; never skip a request.

- `Bash`: execute the supplied read-only source command and return exact stdout. PR capture uses `pr-source.mjs`. Before Reviewer, fulfil the independent `pr-source.mjs context` requests for `.ai-factory/config.yaml` and the description path resolved from its pinned content. The final `gh api` checks freshness. Return an error object if final freshness fails, leaving it unconfirmed. A source capture error stops review; never replace it with local PR evidence.
- `Reviewer`: **the parent agent's internal drafting step**, not another subagent. Follow `args.skill` and the normal checklist/context gates using `args.diff` and `args.source`. Return `{review:{items,context_gates,questions,positive_notes,reviewed_files,uncertainty,summary}}`. Items are `{section:"critical"|"suggestion",text,files:[paths]}`; preserve confidence suffixes verbatim. Set `validate:false,kind:"commit-structure"` only for established marker-free commit-structure findings excluded in step 1 (commits mode only). Context gates are `{area:"rules"|"architecture"|"roadmap",status:"pass"|"warn"|"fail",text,files:[paths]}`. `summary` holds the heading/overview and any extra non-finding sections. In PR mode `args.project_context` contains the runtime directory only. The host has already collected pinned config/description independently and includes them in `args.source`; preserve those entries. Retrieve every other necessary pinned dependency per `PR-SOURCE.md` and return the completed package as `source` alongside `review`, preserving its identities/diff exactly. Also return `project_context` as a string containing only the pinned description excerpt, or `""` when no excerpt is used; keep required but unavailable evidence in `source.unavailable_context`. A nonempty excerpt and its `source.files` description entry must match the host's independent description result, including repository/path/commit, bytes, SHA-256, Git blob SHA, and full content; the excerpt must be a verbatim substring. Optional `project_context_path` must equal the path independently resolved by the host from pinned config. Reviewer-supplied paths, content and recomputed hashes cannot establish provenance. Missing/mismatched evidence rejects the response before validator dispatch. If description evidence is unavailable, return an empty excerpt and record the path/commit/reason in `source.unavailable_context`, retaining a `warn` floor. Missing/non-string PR fields fail explicitly. Do not render the draft yet.
- `Task`: dispatch the returned `{subagent_type,prompt}` once. Return `{outcome:"success",text:<verbatim response>}` or `{outcome:"refusal"|"timeout"|"exception"}`. Async dispatch returns `{outcome:"pending",task_id}`; fulfil `TaskStatus` by waiting for the same task with the same envelopes. Three pending status replies exhaust the bounded wait and become timeout. Do not retry by dispatching another validator.
- On `done:true`, render `result.output` with its gate fence last. Localize headings/stock prose for `language.ui` without changing findings, warnings, counters or JSON values. Do not recompute the gate in prose.

For commits mode preserve the normal ref validation, commit-count question and per-commit review first. Use `prepare` with `{review,source:{mode:"commits"},diff,project_context,validator}` to obtain `{task,...}`; dispatch `task` once, then call `finish` with `{prepared:<prepare output>,result:<outcome envelope>}`. `run` composes these same functions for staged/PR mode. In PR mode the validator context always starts with `request.working_directory`, followed by a newline and the exact returned pinned excerpt when nonempty; an empty excerpt retains the directory. Local request descriptions are never forwarded to the PR validator. This is workflow protocol version 3; regenerate recordings after migrating older journals. `AIF_REVIEW_DEBUG=1` enables stderr diagnostics; stdout remains JSON. The helper never executes tools itself. Its projection implements the following finding contract and the gate rules owned by `SKILL.md`.

The dependency-free config resolver supports the template's block `paths` mapping with plain, single-quoted, or JSON-compatible double-quoted description strings and comments. Unsupported YAML (including aliases/merges, flow maps, duplicate keys or multiple documents), unsafe paths, or unavailable config leave the description path unknown and retain source uncertainty. The default description path is used only when pinned config proves no override, or the collector proves config absent from the pinned tree (`reason_code: not-found`). A missing/inaccessible description is recorded as unavailable; no local fallback is permitted.

### Finding contract

1. Collect items from "Critical Issues" and "Suggestions" into a numbered list. Use the prose format from the Output Format section of `SKILL.md`. Number them across both sections in display order (Critical first, then Suggestions), and render each item under a `### Item N (section: critical|suggestion)` heading so the validator sees which section it currently sits in. For each item, remember its **original section** — you need it to detect reclassification and to fall back if the validator response is malformed. In commits mode the reviewed diff handed to the validator is the squashed `git diff <ref>...HEAD` (step 2b) and carries no per-commit boundaries — so exclude from the numbered list any finding tied to an individual commit rather than to the net code change (commit-message accuracy, commit atomicity, or a change introduced in one commit and reverted within the range), exactly as "Questions" and "Positive Notes" are excluded; such findings stay in the rendered review verbatim and are not counted by the `Filtered:` line. **If the list is empty, skip steps 2–5 entirely**: do not dispatch the validator, treat the run as successful with `hidden = 0`, `adjusted = 0`, `reclassified = 0`, and proceed straight to "Output additions" / "Recomputing `aif-gate-result`".
2. Build three inputs for the validator. **(a) Project context block** — working directory path, plus a short description excerpt (resolved `paths.description`, default `.ai-factory/DESCRIPTION.md`); keep it under ~30 lines. In PR mode this excerpt must be from the pinned source package, never the local branch. **(b) Reviewed diff** — reuse the exact captured text: `git diff --cached` for staged mode, or `git diff` when nothing was staged; the source package's `diff.text` for PR mode (do not refetch); `git diff <ref>...HEAD` for commits mode. **(c) Source package** — in PR mode, the package from `references/PR-SOURCE.md`: full commit IDs, diff hash, exact file identities/fragments, local discrepancies and unavailable context, omitting the duplicate diff body. In other modes explicitly pass `mode: staged` or `mode: commits; source package not used; local read-only context permitted`. Missing PR evidence is a limitation, never a reason to move an actionable finding outside validation.
3. Read `references/VALIDATOR.md`. Replace all five declared slots: project context, reviewed diff, source package (step 2), numbered items (step 1), and severity rules. For `{{SEVERITY_RULES}}`, inline the full body of `references/SEVERITY.md` verbatim. The validator receives all PR evidence in its prompt and must not supplement it from disk.
4. Dispatch one call: `Task(subagent_type: review-validator, prompt: <rendered template>)`. The subagent runs with fresh context. The rendered prompt embeds `{{REVIEWED_DIFF}}` verbatim, and for a PR that diff is untrusted input: the pass must not be a path from a limited skill to an agent with side-effecting tools that the reviewed content can steer. What bounds the validator is what the runtime **enforces** on its effective tool set, not the presence of an agent file (both files below are installed into the project by `ai-factory init`):
   - **Claude Code** — `subagents/claude/agents/review-validator.md` declares `tools: Read, Glob, Grep`, and the runtime enforces that allowlist: the effective tool set is exactly those three tools, so read-only behavior is a capability restriction, not only a prompt instruction. This is an **enforced boundary**.
   - **Codex** — `subagents/codex/agents/review-validator.toml` has no tool allowlist, because Codex custom agents have none. `sandbox_mode = "read-only"` bounds the filesystem and network of the commands the agent runs; it does not narrow the tool set. When the agent file omits `mcp_servers`, MCP servers are inherited from the parent session — including servers configured outside the project, which the file cannot disable by name — so a server with modifying tools stays reachable and only the prompt forbids using it. This is **not** an enforced boundary.

   **When there is no enforced boundary** — `review-validator` is unavailable (a runtime that installs no agent files, or a project where the agent was removed), or it is available but its runtime does not enforce a read-only tool allowlist (Codex) — the choice depends on why the pass is running — never silently fall back to a full-tool agent such as `general-purpose`, or to an agent whose boundary the runtime does not enforce:
   - **automatic run** (no `+check`, dispatched because the draft carries markers) — do not dispatch at all. Treat it as a whole-dispatch failure with the reason `validator agent unavailable` or `validator tool boundary not enforced by this runtime` (see "Failure modes"): the markers stay unresolved and the gate reports `review-validation-failed`. The user gets a review that says what is missing instead of an unvalidated verdict, and the trust boundary is never widened by content the reviewer did not choose to trust.
   - **explicit `+check`** — the user asked for this pass on this change, so a weaker boundary is permitted, and the output names it so it is visible rather than assumed. Dispatch the runtime's own `review-validator` when it exists (`WARN [+check]: review-validator has no enforced tool allowlist on this runtime, validated with a sandbox-only boundary`); otherwise fall back to `general-purpose` (`WARN [+check]: review-validator unavailable, validated with a full-tool agent`).
5. Parse the response by `### Item N` headings. Every block requires exactly one nonempty `Reason` before `Modified-text`; missing, blank, or duplicate reasons are malformed and keep the original item under Failure modes. For each item, first determine the **target section** from `Severity`:
   - `Severity: unchanged` (or field missing) → target section = original section.
   - `Severity: critical` → target section = Critical Issues.
   - `Severity: suggestion` → target section = Suggestions.

   Then apply `Verdict`:
   - `Verdict: keep` → item text stays. Place it in the target section. If target ≠ original, increment `reclassified`.
   - `Verdict: modify` → replace the item text with the whole `Modified-text` value — every line of it, since the field may continue past its first line (`VALIDATOR.md`, "Output format"). Place it in the target section. Increment `adjusted`. If target ≠ original, also increment `reclassified`.
   - `Verdict: drop` → remove the item. `Severity` is ignored. Increment `hidden`. If the Reason identifies unavailable pinned evidence, preserve the affected conclusion as unverified in Review Sources and retain source uncertainty (`warn` at minimum); it is not disproved. Questions remain genuinely open clarifications, never relocated actionable findings.

   Reclassified items (target ≠ original) are rendered with a short suffix appended to the item text so the user understands the move: ` [+check: promoted from Suggestions]` or ` [+check: demoted from Critical Issues]`. The suffix is added by the main skill, not by the validator.

   **Confidence markers.** A marker is a suffix of the whole item text: an item is marked when its text *ends* with `(confidence: low)` or `(confidence: medium)`, trailing whitespace aside. For a multi-line item that is the end of its last line — an inner line ending with the literal does not mark the item. An item that merely mentions the syntax mid-text — a finding about the marker contract itself, say — is not marked, and treating it as marked would turn its valid `keep` into a contract violation. A confirmed marked item loses its marker through `Modified-text` — `VALIDATOR.md` requires `modify` for exactly that reason. A response that leaves the marker in place, or that adds one to a `Modified-text` for an item that arrived without it, violates the marked-item contract and is handled as a malformed per-item response (see "Failure modes"), not as a normal outcome. Never strip a marker yourself: the item was not confirmed through the contract, and silently unmarking it would present an unverified claim as verified.

   **Post-condition of a successful pass.** After a pass that had no whole-dispatch failure, every input marked item has been either removed via `drop` or returned via `modify` without its marker, and no item that arrived unmarked came back carrying one. No confidence marker remains among the processed findings — this is what lets the gate publish a verdict at all (`SKILL.md`, "No unresolved markers reach the gate"). When the post-condition does not hold — a marked item went through the per-item malformed path or the marked-item violation path and is still carrying its marker, or a violating response tried to attach a marker to an unmarked item — the pass has failed for that item, and the gate reports `review-validation-failed` (see "Recomputing `aif-gate-result`" below) in addition to the item's `WARN` line.

PR evidence is restricted to the source package, including unchanged surrounding code. Local branch divergence is never an accepted source of evidence. Unavailable context limits conclusions as specified in `PR-SOURCE.md`; it does not establish a bug or a fabricated citation. Provenance/limitations survive empty-item runs, automatic marker-triggered validation, and every failure path. Source uncertainty remains a `warn` floor even if all items are dropped or final freshness cannot be checked; it never suppresses an existing `fail` or the `review-validation-failed` projection.

## Failure modes

- **Per-item malformed response** (heading missing, no `Verdict` line, unknown verdict token, unknown `Severity` value, or missing `Modified-text` line when `Verdict` is `modify`): treat that item as `keep` with `Severity: unchanged` and append one line after all review sections, just before the `aif-gate-result` fence: `WARN [+check]: validator response for item N was malformed, kept as-is`. Continue processing remaining items. An unmarked item kept this way is an established finding and projects normally; a **marked** item kept this way still carries its marker, so it is unresolved and the gate reports `review-validation-failed`.
- **Marked-item contract violation** — either the input item carried a confidence marker and the response returns `Verdict: keep`, or the response returns `Verdict: modify` whose `Modified-text` contains `(confidence: low)` / `(confidence: medium)` — the latter regardless of whether the input item was marked, since the validator resolves uncertainty and never introduces it. All of these mean the finding was not validated, so none is a normal outcome: preserve the **original** finding verbatim in its section (a marked one keeps its marker; an unmarked one is never replaced by the marked rewrite), exclude a marked one from `blockers`, and append `WARN [+check]: validator response for item N violated the marked-item contract, kept as-is`. Continue processing remaining items. The gate for the run is the `review-validation-failed` failure (see "Recomputing `aif-gate-result`" below). As with any per-item malformed response, the run no longer reports a fully successful filtering: the `Filtered:` line is replaced by the `WARN` line.
- **Whole-dispatch failure** (empty response, exception, timeout, validator refusal, or — on an automatic run — `review-validator` unavailable or its tool boundary not enforced by the runtime, see Procedure step 4): treat **all** items as `keep` with `Severity: unchanged` and append one line in the same position (before the `aif-gate-result` fence): `WARN [+check]: validator failed (<reason>), all items kept as-is`. The `aif-gate-result` block is then assembled from the **unfiltered** original list, and what that yields depends on why the pass ran:
  - **explicit `+check` on a marker-free review** — the draft is a legitimate gate input (every finding is high-confidence), so the block is exactly the pre-validation gate: `status`, `blockers`, `affected_files`, and `suggested_next` unchanged from the draft;
  - **the draft carries at least one marker** (the pass was mandatory) — the unfiltered list still contains the markers, so the projection reports `review-validation-failed`; the marked items are excluded from `blockers`, the `WARN` line gives the reason.

In every failure path the `aif-gate-result` fence stays the **last** thing in the output. WARN lines always go above it.

## Output additions

When `+check` ran successfully (no whole-dispatch failure), append exactly one line at the end of the human-readable review, after all sections and before the `aif-gate-result` fence:

```
Filtered: N hidden, M adjusted, K reclassified by +check
```

`N`, `M`, `K` are zero when nothing happened in that bucket — still emit the line so the user sees the validator ran. Skip this line entirely when the pass did not run at all (no flag and no markers), when the whole-dispatch failure path applies, or when any per-item `WARN` was emitted — in those cases the `WARN` line replaces it.

## Recomputing `aif-gate-result` after `+check`

`aif-gate-result` is computed by the **Machine-readable gate result** section of `SKILL.md` — that section is the single owner of the projection (findings + context gates → `status` / `blocking` / `blockers` / `affected_files` / `suggested_next`). `+check` does **not** define its own projection; it only changes the input the projection runs on.

Apply the `SKILL.md` rules unchanged, with four `+check`-specific points:

- **Input is the post-filter findings.** Recompute `status`, `blockers`, and `affected_files` from "Critical Issues" and "Suggestions" *after* every keep/modify/drop and severity move. A dropped critical item or a demoted finding can lower `status`; a promoted suggestion can raise it.
- **Confirmed criticals become blockers.** A marked critical that the validator confirmed comes back without its marker and enters `blockers` like any other critical, driving `status` to `fail` and `suggested_next.command` to `/aif-fix`. This is the normal way a validation pass turns a draft into a `fail` gate. A refuted one is dropped and cannot influence the gate at all.
- **Context gates are not touched.** `+check` never validates the "Context Gates" block (see "When to run" above). Carry its result over from the pre-`+check` draft unchanged and feed it into the same `status` merge — a blocking context gate keeps `status` at `fail` regardless of what the validator did to the findings, and that gate finding stays in `blockers`.
- **Validation failure is a gate failure, not a finding state.** If any item came out of the pass unvalidated — a marked item still carrying its marker (per-item malformed response or marked-item contract violation on a marked item, or a whole-dispatch failure of a mandatory pass), or an unmarked item whose response was rejected for trying to attach a marker — project per the `SKILL.md` rule "An unresolved marker is a validation failure": `status: fail`, `blocking: true`, one `review-validation-failed` blocker (`severity: error`, summary = count of unvalidated items and the cause from the `WARN` line) next to the established blockers, the unresolved items excluded from `blockers`, and `suggested_next.command: null` with a reason that says the review is incomplete and to re-run `/aif-review +check`. The `null` takes precedence over `/aif-fix` even when established blockers exist.
- **`suggested_next.reason`** gains a short note mentioning `+check` and the three counters, e.g. `"After +check filtering: 2 hidden, 1 adjusted, 1 reclassified; remaining blockers require a fix pass."`. On a validation failure the note names the failure instead of the counters.

Whole-dispatch failure feeds the unfiltered draft into the same projection: a marker-free draft reproduces the pre-validation gate, a marked draft yields the `review-validation-failed` gate (see "Failure modes" above).

## Examples

### Success

```
User: /aif-review +check

→ Review drafted: 2 in Critical Issues, 3 in Suggestions
→ +check validator dispatched (see procedure above)
→ Validator returned: 3 keep (1 promoted from Suggestions → Critical Issues),
  1 modify, 1 drop
→ aif-gate-result recomputed against the post-filter sections

Rendered review:
- Critical Issues: 2 (1 original + 1 promoted with " [+check: promoted from Suggestions]")
- Suggestions: 2
- Questions / Positive Notes: unchanged (not validated)

Filtered: 1 hidden, 1 adjusted, 1 reclassified by +check

aif-gate-result (post-filter):
- status: fail, blocking: true
- suggested_next: /aif-fix
- reason: "After +check filtering: 1 hidden, 1 adjusted, 1 reclassified; remaining blockers require a fix pass."
```

### Whole-dispatch failure on a marker-free review

```
User: /aif-review +check

→ Review drafted: 2 in Critical Issues, 3 in Suggestions, no confidence markers
→ +check validator dispatched
→ Validator failed (timeout)
→ All items kept as-is; the draft is a legitimate gate input, so the
  aif-gate-result is the pre-validation gate

Rendered review (unchanged from the draft):
- Critical Issues: 2 (original)
- Suggestions: 3 (original)
- Questions / Positive Notes: unchanged

WARN [+check]: validator failed (timeout), all items kept as-is

aif-gate-result (assembled from the unfiltered original list):
- status: fail, blocking: true
- blockers: the 2 original criticals
- suggested_next: /aif-fix
- reason: original draft reason, no +check counters appended
```

### Validation failure on a marked item

```
User: /aif-review

→ Review drafted: 1 in Critical Issues (unmarked), 1 in Critical Issues
  with "(confidence: medium)", 1 in Suggestions
→ Markers present → validator dispatched automatically
→ Validator returned: item 1 keep, item 2 keep (marked — contract violation),
  item 3 keep

Rendered review:
- Critical Issues: 2 (item 2 still carries its marker)
- Suggestions: 1

WARN [+check]: validator response for item 2 violated the marked-item contract, kept as-is

aif-gate-result:
- status: fail, blocking: true
- blockers: item 1 (established) + review-validation-failed
  ("1 finding left unvalidated: validator response for item 2
  violated the marked-item contract"); item 2 is NOT a blocker
- suggested_next: null
- reason: "Validation of 1 marked finding failed, so the review is
  incomplete. Re-run /aif-review +check."
```
