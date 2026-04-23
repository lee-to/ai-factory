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

## Verdict Semantics

`PASS` - at least one applicable rule was checked and no clear violations were found.
`WARN` - no applicable rules were resolved, evidence is ambiguous, or there are no changed files to evaluate.
`FAIL` - an explicit hard rule is clearly violated by the inspected diff or changed files.

## Severity Boundary

`PASS` / `WARN` / `FAIL` belongs only to `/aif-rules-check`; `/aif-commit`, `/aif-review`, and `/aif-verify` keep `WARN` / `ERROR`.

## Read-Only Contract

- `/aif-rules-check` does not edit rule artifacts or source files.
- Missing optional rule files stay `WARN`.
- Rule updates still route through `/aif-rules`.
