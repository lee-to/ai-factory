# Phase Contracts

Strict I/O contracts for each phase of the Reflex Loop.

## Execution Preamble

Before executing any phase, set this context:

```text
You are executing phase {PHASE} for run {run_id}, iteration {iteration}, phase level {phase}.
Return only the required output format.
Do not add explanations or commentary outside the specified format.
```

## PLAN

**Input:**
- task prompt
- phase level (A or B)
- active rules (from criteria)
- last 3 history events (if any)
- previous evaluation failures (if resuming after fail)

**Output:**

```json
{ "plan": ["step 1", "step 2", "step 3"] }
```

**Constraints:**
- 3-5 steps max
- each step must target a specific active rule or group of rules
- no speculative architecture changes
- no steps unrelated to passing active rules

## PRODUCE

**Input:**
- task prompt
- plan (from PLAN phase)
- previous artifact (if iteration > 1)

**Output:**
- markdown content only (this becomes `artifact.md`)

**Constraints:**
- implement current plan only
- no meta commentary or explanation text
- preserve unchanged parts from previous artifact when refining
- output is written directly to `artifact.md` on disk

## PREPARE

Runs in parallel with PRODUCE via `Task` tool. Does not need the artifact — works from rules and task prompt.

PREPARE materializes the `rule.check` instructions (human-readable) from each rule into concrete, machine-executable checks. The evaluator uses the prepared checks, not the raw `rule.check` strings.

**Input:**
- task prompt
- plan (from PLAN phase)
- active rules (from criteria) — each rule's `check` field describes what to verify
- phase level (A or B)

**Output:**

```json
{
  "checks": [
    {
      "rule_id": "a.correctness.artifact-non-empty",
      "type": "executable",
      "command": "test -s .ai-factory/evolution/<task-alias>/artifact.md",
      "expected": "artifact file exists and is non-empty (exit code 0)"
    },
    {
      "rule_id": "a.correctness.endpoints",
      "type": "content",
      "search": "GET /courses/{id}/chapters",
      "expected": "Endpoint definition present in artifact"
    },
    {
      "rule_id": "a.completeness.examples",
      "type": "content",
      "search": "\"example\":|examples:",
      "expected": "At least one JSON example per endpoint"
    }
  ]
}
```

**Constraints:**
- materialize each `rule.check` instruction into one or more concrete checks
- generate checks from rules + task prompt only — do not require the artifact
- each check must map to a `rule_id`
- two check types: `executable` (run via Bash, check exit code/output) and `content` (verify via Read/Grep on artifact)
- executable checks must reference the artifact at its actual disk path
- keep checks fast and deterministic
- if no executable checks are needed, omit them (content checks only)

## EVALUATE

Uses artifact from PRODUCE and checks from PREPARE. Spawns parallel `Task` agents for independent check groups.

**Input:**
- artifact content (from `artifact.md` on disk)
- prepared checks (from PREPARE phase)
- active rules (with weights and severities)

**Output:**

```json
{
  "score": 0.72,
  "passed": false,
  "failed": [
    { "id": "a.correctness.endpoints", "severity": "fail", "message": "Missing /courses/{id}/chapters" }
  ],
  "warnings": [
    { "id": "a.style.naming", "severity": "warn", "message": "Inconsistent camelCase in query params" }
  ],
  "rule_results": [
    { "id": "a.correctness.endpoints", "verdict": "fail", "details": "..." },
    { "id": "a.style.naming", "verdict": "warn", "details": "..." },
    { "id": "a.completeness.examples", "verdict": "pass", "details": "..." }
  ]
}
```

**Constraints:**
- evaluate only against active rules
- map every failure to a `rule_id`
- no fix suggestions or solution proposals
- run prepared executable checks via parallel `Task` agents with `Bash`
- run prepared content checks via parallel `Task` agents with `Read`/`Grep`
- aggregate all check results into the score per RULE-SCHEMA.md formula
- if PREPARE returned no checks, evaluate content rules inline

## CRITIQUE

**Input:**
- artifact content
- evaluation result (failed and warning rules)

**Output:**

```json
{
  "issues": [
    {
      "rule_id": "a.correctness.endpoints",
      "problem": "Missing nested lessons endpoint",
      "fix_instruction": "Add GET /courses/{id}/chapters/{chapterId}/lessons endpoint with one JSON example payload",
      "expected_effect": "Rule a.correctness.endpoints passes"
    }
  ]
}
```

**Constraints:**
- max 5 issues per critique
- each issue must map to exactly one failed rule
- `fix_instruction` must be specific and actionable
- no artifact rewrite in this phase

## REFINE

**Input:**
- artifact content
- critique issues

**Output:**
- improved markdown content only (replaces `artifact.md`)

**Constraints:**
- apply only the requested fixes from critique
- preserve all unchanged parts
- no explanation text
- output is written directly to `artifact.md` on disk
