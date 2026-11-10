### 3.1 Plan vs Code Drift

Check for discrepancies between what the plan says and what was built:

- **Naming**: Do variable/function/endpoint names match what the plan specified?
- **File locations**: Are files where the plan said they should be?
- **API contracts**: Do endpoint paths, request/response shapes match the plan?

### 3.2 Leftover Artifacts

Search for things that should have been cleaned up:

```
Grep in CHANGED_FILES: [T][O][D][O]|[F][I][X][M][E]|HACK|[X][X][X]|TEMP|PLACEHOLDER|console\.log\(.*debug|print\(.*debug
```

Report any found — they might be intentional, but flag them.

### 3.3 Configuration & Environment

Check if the implementation introduced any new config requirements:

- New environment variables referenced but not documented
- New config files mentioned in code but not created
- Database migrations created but not documented in README/docs

```
Grep in CHANGED_FILES: process\.env\.|os\.Getenv\(|os\.environ|env\(|getenv\(|config\(
```

Cross-reference with `.env.example`, `.env.local`, README, or docs to ensure they're documented.

### 3.4 DESCRIPTION.md Sync

Check if `.ai-factory/DESCRIPTION.md` reflects the current state:

- New dependencies/libraries added during implementation → should be listed
- Architecture changes → should be reflected
- New integrations → should be documented

### 3.5 Context Gates (Architecture / Roadmap / Rules)

Apply the canonical `references/CONTEXT-GATES-AND-OWNERSHIP.md` and `references/GATE-RESULT-CONTRACT.md` loaded in Step 0.1; do not maintain a second copy of their thresholds or schema here.

Report architecture, rules, and roadmap gates explicitly. Prefer the plan's `## Roadmap Linkage` (or its clear localized equivalent) where present, checking every `Milestone:` and `Also completes:` entry (including clear localized labels) independently against its scope and evidence; a completed primary milestone does not establish completion of the others. Missing context or ambiguous mapping is a warning; explicit architecture/rule violations fail, clear roadmap contradictions follow the normal/strict thresholds. Missing milestone linkage remains a warning even in strict mode. Human context-gate labels remain `WARN` / `ERROR`; the final JSON uses `pass` / `warn` / `fail` and `"gate": "verify"`. Suggest `/aif-rules-check` when a standalone rules-only pass is useful.

### 3.6 Context Drift (Optional Remediation)

`/aif-verify` is **read-only** for context artifacts. Do not edit or regenerate `.ai-factory/*` files here.

If you detect that a context artifact is stale, missing, or ambiguous, report it as a drift finding and provide the owner-command remediation:

- `DESCRIPTION.md` drift → suggest `/aif` (or note that `/aif-implement` should have updated it during implementation)
- `ARCHITECTURE.md` drift → suggest `/aif-architecture`
- `ROADMAP.md` drift → suggest `/aif-roadmap check` (or `/aif-roadmap <update request>`)
- `RULES.md` drift → suggest `/aif-rules <rule text>`

Ask the user a single optional question **only if** drift was detected and fixing it now would materially improve correctness:

```
AskUserQuestion: Context drift detected. Capture updates now?

Options:
1. Yes — show the exact commands to run (recommended)
2. No — proceed without updating context
```

---
