# Reference: Change Summary (change-summary)

> **When to use:** When invoked with the `change-summary` argument (or as the first stage of `--all`). Also run this mode first when the change context is unknown — before writing a test plan or test cases.

---

## Step 1: Gather Change Information

Use the `resolved_branch`, `artifact_dir`, `ui_language`, `artifact_language`, `technical_terms_policy`, `git_enabled`, and `base_branch` resolved in SKILL.md Step 0 and Step 0.2.

### Manual Change Context

If `git_enabled = false`, the current directory is not a git work tree, or required refs cannot be resolved, do not fail with a raw git error.

Use AskUserQuestion in `ui_language`.
Meaning: ask the user to provide change context for the QA summary.
Options meaning:
1. Paste a diff or PR description
2. Provide a changed-file list
3. Provide a short implementation summary
4. Cancel

Use the supplied context as the primary evidence source. If the user cancels, stop without writing an artifact.

If the user provides an explicit changed-file list, use it as `changed_files` for Step 2.
If you only have a diff, derive `changed_files` from the touched paths in that diff.
If you only have a PR description or short implementation summary, derive a best-effort `changed_files` list from any explicitly named files, modules, routes, commands, or components mentioned there.
If no reliable file list can be derived, skip file exploration in Step 2 and continue with summary-level risk analysis based on the supplied evidence. In that case, mark file-level uncertainty explicitly in the generated artifact instead of falling back to git assumptions.

### Git Change Context

Use this flow only when `git_enabled = true` and the repository is a git work tree.

**Resolve the comparison base:**

> Use the `git.base_branch` value from config (default: `main`).
> If `resolved_branch` IS the base branch, set `effective_base = <resolved_branch>~1`.
> Otherwise, set `effective_base = <base_branch>`.
>
> Validate refs before running log or diff commands:
>
> ```bash
> git rev-parse --verify <resolved_branch>
> git rev-parse --verify <effective_base>
> ```
>
> If `<resolved_branch>` resolves locally, set `analysis_target = <resolved_branch>`.
>
> If `<resolved_branch>` is not available locally, try refreshing remotes and then resolve the remote target ref:
>
> ```bash
> git fetch --all --prune
> git rev-parse --verify origin/<resolved_branch>
> ```
>
> If `origin/<resolved_branch>` resolves, set `analysis_target = origin/<resolved_branch>`. Keep `resolved_branch` unchanged as the artifact label, branch slug input, and user-facing command argument. If neither local nor remote target branch resolves, switch to manual change context mode and ask the user in `ui_language` for the comparison source.
>
> If `<effective_base>` is not available locally, try refreshing remotes and then resolve the remote base:
>
> ```bash
> git fetch --all --prune
> git rev-parse --verify origin/<base_branch>
> ```
>
> If `origin/<base_branch>` resolves, set `effective_base = origin/<base_branch>`. If neither local nor remote base resolves, switch to manual change context mode and ask the user in `ui_language` for the comparison source.
>
> Build the full commit range from `effective_base..<analysis_target>`.
> Start with `analysis_base = <effective_base>`.
> This special case stays anchored to `analysis_target`, not to the current checkout.

**Get the full commit list:**

```bash
git log <effective_base>..<analysis_target> --oneline
```

**Check commit count — if more than 20, ask before proceeding:**

Use AskUserQuestion in `ui_language`.
Meaning: tell the user that `<N>` commits were found and ask whether to analyze all commits, only the last 20, or cancel.
Options meaning:
1. Analyze all `<N>` commits
2. Analyze only the last 20
3. Cancel

Based on choice:
- "Analyze all" → keep `analysis_base = <effective_base>`
- "Analyze only the last 20" → select the 20 most recent commits from the full range, find the oldest commit in that subset, and set `analysis_base = <oldest_selected_commit>^`
  - This `^` shorthand uses Git's first-parent semantics for the selected oldest commit.
- "Cancel" → **STOP**

**Finalize the scoped commit list:**

```bash
git log <analysis_base>..<analysis_target> --oneline
```

Use `analysis_base` for the final commit list and for all diff commands below. This keeps the reduced commit scope and diff scope aligned.

**Get diff statistics, changed files, and diff:**

```bash
git diff --stat <analysis_base>...<analysis_target>
git diff <analysis_base>...<analysis_target> --name-status
git diff <analysis_base>...<analysis_target>
```

**Check diff size — if the diff exceeds ~1000 lines, warn before proceeding:**

Use AskUserQuestion in `ui_language`.
Meaning: tell the user that the diff is large (`<N>` lines) and ask whether to read it fully, analyze important files individually, or cancel.
Options meaning:
1. Continue and read the full diff
2. Read changed files individually instead (recommended for large diffs)
3. Cancel

Based on choice:
- "Continue" → use the full diff as-is
- "Read files individually" → skip the raw full diff; proceed to Step 2 and read targeted per-file diffs/content
- "Cancel" → **STOP**

For large diffs, never load generated files, lock files, dependency snapshots, build artifacts, minified assets, or vendored code unless the change itself is about them. Start from `git diff --stat`, then `git diff <analysis_base>...<analysis_target> --name-status`, then per-file diffs for important files. Treat deleted and renamed files explicitly: deleted files may indicate removed behavior; renamed files may require caller/import checks even when content is mostly unchanged.

## Step 2: Explore Key Changed Files

**Use `Task` tool with `subagent_type: Explore` to understand the changed files in parallel.**
This keeps the main context clean and speeds up analysis on large diffs.

If Step 1 produced `changed_files`, identify the most important files from that set (focus on business logic, skip lock files, generated files, dependency snapshots, build artifacts, minified assets, vendored code, and formatting-only changes).

If `changed_files` is unavailable because manual mode only provided summary-level context, skip direct file exploration. Instead, summarize risks from the supplied evidence, note that file-level exploration could not be performed, and keep assumptions clearly labeled.

Launch 1–2 Explore agents simultaneously. Use the default configured model unless the runtime explicitly supports model selection:

```text
Agent 1 — Core changes:
Task(subagent_type: Explore, prompt:
  "Read and summarize the key changed files: [list of most important files].
   Focus on: what logic changed, what inputs/outputs changed, what side effects are possible.
   Thoroughness: medium. Be concise.")

Agent 2 — Integration points (if needed):
Task(subagent_type: Explore, prompt:
  "Find all callers and consumers of [changed modules/functions].
   Identify what adjacent functionality might be affected.
   Thoroughness: quick.")
```

**Fallback:** If the Task tool is unavailable, read the key files directly using Read/Grep.

After agents return, synthesize findings to understand:
- What business logic actually changed
- What dependent code could be affected
- What integration points are at risk
- Which findings are confirmed by code/diff evidence and which are assumptions

## Step 3: Risk Analysis

For each changed component, assess:

**Functional risks:**

- Did the business logic change?
- Were input/output data affected (formats, validation, structure)?
- Are there dependent modules or components that might break?
- How does the change affect user scenarios?

**Technical risks:**

- Changes to data schema (DB, API contracts, file formats, storage)?
- Changes to configuration or environment variables?
- Changes to error handling or edge case behavior?
- Changes to integrations with external services or APIs?
- Changes to authorization, access control, or security?

**Regression risks:**

- What existing functionality might have broken?
- Which adjacent features need re-verification?

Every high-risk item must be backed by observed code/diff evidence or explicitly marked as an assumption.

## Step 4: Generate the Summary

Use the canonical English template `templates/CHANGE-SUMMARY.md` as the structure source. If `artifact_language` is not `en`, translate all human-readable headings, labels, checklist items, placeholders, enum labels, risk labels, and explanatory text into `artifact_language` before saving.

Write the artifact in `artifact_language`. Apply `technical_terms_policy` from SKILL.md. Keep file paths, commands, code identifiers, branch names, config keys, API names, package names, and raw error messages unchanged.

The summary must include an `Evidence` section (localized heading is allowed) that ties important findings to files, functions, commits, or diff observations.

## Step 5: Save Artifact

Before saving:
- Verify that the document is written in `artifact_language`.
- If most headings or body text are in another language, rewrite it before saving.
- For `artifact_language = ru`, human-readable prose, headings, risks, priorities, and recommendations must be in Russian.
- Technical identifiers, code names, branch names, API names, CLI commands, file paths, config keys, and raw error messages may remain unchanged.

**Ensure the directory exists before saving:**

```bash
mkdir -p <artifact_dir>
```

Save the result to `<artifact_dir>/change-summary.md`.

## Step 6: Next Step

**If `all_mode = true`** — do NOT show the prompt. Proceed directly to `references/TEST-PLAN.md`.

**Otherwise:**

Use AskUserQuestion in `ui_language`.
Meaning: tell the user that the change summary was saved and ask whether to proceed to the test plan.
Options meaning:
1. Proceed by running `/aif-qa test-plan <resolved_branch>`
2. Stop here
