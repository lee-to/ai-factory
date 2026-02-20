# Rule Schema

Format, conventions, and scoring formula for evaluation rules.

## Rule Object

```json
{
  "id": "a.correctness.endpoints",
  "description": "All core CRUD endpoints are present with correct HTTP methods",
  "severity": "fail",
  "weight": 2,
  "phase": "A",
  "check": "Verify each endpoint from the task prompt exists in the artifact"
}
```

### Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | yes | Unique identifier (see ID Convention below) |
| `description` | string | yes | Human-readable description of what the rule checks |
| `severity` | enum | yes | `fail`, `warn`, or `info` |
| `weight` | number | yes | Score weight: `fail`=2, `warn`=1, `info`=0 |
| `phase` | string | yes | Phase level when rule activates: `A` or `B` |
| `check` | string | yes | Human-readable instruction for how to verify this rule. PREPARE phase materializes this into concrete executable/content checks |

## ID Convention

Format: `<phase>.<category>.<specific>`

- `<phase>`: `a` (phase A rules) or `b` (phase B rules)
- `<category>`: broad area (e.g., `correctness`, `completeness`, `style`, `performance`, `security`)
- `<specific>`: concrete aspect (e.g., `endpoints`, `naming`, `examples`, `schemas`)

Examples:
- `a.correctness.endpoints` - core endpoints present (phase A)
- `a.completeness.examples` - JSON examples included (phase A)
- `b.style.naming` - consistent naming conventions (phase B)
- `b.performance.pagination` - pagination on list endpoints (phase B)

## Severity Levels

| Severity | Effect | Weight | Description |
|----------|--------|--------|-------------|
| `fail` | Blocks pass | 2 | Must be fixed before iteration can pass |
| `warn` | Reduces score | 1 | Should be fixed but does not hard-block |
| `info` | No score impact | 0 | Informational, tracked but not scored |

## Score Formula

```
score = sum(passed_weights) / sum(all_active_weights)
```

Where:
- `passed_weights` = sum of `weight` for all rules with verdict `pass`
- `all_active_weights` = sum of `weight` for all rules active in current phase level (excluding `info` rules with weight 0)

If `all_active_weights = 0` (all rules are informational), score defaults to `1.0`.

### Overall Pass Condition

```
passed = (score >= threshold) AND (no fail-severity rules have verdict "fail")
```

Both conditions must be true. A high score alone does not pass if any `fail`-severity rule is still failing.

## Phase Activation

- Phase A: only rules with `phase: "A"` are active
- Phase B: rules with `phase: "A"` AND `phase: "B"` are both active

This means phase B is strictly harder than phase A.

## Rule Check → PREPARE Materialization

The `check` field on each rule is a human-readable instruction (e.g., "Verify each endpoint from the task prompt exists in the artifact"). During the PREPARE phase, these instructions are materialized into concrete checks:

- **Content checks** (`type: "content"`): regex/string searches run via Read/Grep against `artifact.md`
- **Executable checks** (`type: "executable"`): shell commands run via Bash (e.g., linters, validators, test scripts)

The EVALUATE phase runs the materialized checks, not the raw `check` strings. See PHASE-CONTRACTS.md for the full check format.

## Template Shorthand → Runtime Rule Normalization

`CRITERIA-TEMPLATES.md` may use shorthand rows for readability. Before iteration 1 starts, each selected row must be normalized into a full runtime rule object and persisted into `run.json.criteria.rules`.

Normalization requirements:

1. Runtime rule objects must include all required fields: `id`, `description`, `severity`, `weight`, `phase`, `check`
2. If `weight` is omitted in template shorthand, derive by severity:
   - `fail` -> `2`
   - `warn` -> `1`
   - `info` -> `0`
3. `check` must be explicit before PREPARE starts (either copied from template row or generated from task-specific constraints)
4. After normalization, evaluator and prepare phases use only `run.json.criteria.rules` (not raw template rows)

## Generating Rules from Interactive Setup

During Interactive Setup (Step 2 of the loop), rules are generated from user answers:

1. **Task type** determines the base template (from CRITERIA-TEMPLATES.md)
2. **Mandatory checks** map to `fail`-severity rules
3. **Quality preferences** map to `warn`-severity rules
4. **Ideal result** is used to generate task-specific rules
5. User can add, remove, or adjust rules before the first iteration

Rules are stored in `run.json.criteria.rules` as a snapshot for reproducibility.
