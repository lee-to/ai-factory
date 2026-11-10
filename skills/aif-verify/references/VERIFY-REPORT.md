## Step 4: Verification Report

### 4.1 Display Results

Write the human-readable verification report in `ui_language`. The template below defines structure only; keep stable technical tokens and the final `aif-gate-result` JSON schema unchanged.

Include a per-task table (task ID, description, status, notes), build/test/lint results, requirement-source reconciliation, supported combinations, representative artifact evidence, issues and clean checks. For a worked rendering only when needed, read `references/VERIFY-EXAMPLES.md`.

### 4.2 Determine Overall Status

- **All Green** — everything verified, no issues
- **Minor Issues** — small gaps that can be fixed quickly
- **Significant Gaps** — tasks missing or partially done, needs re-implementation

### 4.2.1 Append Machine-Readable Gate Result

After the human-readable report and overall status, append exactly one final `aif-gate-result` fenced JSON block.

```aif-gate-result
{
  "schema_version": 1,
  "gate": "verify",
  "status": "pass",
  "blocking": false,
  "blockers": [],
  "affected_files": [],
  "suggested_next": {
    "command": "/aif-commit",
    "reason": "Verification passed without blockers."
  }
}
```

Schema reminder: `"status": "pass|warn|fail"`, `"blocking": true|false`, `"blockers": [`, `"affected_files": [`, `"suggested_next": {`.

### 4.3 Action on Issues

If issues were found:

```
AskUserQuestion: Verification found issues. What should we do?

Options:
1. Fix now (recommended) — Use /aif-fix to address all issues
2. Fix critical only — Use /aif-fix for incomplete tasks, skip warnings
3. Fix directly here — Address issues in this session without /aif-fix
4. Accept as-is — Mark everything as done, move on
```

**If "Fix now" or "Fix critical only":**
- First suggest using `/aif-fix` and pass a concise issue summary as argument
- Example:
  - `/aif-fix complete Task #3 password reset email flow, implement Task #8 docs update, remove unfinished markers in src/services/auth.ts and src/middleware/rate-limit.ts, document SENDGRID_API_KEY in .env.example`
- If user agrees, proceed via `/aif-fix`
- If user declines `/aif-fix`, continue with direct implementation in this session
- For each incomplete/partial task — implement the missing pieces (follow the same implementation rules as `/aif-implement`)
- For unfinished markers/debug artifacts — clean them up
- For undocumented config — update `.env.example` and docs
- After fixing, re-run the relevant verification checks to confirm

**If "Accept as-is":**
- Note the accepted issues in the plan entrypoint as a comment
- Continue to Step 5

---

## Step 5: Suggest Follow-Up Skills

After verification is complete, suggest next steps based on result:

- If unresolved issues remain (accepted or deferred), suggest `/aif-fix` first
- If all green, suggest security/review/commit flow

```
## Verification Complete

Suggested next steps:

1. 🛠️ /aif-fix [issue summary] — Fix remaining verification issues
2. 🔒 /aif-security-checklist — Run security audit on the new code
3. 👀 /aif-review — Code review of the implementation
4. 💾 /aif-commit — Commit the changes

Which would you like to run? (or skip all)
```

```
AskUserQuestion: Run additional checks?

Options:
1. Fix issues — Run /aif-fix with verification findings
2. Security check — Run /aif-security-checklist on changed files
3. Code review — Run /aif-review on the implementation
4. Both — Run security check, then code review
5. Skip — Proceed to commit
```

**If fix issues selected** → suggest invoking `/aif-fix <issue summary>`
**If security check selected** → suggest invoking `/aif-security-checklist`
**If code review selected** → suggest invoking `/aif-review`
**If both** → suggest security first, then review
**If skip** → suggest `/aif-commit`

### Context Cleanup

Suggest the user to free up context space if needed: `/clear` (full reset) or `/compact` (compress history).

---
