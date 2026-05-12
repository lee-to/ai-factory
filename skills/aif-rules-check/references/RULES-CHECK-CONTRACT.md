# Rules Compliance Report

**Overall Verdict:** PASS | WARN | FAIL
**Files Checked:** <count>

### Gate Results
- PASS [rules] <summary>
- WARN [rules] <summary>
- FAIL [rules] <summary>

### Blocking Violations
- <file>: <explicit hard-rule violation tied to rule text>

### Suggested Fixes
- <concrete code or workflow fix>

### Suggested Rule Updates
- <candidate rule to add or clarify via /aif-rules>

### Machine-Readable Gate Result

Append one final fenced JSON block after the human-readable report:

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

Schema reminder: `"status": "pass|warn|fail"`, `"blocking": true|false`, `"blockers": [`, `"affected_files": [`, `"suggested_next": {`.

## Verdict Semantics

`PASS` - at least one applicable rule was checked and no clear violations were found.
`WARN` - no applicable rules were resolved, evidence is ambiguous, or there are no changed files to evaluate.
`FAIL` - an explicit hard rule is clearly violated by the inspected diff or changed files.

## Machine-Readable Summary Boundary

The human rules report keeps `PASS` / `WARN` / `FAIL`. The final machine-readable summary uses lowercase `pass` / `warn` / `fail` in the `aif-gate-result` JSON block, matching the shared quality gate result contract.

## Read-Only Contract

- `/aif-rules-check` does not edit rule artifacts or source files.
- Missing optional rule files stay `WARN`.
- Rule updates still route through `/aif-rules`.
