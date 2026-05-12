[Back to README](../README.md) · [Development Workflow](workflow.md) · [Core Skills](skills.md)

# Quality Gates

AI Factory quality gates keep their normal human-readable Markdown reports, then append one final machine-readable block. Handoff, AIFHub, and future orchestrators should parse only the last `aif-gate-result` fenced block in the final gate output instead of scraping prose.

Supported gates:
- `/aif-verify` -> `gate: "verify"`
- `/aif-review` -> `gate: "review"`
- `/aif-security-checklist` -> `gate: "security"`
- `/aif-rules-check` -> `gate: "rules"`

The block must be valid JSON and must appear after the human summary.

## Schema

```aif-gate-result
{
  "schema_version": 1,
  "gate": "verify",
  "status": "fail",
  "blocking": true,
  "blockers": [
    {
      "id": "verify-task-1",
      "severity": "error",
      "file": "src/example.ts",
      "summary": "Required behavior is missing."
    }
  ],
  "affected_files": ["src/example.ts"],
  "suggested_next": {
    "command": "/aif-fix",
    "reason": "Blocking implementation gaps remain."
  }
}
```

Rules:
- `schema_version` is currently `1`.
- `gate` is one of `verify`, `review`, `security`, or `rules`.
- `status` is one of `pass`, `warn`, or `fail`.
- `blocking` is a boolean.
- `blockers` contains only findings that should block the current gate.
- `blockers[].severity` uses `error` or `warning`; security `critical`/`high` maps to `error`, while `medium`/`low` normally remains a non-blocking human warning.
- `affected_files` is a predictable top-level array of files the gate actually evaluated or cited. It is not limited to blocker files. Use `[]` when no files apply.
- `suggested_next.command` is selected from the global allowlist: `/aif-fix`, `/aif-rules`, `/aif-architecture`, `/aif-roadmap`, `/aif-commit`, or `null`. Individual gates may document narrower subsets.

## Status Examples

Pass:

```aif-gate-result
{
  "schema_version": 1,
  "gate": "review",
  "status": "pass",
  "blocking": false,
  "blockers": [],
  "affected_files": ["skills/aif-review/SKILL.md"],
  "suggested_next": {
    "command": "/aif-commit",
    "reason": "Review found no blocking issues."
  }
}
```

Warn:

```aif-gate-result
{
  "schema_version": 1,
  "gate": "rules",
  "status": "warn",
  "blocking": false,
  "blockers": [],
  "affected_files": [],
  "suggested_next": {
    "command": "/aif-rules",
    "reason": "Rules are missing or ambiguous for the changed scope."
  }
}
```

Fail:

```aif-gate-result
{
  "schema_version": 1,
  "gate": "security",
  "status": "fail",
  "blocking": true,
  "blockers": [
    {
      "id": "security-secret-1",
      "severity": "error",
      "file": "src/config.ts",
      "summary": "A hardcoded secret is present."
    }
  ],
  "affected_files": ["src/config.ts"],
  "suggested_next": {
    "command": "/aif-fix",
    "reason": "Remove the exposed secret and rotate it."
  }
}
```

## Compatibility

Manual workflows continue to read the human Markdown summaries. Existing `WARN`, `ERROR`, `PASS`, and `FAIL` labels can remain in those summaries when they are useful for people.

The machine contract is only the final fenced JSON block in actual gate output. Orchestrators should ignore earlier Markdown headings, bullets, and examples.

## Ownership

Quality gates remain read-only for context artifacts by default. If a gate finds stale architecture, roadmap, or rules context, it should suggest the owner command instead of editing the artifact directly.

Exceptions stay with existing command contracts. For example, `/aif-security-checklist ignore <item>` may write the configured security ignored-item artifact, but normal security audit findings are report output.

## See Also

- [Development Workflow](workflow.md) - where gates fit into the workflow
- [Core Skills](skills.md) - command reference for each quality gate
- [Configuration](configuration.md) - artifact ownership and context gate defaults
