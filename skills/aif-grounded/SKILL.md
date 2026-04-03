---
name: aif-grounded
description: Reliability gate for answers. Forces evidence-based reasoning, explicit uncertainty, and “insufficient information” instead of guesses. Use when user says “be 100% sure”, “no hallucinations”, “only if verified”, “grounded answer”, or when stakes are high.
argument-hint: "[question or task]"
allowed-tools: Read Write Edit Glob Grep Bash AskUserQuestion Questions
disable-model-invocation: true
---

# Grounded - Reliability Gate (No Guessing)

This skill minimizes random / fabricated answers by enforcing a strict rule:

**Only provide the final answer if confidence is 100/100 based on evidence available.**

If confidence is not 100, **do not guess** and **do not implement**. Output a short “what’s missing” checklist that explains what would be required to reach 100.

## When to use

Use when:
- The user requests maximum reliability (“only if you’re sure”, “no assumptions”).
- The request includes changeable facts (versions, “latest”, policies, prices, schedules).
- The request is security/finance/legal/medical adjacent (high stakes).
- You’re resuming after context loss and need to avoid accidental assumptions.

## Workflow

### Step 0: Load Skill Context

**Read `.ai-factory/skill-context/aif-grounded/SKILL.md`** — MANDATORY if the file exists.

This file contains project-specific rules accumulated by `/aif-evolve` from patches,
codebase conventions, and tech-stack analysis. These rules are tailored to the current project.

**How to apply skill-context rules:**
- Treat them as **project-level overrides** for this skill's general instructions
- When a skill-context rule conflicts with a general rule written in this SKILL.md,
  **the skill-context rule wins** (more specific context takes priority — same principle as nested CLAUDE.md files)
- When there is no conflict, apply both: general rules from SKILL.md + project rules from skill-context
- Do NOT ignore skill-context rules even if they seem to contradict this skill's defaults —
  they exist because the project's experience proved the default insufficient
- **CRITICAL:** skill-context rules apply to ALL outputs of this skill — including the response
  format, evidence requirements, and confidence assessment. If a skill-context rule says "analysis
  MUST include X" or "confidence MUST account for Y" — you MUST comply. Producing an analysis
  that ignores skill-context rules is a bug.

**Enforcement:** After generating any output artifact, verify it against all skill-context rules.
If any rule is violated — fix the output before presenting it to the user.

### Step 1: Classify the request

Classify into one of:
1. **Repo-grounded** — can be answered purely from the local codebase and command outputs.
2. **Doc-grounded** — requires authoritative docs/specs/logs provided by the user or accessible tooling.
3. **External-facts** — depends on changeable facts outside the repo (must be verified, otherwise refuse).

### Step 2: Define evidence and unknowns

Before answering, list:
- **Evidence sources** you will use (files, command outputs, provided docs).
- **Unknowns** (anything not present in evidence).

Hard rule:
- If a claim is not supported by evidence, it becomes an **unknown** (not an assumption).

### Step 3: Mandatory verification for changeable facts

If the request contains any changeable fact (“latest”, “current”, “today”, “default in vX”, “does library Y support Z now”):
- Verify via authoritative docs/specs, release notes, or logs.
- If verification is not possible with available tools/context, return **INSUFFICIENT INFORMATION** and ask for the needed source (link excerpt, version, log output).

### Step 4: Confidence gate

Compute a confidence score 0–100:
- **100** only if every factual claim is supported by evidence you can point to (repo files, command outputs, provided docs), and there are **no open unknowns**.
- If any unknown remains → confidence < 100 → do not answer/implement.

### Step 5: Output format (strict)

If confidence is **100**:
```
Answer:
<final answer or patch summary>

Confidence: 100/100
Evidence:
- <file/command/doc used>

Checks:
- <3 concrete checks someone can run/inspect to confirm>
```

If confidence is **< 100**:
```
Result: INSUFFICIENT INFORMATION (no guessing)
Current confidence: <N>/100
Why not 100:
- <top reasons>

Missing evidence:
- <what exact file/output/doc is needed>

To reach 100:
- <1–3 concrete asks or commands for the user to run and paste output>
```

## Artifact Ownership and Config Policy

- Primary ownership: none. This skill is a reliability gate for answers, not an artifact-producing workflow.
- Write policy: do not create or modify project artifacts by default.
- Config policy: config-agnostic by design. Evidence comes from the repo, command outputs, provided docs, and authoritative sources, not from `config.yaml`.

## Implementation guardrail

If the user asks for code changes:
- You may explore the repo and propose what evidence is needed.
- Only apply patches once confidence can be 100 (e.g., requirements are precise + you can verify build/tests or equivalent checks).
- If the repo lacks a verification path (no build/tests and behavior can’t be validated), do not claim 100; return INSUFFICIENT INFORMATION and propose the minimal validation needed.
