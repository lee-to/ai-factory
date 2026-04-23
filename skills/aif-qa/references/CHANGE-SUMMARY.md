# Reference: Change Summary (change-summary)

> **When to use:** When invoked with the `change-summary` argument (or as the first stage of `--all`). Also run this mode first when the change context is unknown — before writing a test plan or test cases.

---

## Step 1: Gather Change Information

Use the `resolved_branch` and `artifact_dir` resolved in SKILL.md Step 0.2.

**Resolve the comparison base:**

> Use the `git.base_branch` value from config (default: `main`).
> If `resolved_branch` IS the base branch, set `effective_base = <resolved_branch>~1`.
> Otherwise, set `effective_base = <base_branch>`.
>
> Build the full commit range from `effective_base..<resolved_branch>`.
> Start with `analysis_base = <effective_base>`.
> This special case stays anchored to `resolved_branch`, not to the current checkout.

**Get the full commit list:**

```bash
git log <effective_base>..<resolved_branch> --oneline
```

**Check commit count — if more than 20, ask before proceeding:**

```text
AskUserQuestion: Found <N> commits to analyze. Processing all of them may consume significant context. How to proceed?

Options:
1. Analyze all <N> commits
2. Analyze only the last 20
3. Cancel
```

Based on choice:
- "Analyze all" → keep `analysis_base = <effective_base>`
- "Analyze only the last 20" → select the 20 most recent commits from the full range, find the oldest commit in that subset, and set `analysis_base = <oldest_selected_commit>^`
  - This `^` shorthand uses Git's first-parent semantics for the selected oldest commit.
- "Cancel" → **STOP**

**Finalize the scoped commit list:**

```bash
git log <analysis_base>..<resolved_branch> --oneline
```

Use `analysis_base` for the final commit list and for both diff commands below. This keeps the reduced commit scope and diff scope aligned.

**Get changed files and diff:**

```bash
git diff <analysis_base>...<resolved_branch> --name-status
git diff <analysis_base>...<resolved_branch>
```

**Check diff size — if the diff exceeds ~1000 lines, warn before proceeding:**

```text
AskUserQuestion: The diff is large (<N> lines). Reading it in full will consume significant context. How to proceed?

Options:
1. Continue — read the full diff
2. Read changed files individually instead (recommended for large diffs)
3. Cancel
```

Based on choice:
- "Continue" → use the full diff as-is
- "Read files individually" → skip the raw diff; proceed to Step 2 where Explore agents will read the files
- "Cancel" → **STOP**

## Step 2: Explore Key Changed Files

**Use `Task` tool with `subagent_type: Explore` to understand the changed files in parallel.**
This keeps the main context clean and speeds up analysis on large diffs.

From the `--name-status` output, identify the most important changed files (focus on business logic, skip lock files, generated files, and formatting-only changes).

Launch 1–2 Explore agents simultaneously:

```text
Agent 1 — Core changes:
Task(subagent_type: Explore, model: sonnet, prompt:
  "Read and summarize the key changed files: [list of most important files].
   Focus on: what logic changed, what inputs/outputs changed, what side effects are possible.
   Thoroughness: medium. Be concise.")

Agent 2 — Integration points (if needed):
Task(subagent_type: Explore, model: sonnet, prompt:
  "Find all callers and consumers of [changed modules/functions].
   Identify what adjacent functionality might be affected.
   Thoroughness: quick.")
```

**Fallback:** If the Task tool is unavailable, read the key files directly using Read/Grep.

After agents return, synthesize findings to understand:
- What business logic actually changed
- What dependent code could be affected
- What integration points are at risk

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

## Step 4: Generate the Summary

Use the template from `templates/CHANGE-SUMMARY.md`.

## Step 5: Save Artifact

**Ensure the directory exists before saving:**

```bash
mkdir -p <artifact_dir>
```

Save the result to `<artifact_dir>/change-summary.md`.

## Step 6: Next Step

**If `all_mode = true`** — do NOT show the prompt. Proceed directly to `references/TEST-PLAN.md`.

**Otherwise:**

```text
AskUserQuestion: Change summary saved. Proceed to writing the test plan?

Options:
1. Yes — run /aif-qa test-plan <resolved_branch>
2. No — stop here
```
