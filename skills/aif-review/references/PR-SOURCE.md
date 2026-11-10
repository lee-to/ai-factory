# PR review source package

Mandatory in PR mode, with or without `+check`. Build this package **before** reviewing code. It is an in-memory review input, not a new project artifact. Never switch branches, fetch objects, modify the index, write source files, or execute code from the PR. The collector only reads existing Git objects, local files for comparison, and GitHub GET endpoints; JSON goes to stdout. Resolve `pr-source.mjs` beside this reference (also in flat workflow installations), not the project's scripts directory.

## 1. Pin the change

Resolve the base repository `owner/name` and PR number from the supplied URL or PR metadata. Do not assume the current repository when the user supplies a URL. Run with Node.js 18+ and authenticated `gh`:

```bash
node <reference-dir>/pr-source.mjs snapshot <owner/repo> <N>
```

Retain the returned object verbatim as the package baseline:

- `repository`, `pr`, `base_sha`, `head_sha` — full commit IDs captured from PR metadata.
- `merge_base_sha` — GitHub's merge base of those exact commits. PR changes are compared from this commit to `head_sha`, not from the current base tip.
- `diff.text`, `diff.sha256`, `diff.bytes`, `diff.source` — the actual reviewed bytes and their SHA-256. Review this text; reuse it for `+check`. Do not refetch `gh pr diff`, reconstruct patches from the paginated files list, normalize line endings, trim, or hash a reformatted rendering. JSON escaping is transport only: the hash describes the decoded UTF-8 text.
- `observed`, `stale`, `freshness_error` — a second metadata observation detects base/head movement during capture. On success `stale` is a boolean and `freshness_error` is null. If that probe fails, preserve the completed package with `observed: null`, `stale: null`, and a safe `freshness_error` description; the CLI emits `WARN [aif-review:source]`. Null means unknown, never fresh. Record the failed probe in Review Sources and keep the gate at least `warn` while freshness remains unknown. Even when stale or unknown, the diff stays bound to the original SHAs; never silently mix snapshots.
- `files`, `unavailable_context` — extend these lists as described below.

The collector first tries a diff of existing local Git objects, with external diff drivers and text conversion disabled. Otherwise it requests a full diff from GitHub's compare endpoint using immutable `merge_base_sha...head_sha`. It never uses moving branch names or a synthetic merge commit. Fork commits use the base repository's network. If that object is inaccessible there, record the failure rather than substituting a fork's current branch.

If initial source collection fails (missing tools/access/objects, oversized response, invalid text, or an API failure needed to pin metadata/merge-base/diff), stop the PR review and report the unavailable snapshot. Only the second freshness probe after a complete diff is recoverable as described above. Tool-output truncation is also an incomplete snapshot: the presence of a hash does not prove that the reviewer received the full text. Obtain complete output within the available tool limits or stop; never treat a partial diff as the full review. An empty diff can be a valid no-change result; report the recorded SHAs/hash without inventing changes. Binary diff bodies, LFS pointers, and submodule updates do not prove the contents of their targets.

## 2. Add verification context from the pinned tree

For **every** file whose contents affect a finding, question, positive conclusion, or context gate, retrieve its exact version first. This includes changed files outside visible hunks, unchanged callees, callers, types, imports, configuration, tests, project description, architecture, rules, roadmap, and config used to discover those paths. Load versioned config from the pinned tree before resolving its versioned artifact paths. Local runtime policy/skill overrides may still govern how to conduct the review, but cannot establish facts about the PR's code or project conventions.

```bash
node <reference-dir>/pr-source.mjs context <owner/repo> <head_sha> <repo-relative-path>
```

Use `head_sha` by default, including unchanged files. For deleted code or explicit before/after comparisons, use `merge_base_sha` and label it as the **before** side. The package's `base_sha` is the observed base tip, which can differ from the before side. No fallback from a missing head file to the before side is allowed.

For an available result, append to `files`:

- repository, `path`, `commit_sha`, `blob_sha`, content `sha256`, size, source, and `local` comparison;
- the complete content, or verbatim fragments with explicit 1-based line ranges and symbols needed to verify each item;
- the item IDs using those fragments. Keep signatures, relevant bodies, type definitions and config values together; a name-only excerpt cannot prove behavior. Fragment hashes must not be presented as full-file hashes.

The collector verifies bytes against the Git blob identity. It prefers existing objects; the API fallback walks commit/tree objects without relying on truncated recursive trees, then reads the exact blob. It accepts only regular UTF-8 text files up to 1 MiB. Symlinks, gitlinks, binary/invalid text, missing files, oversized or inaccessible objects produce an explicit `unavailable` entry. `reason_code: not-found` is emitted only when an existing local Git tree or complete pinned GitHub tree listing proves a path absent; access failures are never labelled missing. In explicit `+check`, the host independently collects pinned config and description before Reviewer and reserves those source entries for its own results. Reviewer records and self-consistent hashes cannot replace this tree evidence. Truncated tool output cannot establish the omitted file contents: retrieve the needed complete pinned fragments or record them as unavailable. Do not follow missing targets through the working tree or a moving URL.

`local.status: differs` detects a checkout discrepancy (including dirty files and line endings). `matches` proves only the compared bytes at that moment; the package remains the evidence source. `excluded`/`unavailable` means no trustworthy local comparison. Do not infer PR behavior from any local version, even when it has the same symbol names. Searches on disk may suggest candidate paths, but every relied-on result must be retrieved at the pinned commit. Search the pinned tree via `git ls-tree` / `git grep <head_sha>` when possible; absence from local search results is not evidence of absence from the PR.

For each unavailable dependency append to `unavailable_context`: path/symbol, requested commit, reason, affected item IDs, and which conclusion cannot be verified. An inaccessible file is **unknown**, not proof that the symbol is missing. Preserve actionable hypotheses in Critical Issues/Suggestions with confidence markers and follow the existing mandatory validation lifecycle; never relocate them to Questions to evade validation. The validator cannot confirm unsupported claims: a `drop` for unavailable evidence must name that reason, and the parent retains the excluded conclusion as unverified in Review Sources. Questions contain only genuinely open clarifications. Missing required context makes the findings input at least `warn`; it never fabricates an established blocker, yields a clean `pass`, or suppresses a `review-validation-failed` gate.

## 3. Share and report the same evidence

Before validation (explicit `+check` or automatic marker-triggered), ensure every proposed item's dependencies are either available or explicitly unavailable in the package. Pass package metadata, file identities/fragments, and unavailable-context entries through `{{SOURCE_PACKAGE}}` in `VALIDATOR.md`. Pass the unchanged `diff.text` separately through `{{REVIEWED_DIFF}}`; omit its duplicate body from `SOURCE_PACKAGE`. The existing `review-validator` dispatch/tool-boundary policy is unchanged; the validator may not supplement a PR package from disk or commands. Missing evidence must remain explicit even if validation fails or there are no findings.

Immediately before rendering, re-read PR base/head metadata (`gh api repos/<owner/repo>/pulls/<N>`). Compare both SHAs with the package; if either moved or this check fails, record it as review uncertainty (`warn` at minimum) and state that the result covers the recorded snapshot only. A new head requires a new complete review package, not selective replacement of context files.

Always add **Review Sources** to the human-readable PR result, before the final `aif-gate-result`:

1. Repository/PR, full base/head/merge-base SHAs, exact diff SHA-256, byte count, and source.
2. A table of every additional file used: path, side/commit SHA, blob SHA, content SHA-256, excerpt line ranges if any, local comparison (`matches`/`differs`/`excluded`/`unavailable`). State explicitly when there were no additional files.
3. Unavailable context and excluded conclusions, plus any PR movement/freshness limitation. State explicitly when none were identified. A local discrepancy must be visible here and excluded from conclusions.

Keep this provenance on successful validation, empty-item runs, malformed responses, and whole-dispatch failure. The existing shared `aif-gate-result` schema is unchanged; source limitations feed the existing review-uncertainty input. `+check` filtering cannot remove source uncertainty or raise it to `pass`.

For diagnostics set `AIF_REVIEW_DEBUG=1` (command identities on stderr; no content dumps). Fatal snapshot collection errors use `ERROR [aif-review:source]`; unavailable context and movement use `WARN [aif-review:source]`.
