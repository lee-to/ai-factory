---
name: aif-architecture
description: Generate architecture guidelines for the project. Analyzes tech stack from DESCRIPTION.md, recommends an architecture pattern, and creates .ai-factory/ARCHITECTURE.md. Use when setting up project architecture, asking "which architecture", or after /aif setup.
argument-hint: "[layers | structured[-layers|-vertical] | explicit[-layers|-vertical|-flat] | microservices[-single|-monorepo] | clean | ddd | monolith | vertical] [--style=subfolders|unified] [--policy=adapt|strict]"
allowed-tools: Read Write Edit Glob Grep Bash(mkdir *) AskUserQuestion Questions
disable-model-invocation: false
---

# Architecture - Generate Architecture Guidelines

## Runtime-aware questions

Apply this contract whenever the workflow asks the user to decide:

- `AskUserQuestion` and `Questions` below describe the intended interaction, not a required tool name. Use only a question tool actually exposed and permitted in the current session/mode, with its advertised schema. Do not guess aliases, probe unavailable tools, or assume `questionnaire` exists. A frontmatter entry alone does not make a tool available.
- Ask one focused question at a time with clearly labelled options. Batch independent questions only if the actual tool schema supports it; respect its field names, limits, and selection semantics. For open-ended input, use native free-text support or plain text if the schema cannot represent the question. Use the resolved UI language.
- If no usable question tool exists (or it reports unavailable in this mode), ask the same question in plain text with numbered options and allow a free-text answer. Pause work that depends on that answer; independent read-only investigation may continue. Missing UI does not make the session autonomous.
- An empty/cancelled response, a preselected option, or elapsed time is not an answer or approval. Reuse an answer already given in the session instead of asking again.
- In a subagent/background run or explicit non-interactive mode (including `HANDOFF_MODE=1`), do not prompt the user directly. Use declared defaults only for optional preferences within the authorized scope and report assumptions. If a required decision, approval, or material scope/behavior choice remains unresolved, stop dependent work and return the missing decision and options to the parent/caller using its existing blocked/failure contract. Never invent consent or select a new scope to avoid blocking.

This delivery policy applies to this skill and its linked references. Preserve workflow-specific question scope, required confirmations, approval boundaries, and blocked-result rules.

## Shared project skill-context

Before mode routing or work, read existing files relative to the current project root in this order (reuse them if already loaded):

1. `.ai-factory/skill-context/global-skill-context.md` — all bundled skills.
2. `.ai-factory/skill-context/aif-architecture/SKILL.md` — this skill.

Missing files are skipped; an existing unreadable file stops dependent work with its path.
Precedence: individual > build (when applicable) > global > skill defaults; retain non-conflicting instructions and check all outputs against the effective rules.
These layers customize workflow; they do not replace the project's rules/architecture hierarchy or relax explicit requirements, ownership, scope, safety/privacy, validation, or approval boundaries. Report conflicts with those boundaries instead of overriding them.
`global` is a project-local layer, not home-directory configuration. Custom/extension skills do not automatically use it.

**Read `.ai-factory/skill-context/aif-architecture/SKILL.md`** — MANDATORY if the file exists.

This file contains project-specific rules accumulated by `/aif-evolve` from patches,
codebase conventions, and tech-stack analysis. These rules are tailored to the current project.

**How to apply skill-context rules:**
- Treat them as **project-level overrides** for this skill's general instructions
- When a skill-context rule conflicts with a general rule written in this SKILL.md,
  **the skill-context rule wins** (more specific context takes priority — same principle as nested CLAUDE.md files)
- When there is no conflict, apply both: general rules from SKILL.md + project rules from skill-context
- Do NOT ignore skill-context rules even if they seem to contradict this skill's defaults —
  they exist because the project's experience proved the default insufficient
- **CRITICAL:** skill-context rules apply to ALL outputs of this skill — including the
  ARCHITECTURE.md template. The template in this SKILL.md is a **base structure**. If a skill-context
  rule says "architecture doc MUST include X" or "MUST cover section Y" — you MUST augment the
  template accordingly. Generating ARCHITECTURE.md that violates skill-context rules is a bug.

**Enforcement:** After generating any output artifact, verify it against all skill-context rules.
If any rule is violated — fix the output before presenting it to the user.

Generate the resolved architecture artifact (default `.ai-factory/ARCHITECTURE.md`; `paths.architecture` overrides) with architecture decisions tailored to the project.

## Workflow

Execute the steps below in order. Do not write the architecture artifact or update companion files until all required decisions are resolved.

`BLOCKED` is a terminal result for all dependent work: stop before Step 7, do not write the architecture artifact or companion files, and report (a) the exact missing decision or evidence, (b) why it is required, and (c) the valid choices or evidence needed to continue. Do not replace a blocked decision with a default or assumption. Read-only work that does not depend on the missing item may continue only when it can materially help explain the block.

### Step 0: Load configuration and project context

1. Read `.ai-factory/config.yaml` if it exists. If it exists but cannot be read or parsed as YAML, return `BLOCKED`; do not silently use defaults.
2. Resolve only these configuration keys:
   - `paths.description` — default `.ai-factory/DESCRIPTION.md`.
   - `paths.architecture` — default `.ai-factory/ARCHITECTURE.md`.
   - `language.ui` — default `en`; use for questions and user-facing reports.
   - `language.artifacts` — default `en`; use for generated or updated Markdown artifacts.
   The configuration document's root must be a YAML mapping. If `paths` or `language` is present, each must also be a YAML mapping. If either language key is present, it must be a non-empty string. Otherwise return `BLOCKED`; do not guess or silently fall back.
3. For each path key, use its default only when the key is absent; if present but not a non-empty string, return `BLOCKED` instead of falling back. Require project-relative paths (reject absolute paths), normalize `.` and `..` segments, reject any path escaping the project root, and do not expand environment variables or `~`. Normalize resolved paths using the host filesystem's comparison semantics (including case sensitivity) before checking for collisions. If any existing path component is a symlink, verify via available read-only tooling that its target stays inside the project root; if this cannot be established, return `BLOCKED` instead of writing through an unverified symlink. Compare both normalized paths and verified canonical destinations for collisions.
4. If the resolved architecture path is the same as the DESCRIPTION path, or either path resolves to root `AGENTS.md`, return `BLOCKED` before any write; these path collisions could overwrite project context or a companion file.
5. If invoked by `/aif`, use the configuration written for that setup run; do not re-resolve language choices or ask for them again.
6. Read the resolved DESCRIPTION file if it exists. If it exists but is unreadable, return `BLOCKED` with its path. Extract:
   - project purpose and type;
   - languages, frameworks, databases, ORMs, and deployment model;
   - team size and expected scale, when stated;
   - domain complexity and non-functional requirements.
7. Ensure the available context is sufficient to evaluate architecture. At minimum, it must establish what is being built, the principal technology stack, and the material domain or operational constraints. Team size and expected scale are supporting factors: use them when stated, but do not invent them.
8. If DESCRIPTION does not exist or its content is insufficient:
   - If the user supplied the missing details in the current conversation or invocation, combine them with the file content.
   - Otherwise, ask one focused question at a time in interactive mode. Start with the missing project purpose/type, then ask about the principal technology stack, then material domain or operational constraints. Ask about team size or expected scale only when those facts are needed and are not available.
   - In non-interactive mode, return `BLOCKED` with the specific missing context. Do not infer a project type or recommend a pattern without sufficient evidence.
9. Record whether the resolved architecture path exists and whether it is a regular file. If the path exists but is a directory, device, socket, or other non-regular object, return `BLOCKED`; do not attempt to overwrite it. Do not modify the artifact in this step.
10. Read `.ai-factory/skill-context/aif-architecture/SKILL.md` and `.ai-factory/skill-context/global-skill-context.md` if they exist. If an existing skill-context file cannot be read, return `BLOCKED` with its path. Extract all project-specific rules and constraints so they govern decision resolution, artifact generation, and validation.

Do not read or write unrelated configuration keys.

### Step 1: Load architecture references

Read `references/INDEX.md` in full before evaluating or generating architecture. It is the authoritative source for:

- the architecture decision matrix and selection heuristics;
- canonical pattern and variant names;
- shared terminology and action organization styles;
- naming/casing flexibility and channel handling.

In this step, read the stack-relevant sections of `references/STACK-BLUEPRINTS.md`. Do not yet read a pattern-specific reference: the pattern and variant are resolved in Steps 3-4.

Immediately after Step 4 has resolved the pattern and variant, and before Step 5 begins, read exactly one corresponding pattern reference in full:

- Layered Architecture → `references/LAYERED.md`
- Structured Modules → `references/STRUCTURED-MODULES.md`
- Explicit Architecture → `references/EXPLICIT-ARCHITECTURE.md`
- Microservices → `references/MICROSERVICES.md`

At that same point, read the sections of `references/DOMAIN-MODELING.md` relevant to the resolved stack, pattern, and variant. Read `references/PERSISTENCE-AND-ORM.md` when the project uses a database/ORM or persistence boundaries materially affect the design. Read `references/MIGRATIONS.md` only when migration guidance is needed to explain how existing code should evolve. Do not read other pattern references unless the user explicitly requests a comparison.

If a required reference is missing or unreadable, stop before generating the artifact and report its path. Do not replace reference requirements with guesses.

### Step 2: Survey and classify the codebase

Perform a bounded, read-only survey using `Glob` for file-path discovery and `Read` on representative files. Exclude dependency, cache, vendor, and build directories according to repository conventions and `.gitignore` (for example `node_modules`, `vendor`, `target`, `dist`). Do not create, edit, or delete files during this survey.

Classify the project as exactly one of:

- **Clean / starter scaffolding:** no custom domain behavior. Framework entry points, generated layouts, starter auth/scaffolding, configuration, and utilities do not make a project Existing. Classify as Clean if observed files represent standard framework scaffolding.
- **Existing codebase:** at least one file contains project-specific domain behavior (custom domain models, business services, business rules, or domain routes). Preserve this code.

Build a concise structural inventory of the codebase:
- Technical-layer roots and feature/module/context roots (`src/`, `app/`, etc.);
- Delivery folders, routes, entry points, and controllers;
- Domain, persistence, and service locations;
- Per-feature subfolders versus unified multi-action files.

Retain representative file paths supporting each finding. Do not treat absent canonical folders as structural conflicts.

### Decision precedence used by Steps 3-6

Apply these sources in descending order of authority:

1. Explicit, valid choices supplied in the current skill invocation, including its arguments and accompanying user message.
2. Explicit choices or clarifications supplied by the user later during this same architecture run.
3. Project-specific rules from skill-context (`aif-architecture/SKILL.md` > `global-skill-context.md`).
4. The workflow's detection rules applied to repository evidence.
5. Declared defaults in this skill and its references.

Do not reuse choices from earlier, separate architecture runs unless the user explicitly repeats them in the current run. A lower-priority source must never override a higher-priority choice. Within the same priority level, use the latest unambiguous explicit user instruction in the current run (for repeated command options, use the last valid occurrence per Step 3.1). If chronology does not resolve conflicting explicit choices, ask one focused question in interactive mode or return `BLOCKED` in non-interactive mode. Configuration values are authoritative only for the keys explicitly resolved in Step 0; they do not silently select a pattern, variant, style, or alignment policy. Do not infer approval from a default, recommendation, or preselected option.

### Step 3: Resolve the architecture pattern

Resolve the base pattern before resolving its variant, alignment policy, or action organization style.

#### 3.1 Parse invocation arguments

Parse the complete invocation once, before resolving any decision. Parsing is case-sensitive and uses the exact token spellings shown below.

1. Parse `--style=VALUE` and `--policy=VALUE` wherever they occur in the invocation, independently of positional tokens. The value is the text after the first `=`. A recognized option and its value are never positional tokens.
2. For each option, retain the last valid occurrence. An invalid occurrence is reported and ignored; it does not erase an earlier valid occurrence. If an option is repeated and a later valid occurrence overrides an earlier valid one, report the override.
3. A token beginning with `--` that is not one of the two supported options, or that uses a malformed form (including a missing `=` or empty value), is an unrecognized option. Report it and do not reinterpret it as a positional token.
4. All remaining tokens are positional tokens. Parse them using the table and rules below. Do not infer intent from free-form text or from a token that is not listed.
5. A clear natural-language choice made by the user in the current architecture run also counts as an explicit choice when it maps unambiguously to one canonical pattern, variant, style, or policy. Do not reuse choices from earlier, separate runs. If the wording could map to more than one choice, ask one focused clarification question; do not guess. A question, preference hint, or description of project needs is not itself a choice.

Recognized pattern tokens:

| Token | Resolved pattern | Variant resolved by token |
|---|---|---|
| `layers` | Layered Architecture | None |
| `structured` | Structured Modules | None |
| `explicit` | Explicit Architecture | None |
| `microservices` | Microservices | None |
| `clean`, `ddd` | Explicit Architecture (legacy aliases) | None |
| `monolith` | Structured Modules (legacy alias) | None |
| `vertical` | Explicit Architecture | Vertical Slice By Entity |
| `structured-layers` | Structured Modules | Technical Layers |
| `structured-vertical` | Structured Modules | Vertical Slices By Entity |
| `explicit-layers` | Explicit Architecture | Architectural Layers |
| `explicit-vertical` | Explicit Architecture | Vertical Slice By Entity |
| `explicit-flat` | Explicit Architecture | Flat Vertical Slice - Simplified |
| `microservices-single` | Microservices | Single Service Repository |
| `microservices-monorepo` | Microservices | Monorepo |

Positional parsing rules:

1. The first positional token must be a recognized pattern token. If there are no positional tokens, no explicit pattern was supplied. If the first positional token is unrecognized, report it; do not search later tokens for a replacement pattern.
2. If the first token resolves a pattern but not a variant, only the immediately following positional token may resolve the variant, and only when valid for that pattern:
   - `structured layers` or `structured vertical`;
   - `explicit layers`, `explicit vertical`, or `explicit flat`;
   - `microservices single` or `microservices monorepo`.
3. A token that resolves a different pattern, an invalid variant, or any extra positional token is unrecognized. Report it; do not reinterpret it as a new pattern.
4. A token that already resolves a variant cannot consume another variant token. For example, `explicit-layers vertical` reports `vertical` as unrecognized.
5. Legacy aliases resolve exactly as shown in the table. `clean`, `ddd`, and `monolith` do not implicitly select a structural variant.
6. A standalone `vertical` token resolves Explicit Architecture with Vertical Slice By Entity, as specified in the table.
7. If the first positional token is unrecognized, return `BLOCKED` and request a valid pattern token; do not fall back to automatic recommendation. If an extra positional token follows a valid pattern/variant selection, report it as unrecognized and continue with the already resolved selection. Never reinterpret an unrecognized token as another pattern or variant.
8. The legacy token `clean` is an alias for Explicit Architecture. It does not mean that the codebase classification is Clean / starter scaffolding; determine codebase classification independently in Step 2.

If a recognized pattern token or an unambiguous conversational pattern choice is present, use it and skip automatic pattern recommendation. If no explicit pattern choice is present, evaluate the project using the decision matrix in `references/INDEX.md`.

#### 3.2 Evaluate when no pattern was specified

Use the project's actual evidence, not keyword matching alone. Consider team size, domain complexity, expected lifecycle, scaling and deployment needs, technology stack, and the codebase survey.

Use the INDEX decision matrix and two-phase decision algorithm as the primary guide:

- **Microservices** only when independent service boundaries are justified by multiple strong signals, such as autonomous teams, independent deployment, distinct scaling needs, or polyglot persistence. Do not recommend them solely because the project uses Docker, Kubernetes, or a message broker.
- **Explicit Architecture** when strict isolation of complex domain rules from frameworks and persistence is a real requirement, not merely a preference for DDD terminology.
- **Structured Modules** for a growing multi-feature application that benefits from cohesive module boundaries without the full cost of explicit ports and adapters.
- **Layered Architecture** for a small, straightforward CRUD application where minimizing initial complexity is more valuable than strong module boundaries.

Interactive mode, when no explicit pattern choice was supplied: present one recommendation with evidence-based reasons and the meaningful alternatives. Ask the user to choose exactly one of the four base patterns (Layered Architecture, Structured Modules, Explicit Architecture, Microservices). Do not include structural variants in this question and do not collapse the pattern and variant choices into a single prompt. Wait for the user's pattern selection before resolving any structural variant in Step 4. Do not continue until a valid choice is received.

Non-interactive mode, when no explicit pattern choice was supplied: return `BLOCKED` for both Clean and Existing codebases. Include the evidence-based recommendation, meaningful alternatives, and accepted pattern tokens. The base pattern is a required architecture decision, not an optional preference; do not select it on the user's behalf.

A valid user-provided pattern is an explicit choice; do not replace it with the recommendation. If the chosen pattern appears unsuitable, explain the evidence-based trade-off in the report but continue with the requested pattern. An invalid or unrecognized pattern token is not a valid user choice.

### Step 4: Resolve the structural variant

Layered Architecture has no structural variant. Skip this step for Layered.

In interactive mode, resolve the variant only as a separate follow-up question after the base pattern has been selected in Step 3. Never combine the base pattern choice and the structural variant choice into a single question.

The available variants are:

| Pattern | Variant | Canonical token |
|---|---|---|
| Structured Modules | Technical Layers | `structured-layers` |
| Structured Modules | Vertical Slices By Entity | `structured-vertical` |
| Explicit Architecture | Architectural Layers | `explicit-layers` |
| Explicit Architecture | Vertical Slice By Entity | `explicit-vertical` |
| Explicit Architecture | Flat Vertical Slice - Simplified | `explicit-flat` |
| Microservices | Single Service Repository | `microservices-single` |
| Microservices | Monorepo | `microservices-monorepo` |

Resolve the variant using this precedence:

1. An unambiguous explicit variant choice made by the user in the current run, either as a recognized positional token or in natural language.
2. A valid immediately-following variant token parsed under Step 3.1.
3. For an Existing codebase, an unambiguous variant demonstrated by the structural inventory.
4. The canonical default for a Clean project:
   - Structured Modules → Technical Layers.
   - Explicit Architecture → Architectural Layers.
   - Microservices → Single Service Repository.

For an Existing codebase with an unambiguous detected variant and no explicit variant:
- Interactive mode: show the evidence and ask whether to retain the detected variant or choose another valid variant. The detected variant is the preselected recommendation, not user approval; wait for an answer.
- Non-interactive mode: return `BLOCKED` with the detected variant, its evidence, and the alternatives. Detection does not authorize a material architecture choice.

For an Existing codebase with no explicit or unambiguous detected variant:
- Interactive mode: ask the user to choose from the variants available for the resolved pattern.
- Non-interactive mode: return `BLOCKED` with those options and the canonical tokens that resolve them.

For a Clean project with no explicit variant:
- Interactive mode: present the canonical default as the recommendation, explain briefly why it is the default, and ask the user to confirm it or choose another available variant.
- Non-interactive mode: return `BLOCKED` with the canonical default, the available alternatives, and their canonical tokens. A structural variant is a material architecture decision, not an optional preference.

If an explicit variant conflicts with observed structure, keep the explicit variant and report the mismatch; do not ask the user to reconfirm it.

Detection rules for Existing codebases:

- **Microservices:** one independently deployable service root indicates Single Service Repository; multiple independently deployable service roots in one repository indicate Monorepo. A directory containing several modules is not, by itself, evidence of multiple services.
- **Structured Modules:** per-entity slice folders indicate Vertical Slices By Entity. If there are no per-entity slices but there are role-named technical-layer folders, detect Technical Layers. Otherwise, mark the variant ambiguous.
- **Explicit Architecture:** per-entity slices containing `Application`, `Infrastructure`, or `Presentation` role folders indicate Vertical Slice By Entity. Per-entity slices without those nested layer folders indicate Flat Vertical Slice - Simplified. If there are no per-entity slices but there are architectural ring/layer folders, detect Architectural Layers. If slices disagree, mark the variant ambiguous.

An explicit variant always wins over detection. Report any mismatch between the requested variant and the observed structure; do not silently rewrite the user's choice.

### Step 5: Resolve the alignment policy

This step applies only to Existing codebases. Clean projects skip it.

Compare the surveyed structure with the canonical structure and dependency rules for the exact pattern and variant resolved in Steps 3-4. Use the selected pattern reference as the authority.

A discrepancy exists only when observed project code has a structural placement or dependency direction that the selected architecture does not permit. Examples include domain logic placed in a delivery layer, infrastructure dependencies flowing inward, or a module importing another module's private implementation.

The following are not discrepancies by themselves:

- a canonical directory or file that does not yet exist;
- different casing or stack-idiomatic names for the same architectural role;
- a different but reference-approved synonymous directory name;
- a file-level quality concern that does not change architectural placement or dependency direction.

Resolve the policy as follows:

1. Determine whether any discrepancy exists. If none exist, fix the policy as `Strict (already conforming)` and report any Adapt/Strict choice or `--policy` value as an ignored no-op; do not ask for a policy choice.
2. If one or more discrepancies exist, use an unambiguous explicit user choice of Adapt or Strict (in natural language or as the last valid `--policy` value parsed in Step 3.1). Report and ignore malformed or unsupported option values; if no explicit choice remains, treat the policy as unspecified.

**No discrepancies — conforming**

Set the alignment policy to `strict (already conforming)`. This means new code follows the selected architecture. It does not create a legacy quarantine section because no non-conforming legacy structure was found. Do not ask the user to choose `adapt` or `strict`.

**One or more discrepancies**

- `--policy=adapt` selects Adapt.
- `--policy=strict` selects Strict.
- Repeated and invalid values follow the parser rules in Step 3.1.

Without a valid explicit policy choice:
- Interactive mode: ask the user to choose:
  1. **Adapt** — document the current structure accurately, identify deviations from the target, and recommend that new code follow the target boundaries where practical.
  2. **Strict** — document the canonical target architecture and logically isolate non-conforming existing code as legacy without physical file relocation. Do not refactor unrelated legacy code automatically.
- Non-interactive mode: return `BLOCKED` with the detected discrepancies and the two policy options.

Policy semantics:

- **Adapt:** the generated folder tree and dependency rules describe the selected target architecture. Add a clearly labelled `Current-State Deviations` subsection that records the actual existing locations and explains which target rules they do not yet satisfy. Do not present those deviations as allowed target dependencies.
- **Strict:** generate the canonical target tree and dependency rules purely according to the chosen pattern without compromising for existing files. Add `Legacy vs New Code Policy` where non-conforming existing code is isolated logically without physical file relocation (existing non-conforming locations stay frozen; no files are moved or renamed automatically). Include concrete migration instructions: map existing non-conforming paths to target architectural locations, with required namespace, configuration, and binding updates. The user decides whether to physically relocate legacy code into a dedicated quarantine folder or refactor it into the target architecture in future tasks. New code follows the target architecture; migrate legacy code only when a planned task explicitly touches that area or the user requests a refactor.

The alignment policy does not apply to Clean projects. Any natural-language Adapt/Strict choice or `--policy` value on a Clean project is a no-op; report it as ignored. For a conforming Existing codebase, use `Strict (already conforming)` regardless of an Adapt/Strict choice or `--policy` value, report that choice/value as a no-op, and do not create an Adapt or legacy-quarantine section.

### Step 6: Resolve action organization style

Layered Architecture has no style choice. It always uses unified per-entity Controller/Service files. Skip this step for Layered; any natural-language Style 1/Style 2 choice or `--style` value is a no-op and must be reported as ignored.

For all other patterns, use one style consistently throughout the generated folder tree:

- **Style 1 — Feature Subfolders:** each use case has its own `[FeatureName]/` folder in every layer it touches, including delivery, with its use-case DTO placed inside that feature folder. Shared backend schemas and base DTOs belong in entity-level `_Shared/` (`Slices/[EntityName]/_Shared/`), intra-channel assets in `[Channel]/_Shared/`, and cross-channel UI in `Presentation/Web/_Shared/Components/`, as prescribed by `references/INDEX.md`; feature folders must not import directly from sibling feature folders.
- **Style 2 — Unified Multi-Action:** use per-entity Controller/Service files and place related DTOs next to the service, following the selected pattern reference.

Resolve style in this order, using an unambiguous explicit user choice of Style 1 or Style 2, whether supplied in natural language or as the last valid `--style` value parsed in Step 3.1. A malformed or unsupported option value is reported and ignored; if no explicit choice remains, style is unspecified.

1. A valid `--style=subfolders` or an unambiguous natural-language choice of Style 1 selects Style 1.
2. A valid `--style=unified` or an unambiguous natural-language choice of Style 2 selects Style 2.
3. When no valid explicit style was supplied (neither in arguments nor in natural language):
   - Interactive mode: if an existing codebase clearly demonstrates one style, show that evidence and ask the user whether to keep it or choose the other style; otherwise present Style 1 (Feature Subfolders) and Style 2 (Unified Multi-Action) and require the user's explicit selection.
   - Non-interactive mode: return `BLOCKED` with the two style options (`--style=subfolders` for Style 1 — Feature Subfolders, and `--style=unified` for Style 2 — Unified Multi-Action), including any clearly detected style and its evidence.

If an explicit style conflicts with the detected style, the explicit choice wins and the mismatch is reported. Repeated and invalid option values follow the parser rules in Step 3.1.

Do not infer Style 1 from the mere presence of a folder named after an entity. The survey must show use-case-specific subfolders in the relevant layers. Do not infer Style 2 from a single file; confirm the pattern across representative entities.

### Step 7: Generate ARCHITECTURE.md

Do not start this step if any required decision remains unresolved.

Generate the resolved architecture artifact (default: `.ai-factory/ARCHITECTURE.md`; `paths.architecture` overrides) adapted to the project's tech stack and language.

First generate and validate the complete artifact in `language.artifacts` without modifying the filesystem. Only after validation passes, create the parent directory if needed using the permitted `mkdir` command, then write the artifact (overwriting directly if a file already exists at the target path). Never write a partial artifact; if generation or validation fails before the final write, leave any existing architecture artifact unchanged and do not create its parent directory.

Use this structure, adapting headings and prose to the artifact language while preserving the semantic meaning of each section:

```markdown
# Architecture: [Canonical Pattern Name]

## Overview
[Why this pattern and variant fit this project; summarize the trade-offs.]

## Decision Rationale
- **Pattern/variant:** [Canonical pattern and variant; Layered has no variant suffix.]
- **Codebase classification:** [Clean / Existing (conforming) / Existing (discrepancies).]
- **Project type:** [Evidence from DESCRIPTION or user-provided context.]
- **Tech stack:** [Language, framework, database/ORM where relevant.]
- **Key factor:** [Primary evidence behind the choice.]
- **Action organization:** [Style 1 or Style 2; omit for Layered.]
- **Alignment policy:** [Not applicable (Clean) / Strict (already conforming) / Adapt / Strict (logical legacy quarantine).]

## Folder Structure
[Stack-idiomatic target folder tree.]

## Dependency Rules
[Allowed and forbidden dependency directions.]

## Layer/Module Communication
[How modules, layers, services, and adapters communicate.]

## Key Principles
[Practical rules for day-to-day development.]

[Include the applicable policy content only:
- Clean project: Code Organization Policy.
- Existing with discrepancies + Adapt: Code Organization Note and Current-State Deviations.
- Existing with discrepancies + Strict: Legacy vs New Code Policy.
- Existing and conforming: omit any additional alignment-policy section.]

## Code Examples
[At least two examples in the project's language/framework. One demonstrates a normal use case; another demonstrates a key dependency or boundary rule.]

## Anti-Patterns
[Concrete anti-patterns for the selected architecture.]
```

Generation rules:

1. Use the exact resolved pattern, variant, style, and alignment policy. Do not combine folder trees from different variants.
2. Adapt every code example to the project's actual language, framework, imports, naming, and conventions. Never use examples from another language merely because they appear in a reference.
3. Use stack-idiomatic names and casing. The reference folder names describe architectural roles; they are not mandatory literal casing.
4. Apply the selected variant's domain/model placement:
   - **Explicit Architecture:** pure domain entities belong in the Domain role (directly or in stack-idiomatic subfolders); aggregates may group child entities. Pure cross-entity domain rules belong in Domain Services. Outbound interfaces belong in Domain Ports/Interfaces.
   - **Structured Modules:** rich domain models belong in the selected module's Models role.
   - **Layered Architecture:** models/entities belong in the Models role.
   - **Microservices:** each service follows the selected service template; domain entities and outbound interfaces remain inside that service.
5. Apply the selected style consistently across all relevant layers and delivery channels. Add `[Channel]` folders only where the reference prescribes them and only when the project serves multiple audiences.
6. Under Adapt, show the target structure first. List actual deviations separately; never describe a forbidden existing dependency as an allowed target rule.
7. Under Strict, define logical quarantine boundaries for non-conforming existing code without physically moving or renaming files. The user decides whether to physically relocate legacy code or refactor it into the target architecture.
8. Include only architectural rules supported by the selected references and project evidence. Mark assumptions explicitly.
9. Keep the artifact actionable. Avoid generic principles that do not change implementation decisions.
10. Apply all project-specific rules from skill-context (`.ai-factory/skill-context/aif-architecture/SKILL.md` and `global-skill-context.md`). The template is a base structure: if a skill-context rule requires specific sections, principles, constraints, or custom layouts, augment the generated ARCHITECTURE.md accordingly.

#### Required policy-section content

**Clean project — Code Organization Policy**

- Starter entry points, layouts, and generated framing files remain part of the presentation/bootstrap layer.
- Do not place domain entities, business rules, or direct database access in generic starter files, page components, or framework route handlers.
- New code must follow the target architecture documented in this artifact.

**Existing with discrepancies — Adapt**

- **Code Organization Note:** document the existing structure without requiring unrelated rewrites; new code should follow target boundaries where practical.
- **Current-State Deviations:** list each material observed deviation with its actual path/evidence and the corresponding target rule. Do not call a deviation an approved exception unless the user explicitly approved it.

**Existing with discrepancies — Strict**

- **Target Architecture:** canonical architecture designed purely according to the chosen pattern without compromising for existing legacy files.
- **New Features:** follow the canonical target architecture.
- **Logical Legacy Quarantine:** non-conforming existing locations are logically marked as frozen legacy boundaries without physical file relocation. Do not move or rename existing files automatically; the user decides whether to physically move legacy code into a dedicated quarantine folder or refactor it to the new architecture.
- **Legacy Isolation:** do not allow legacy implementation details to leak into new domain/application code.
- **Migration Instructions:** provide a concrete file migration mapping (existing path -> target path) and identify required namespace, framework configuration (e.g. auth/provider configs), and binding updates needed to complete the migration.
- **Opportunistic Migration:** migrate legacy code either through a dedicated refactoring task or opportunistically when a planned task touches that area. Do not refactor unrelated code automatically.

### Step 8: Update companion pointers

Run this step only after Step 7 has completed successfully. If a companion file does not exist, do not create it.

#### 8.1 DESCRIPTION.md

If the resolved DESCRIPTION file exists, add or update the architecture-pointer section in resolved `language.artifacts`. Use the resolved architecture path from config, not the default path literal.

```markdown
## [Localized heading: Architecture]
[Localized sentence in resolved artifacts language referencing the resolved architecture artifact path for detailed architecture guidelines.]
[Localized label: Pattern]: [canonical pattern-variant name]
```

If an architecture section already exists, update it in-place; otherwise, append it to the document.

#### 8.2 AGENTS.md

If root `AGENTS.md` exists, register the architecture guidelines in the "AI Context Files" table in resolved `language.artifacts`:

```markdown
| [resolved-architecture-path] | [Localized architecture artifact description in resolved artifacts language] |
```

If a row already points to the resolved path, leave it unchanged. If an existing row references the default path, update it to the resolved path. If no architecture row exists, add it to the table.

### Step 9: Validate and report

Before reporting success, validate the result against this checklist:

- [ ] The architecture artifact is at the resolved `paths.architecture`.
- [ ] Its pattern and variant match the resolved decisions.
- [ ] The folder tree matches the selected pattern, variant, and style.
- [ ] The dependency rules match the selected pattern reference.
- [ ] All examples use the project's language and framework.
- [ ] Domain/model placement matches the selected pattern.
- [ ] All project-specific rules from skill-context (`.ai-factory/skill-context/aif-architecture/SKILL.md` and global) are satisfied and incorporated.
- [ ] The alignment-policy content matches the project state: Clean has Code Organization Policy; Existing with discrepancies has exactly one of Adapt or Strict policy sections; Existing and conforming has no additional alignment-policy section.
- [ ] If the selected policy is Adapt, deviations are described separately from target rules.
- [ ] If the selected policy is Strict with existing discrepancies, the target architecture is designed purely without compromising for existing files, legacy quarantine is defined logically without physical file relocation, and file migration instructions are provided.
- [ ] If existing discrepancies were found (legacy quarantine under Strict or deviations under Adapt), report guidance focuses strictly on architectural discrepancies and legacy code without recommending unrelated commands.
- [ ] The DESCRIPTION pointer, if updated, references the resolved path and the artifact's actual pattern.
- [ ] The AGENTS.md row, if updated, references the resolved path.
- [ ] Companion pointers were changed only after the architecture artifact write succeeded.
- [ ] The resolved architecture path does not collide with DESCRIPTION.md or root AGENTS.md.

If any check fails or a skill-context rule is violated, correct the artifact or companion pointer before presenting success; if it cannot be corrected safely, report failure and identify the affected path. If an artifact write reports failure, inspect the actual path before reporting its state; do not claim the previous content remains intact unless verified. Do not claim validation that was not performed.

Present the final report in resolved `language.ui`:

```text
[Localized success heading in `language.ui`]

[Localized pattern label in `language.ui`]: [canonical pattern-variant name]
[Localized style label in `language.ui`]: [resolved action organization style; omit for Layered]
[Localized policy label in `language.ui`]: [resolved alignment policy: Not applicable (Clean) / Strict (already conforming) / Adapt / Strict]
[Localized file label in `language.ui`]: [resolved architecture path]

[Localized assumptions heading in `language.ui`]:
- [Detected defaults, unrecognized arguments/flags, mismatches, or no-op flags.]
- [Omit this section when there is nothing to report.]

[Localized updated-files heading in `language.ui`]:
- [Each file actually updated; omit if none.]

[Localized key-rules heading in `language.ui`]:
- [Three concise project-specific architectural rules.]

[Localized architectural-discrepancies / legacy-guidance heading in `language.ui`]:
- [If Strict with legacy discrepancies: remind that non-conforming legacy code is quarantined logically without physical relocation; note that ARCHITECTURE.md includes target migration instructions and mapping for future refactoring tasks; the user decides whether to physically relocate it or refactor it opportunistically.]
- [If Adapt with deviations: remind that identified architectural deviations are documented under Current-State Deviations and can be addressed opportunistically.]
- [Omit this section entirely if the codebase is clean or conforming with zero discrepancies.]

[Localized closing sentence in `language.ui` about workflow skills following these architecture guidelines.]
```

Do not report success unless the file write completed. Validate that all updated files exist and match their expected paths.

## Artifact Ownership

- **Primary ownership:** the resolved architecture artifact path (default: `.ai-factory/ARCHITECTURE.md`).
- **Respect config overrides:** write to the resolved architecture path from `config.yaml` when provided.
- **Allowed companion updates:** architecture pointer in the resolved DESCRIPTION path from `config.yaml`, architecture row in `AGENTS.md` context table.
- **Read-only context:** roadmap, rules, research, plans, source code, and other project artifacts unless the user explicitly requests additional changes.
- Never modify built-in skill files or architecture references as part of a normal `/aif-architecture` run.
---
