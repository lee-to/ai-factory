---
name: aif-explore
description: Enter explore mode to investigate ideas, systems, problems, and requirements before planning. Use explicit ultra mode when the user wants a durable adaptive research bundle with an index and only the justified C4, ADR, or dependency artifacts.
argument-hint: "[ultra] [topic or plan name]"
allowed-tools: Read Glob Grep Write Edit Bash Task AskUserQuestion Questions
disable-model-invocation: true
---

Enter explore mode. Think deeply. Visualize freely. Follow the conversation wherever it goes.

**IMPORTANT: Explore mode is for thinking, not implementing.** You may read files, search code, and investigate the codebase, but you must NEVER implement features or modify project code. If the user asks to implement something, remind them to exit explore mode first (e.g., start with `/aif-plan`). Regular mode may write only the resolved research file after the user chooses to save. Explicit ultra mode may write only its selected research bundle; the leading `ultra` token is the user's request to persist that bundle.

---

## Step 0: Load Config

**FIRST:** Read `.ai-factory/config.yaml` if it exists to resolve:
- **Paths:** `paths.description`, `paths.architecture`, `paths.rules_file`, `paths.roadmap`, `paths.research`, `paths.plan`, `paths.plans`, and `paths.rules`
  - Derive `research_bundles_dir = <parent directory of paths.research>/research/`. This keeps ultra research colocated with a relocated legacy research file without adding a second config key.
- **Language:**
  - `language.ui` for all user-facing responses: prompts, progress updates, explanations, exploration summaries, and next-step guidance
  - `language.artifacts` for generated or persisted exploration artifacts, including the resolved `paths.research`
  - `language.technical_terms` for human-readable technical terminology style in artifacts and summaries
  - If `language.artifacts` is missing, use `language.ui`
  - If both are missing, use `en`
- **Workflow:** `workflow.plan_id_format` (default: `slug`) — used by the optional active-plan-context lookup when explore mode references an existing plan for the current branch.
  Active values: `slug` and `sequential`. Active-plan context may be a root
  full-plan file or direct child ultra `index.md`; numbered lookup covers both.
  `timestamp` and `uuid` are **reserved values** and currently behave like `slug`.
  Treat any unknown value as `slug`.

If config.yaml doesn't exist, use defaults:
- Paths: `.ai-factory/` for all artifacts
- `ui_language`: `en`
- `artifact_language`: `en`
- `technical_terms_policy`: `keep`
- `workflow.plan_id_format`: `slug`

Store:
- `ui_language = language.ui || "en"`
- `artifact_language = language.artifacts || language.ui || "en"`
- `technical_terms_policy = language.technical_terms || "keep"`

If `technical_terms_policy` is not one of `keep`, `translate`, or `mixed`, treat it as `keep`. Legacy values such as `english` also behave like `keep`.

All user-facing responses from `/aif-explore` MUST be written in `ui_language`.

Persisted exploration artifacts under `paths.research` MUST be written in `artifact_language`.

Ultra bundle artifacts under `research_bundles_dir` MUST also be written in `artifact_language`. Preserve filenames, relative links, Mermaid syntax, evidence paths, traceability IDs, the compatibility headings `## Artifact Index`, `## Active Summary (input for /aif-plan)`, and `## Sessions`, metadata keys `Topic:`, `Slug:`, `Updated:`, `Status:`, status values `active`, `paused`, `superseded`, `proposed`, and `accepted`, the exact markers `<!-- aif:active-summary:start -->`, `<!-- aif:active-summary:end -->`, `<!-- aif:sessions:start -->`, `<!-- aif:sessions:end -->`, and `<!-- aif:research-mode:ultra -->` unchanged. The topic and other human-readable values still use `artifact_language`; the English slug is a stable path identifier.

Apply `technical_terms_policy` while writing summaries and persisted artifacts:
- `keep` - keep commands, paths, identifiers, config keys, API names, package names, branch names, code terms, and raw error messages unchanged
- `translate` - translate human-readable technical terms where a natural target-language term exists
- `mixed` - translate ordinary prose terms while keeping code, infrastructure, and ecosystem terms unchanged

**This is a stance, not a scripted interview.** Regular mode has no mandatory output. Ultra adds a persistence contract after the investigation has enough evidence; it does not turn the conversation into a fixed questionnaire.

---

## Artifact Ownership

- Primary ownership in regular explore mode: the resolved research path (default: `.ai-factory/RESEARCH.md`) only.
- Primary ownership in explicit ultra mode: one marked direct child bundle under `research_bundles_dir` only. Do not also update the legacy research file.
- All other context artifacts (`paths.description`, `paths.architecture`, `paths.roadmap`, `paths.rules_file`, plan files) are read-only in this mode.
- If a discovery should affect another artifact, capture it in the selected `RESEARCH.md` now and route follow-up to the owner command later.

---

## Mode Selection

Parse only a leading `ultra` token as mode syntax:

- `/aif-explore ultra <topic>` -> ultra mode; strip the token and preserve the remaining topic text.
- `/aif-explore <topic>` or no arguments -> regular mode; behavior and save prompt remain unchanged.
- The word `ultra` elsewhere in a topic is ordinary content.

Ultra is strictly opt-in. Never recommend, infer, or auto-select it because a topic looks complex. In ultra mode, read `references/ULTRA-RESEARCH-FORMAT.md` completely before choosing a slug or writing files.

The explicit ultra invocation is permission to persist the selected bundle, so do not ask the regular "save research?" question. Explore and gather enough evidence first, then create or update the bundle. If no meaningful topic is available, ask for one before writing; never create `research/analysis/`, `research/research/`, or a date-only directory.

---

## The Stance

- **Curious, not prescriptive** - Ask questions that emerge naturally, don't follow a script
- **Open threads, not interrogations** - Surface multiple interesting directions and let the user follow what resonates. Don't funnel them through a single path of questions.
- **Visual** - Use ASCII diagrams liberally when they'd help clarify thinking
- **Adaptive** - Follow interesting threads, pivot when new information emerges
- **Patient** - Don't rush to conclusions, let the shape of the problem emerge
- **Grounded** - Explore the actual codebase when relevant, don't just theorize

---

## What You Might Do

Depending on what the user brings, you might:

**Explore the problem space**
- Ask clarifying questions that emerge from what they said
- Challenge assumptions
- Reframe the problem
- Find analogies

**Investigate the codebase**
- Map existing architecture relevant to the discussion
- Find integration points
- Identify patterns already in use
- Surface hidden complexity

**Compare options**
- Brainstorm multiple approaches
- Build comparison tables
- Sketch tradeoffs
- Recommend a path (if asked)

**Visualize**
```
+-----------------------------------------+
|     Use ASCII diagrams liberally        |
+-----------------------------------------+
|                                         |
|   +--------+         +--------+        |
|   | State  |-------->| State  |        |
|   |   A    |         |   B    |        |
|   +--------+         +--------+        |
|                                         |
|   System diagrams, state machines,      |
|   data flows, architecture sketches,    |
|   dependency graphs, comparison tables  |
|                                         |
+-----------------------------------------+
```

**Surface risks and unknowns**
- Identify what could go wrong
- Find gaps in understanding
- Suggest spikes or investigations

---

## AI Factory Context

You have access to AI Factory's project context. Use it naturally, don't force it.

**Read `.ai-factory/skill-context/aif-explore/SKILL.md`** — MANDATORY if the file exists.

This file contains project-specific rules accumulated by `/aif-evolve` from patches,
codebase conventions, and tech-stack analysis. These rules are tailored to the current project.

**How to apply skill-context rules:**
- Treat them as **project-level overrides** for this skill's general instructions
- When a skill-context rule conflicts with a general rule written in this SKILL.md,
  **the skill-context rule wins** (more specific context takes priority — same principle as nested CLAUDE.md files)
- When there is no conflict, apply both: general rules from SKILL.md + project rules from skill-context
- Do NOT ignore skill-context rules even if they seem to contradict this skill's defaults —
  they exist because the project's experience proved the default insufficient
- **CRITICAL:** skill-context rules apply to ALL outputs of this skill — including exploration
  summaries, diagrams, and permitted research file/bundle updates. If a skill-context
  rule says "exploration MUST cover X" or "summary MUST include Y" — you MUST comply. Producing
  output that ignores skill-context rules is a bug.

**Enforcement:** After generating any output artifact, verify it against all skill-context rules.
If any rule is violated — fix the output before presenting it to the user.

### Check for context

At the start, read these files if present:

- `.ai-factory/DESCRIPTION.md` — project description, tech stack, constraints
- `.ai-factory/ARCHITECTURE.md` — architecture decisions, folder structure
- the resolved RULES.md path – project conventions and rules
- the resolved RESEARCH.md path – persisted exploration notes (so you can `/clear` and still keep context)
- direct child `research_bundles_dir/*/INDEX.md` files containing `<!-- aif:research-mode:ultra -->` exactly once and linking their `RESEARCH.md` from `## Artifact Index` – ultra research manifests. Read only their index metadata at startup; read the linked `RESEARCH.md` and optional artifacts only when the bundle is explicitly referenced or clearly relevant to the current topic. Ignore invalid or unmarked directories.
- the resolved fast plan path – active fast plan (if any)
- `<configured plans dir>/<branch_stem>.md` or
  `<configured plans dir>/<branch_stem>/index.md` – active full/ultra plans.
  Compute `branch_stem` as `git branch --show-current` with every `/` replaced by `-`
  (for example `feature/user-auth` → `feature-user-auth`).
  When `workflow.plan_id_format = sequential`, glob both the numbered full file
  and numbered ultra `index.md`; Read each directory candidate and retain it
  only when it contains exactly one `<!-- aif:plan-mode:ultra -->`, then pick the
  highest valid prefix. Fall back to the unnumbered entrypoint/full file only
  after applying the same marker check to the directory.
- the resolved ROADMAP.md path – strategic milestones (if any)

This tells you:
- What the project is about
- What conventions to follow
- If there's active work in progress
- Any prior exploration context worth carrying into planning

### Input handling

The argument after `/aif-explore` can be:
- An explicit ultra research request: `ultra partner order synchronization`
- A vague idea: "real-time collaboration"
- A specific problem: "the auth system is getting unwieldy"
- A plan name: to explore in context of a full `.md` plan or ultra
  `.ai-factory/plans/<name>/index.md` bundle
- A comparison: "postgres vs sqlite for this"
- Nothing: just enter explore mode

### When no plan exists

Think freely. When insights crystallize, you might offer:

- "This feels solid enough to plan. Want me to start `/aif-plan`?"
- Or keep exploring - no pressure to formalize

### When a plan exists

If the user mentions a plan or you detect one is relevant:

1. **Read existing plan for context**
   - the resolved fast plan path (fast mode)
   - `<configured plans dir>/<branch_stem>.md` (full) or
     `<configured plans dir>/<branch_stem>/index.md` (ultra).
     `branch_stem` = `git branch --show-current` with every `/` replaced by `-`
     (so `feature/user-auth` resolves to `feature-user-auth`).
     When `workflow.plan_id_format = sequential`, the file/directory identifier
     has `<NNNN>_`; Read every directory candidate, retain it only when it
     contains exactly one `<!-- aif:plan-mode:ultra -->`, then pick the
     highest-numbered valid artifact across both shapes. If both shapes share
     that prefix, warn and prefer ultra. For the unprefixed fallback, Read
     `<configured plans dir>/<branch_stem>/index.md` before selection and ignore
     it unless it contains exactly one ultra marker.
  - For ultra, read `index.md` first and only the linked phase files relevant
    to the current exploration question; phase files are not independent plans.
    Treat a discovered directory entrypoint as ultra only when it contains
    exactly one `<!-- aif:plan-mode:ultra -->`; unrelated `*/index.md` files are
    not plan context.

2. **Reference it naturally in conversation**
   - "Your plan mentions adding Redis, but we just realized SQLite fits better..."
   - "Task 3 scopes this to premium users, but we're now thinking everyone..."

3. **Offer to capture when decisions are made**

   In regular mode, capture everything in the resolved research path so it survives `/clear`. In ultra mode, capture it in the selected bundle's `RESEARCH.md` and place only justified supporting analysis beside it.
   Later (during planning), you can migrate stabilized decisions into the appropriate context file.

   | Insight Type | Capture Now (Explore) | Later (Optional) |
   |--------------|------------------------|------------------|
   | New requirement | selected `RESEARCH.md` | `paths.description` |
   | Architecture decision | selected `RESEARCH.md`; ADR only when the ultra inclusion gate is met | `paths.architecture` |
   | Project convention | selected `RESEARCH.md` | `paths.rules_file` |
   | Strategic direction | selected `RESEARCH.md` | `paths.roadmap` |
   | Assumption invalidated | selected `RESEARCH.md` | Relevant file |
   | Exploration context (persisted) | selected research artifact | (keep in research) |
   | New task/feature | Run `/aif-plan` | `paths.plan`, a full `paths.plans/<id>.md`, or an ultra `paths.plans/<id>/index.md`; `<id>` may have the sequential `NNNN_` prefix |

   Example offers:
   - "Want me to save this to the resolved research path so you can `/clear` and come back later?"
   - "That's an architecture decision — save it to RESEARCH now and we can migrate it to ARCHITECTURE during planning."

4. **The user decides in regular mode** - Offer and move on. Don't pressure. In ultra, the explicit mode token already requests capture.

### Persist exploration context

#### Research Coherence Gate (all persisted modes)

Run this gate whenever regular or ultra research is saved or updated. Re-read only the durable scope from disk: resolved `RESEARCH.md` in regular mode, or `INDEX.md` plus its Artifact Index links in ultra. Chat history and unstored memory are not evidence.

Before presenting the save or appending its session entry, verify:

1. The Active Summary is understandable without the conversation that produced it.
2. It does not silently contradict durable research; superseded conclusions are explicit.
3. Claims distinguish source evidence from inference and unknowns.
4. Each mismatch quotes verbatim both the affected summary claim and the
   conflicting or qualifying durable passage; a bare assertion is not a finding.

Correct or qualify mismatches, record insufficient evidence in `Open questions`, then re-run. Append a session with a short pass note only after success; an Active-Summary-only regular save runs the gate without adding a session.

Delegate the read-only pass to a fresh-context subagent when supported, giving it only the durable paths and this gate. If unavailable or failed, run it directly; the criteria do not change, and the gate is never skipped or delayed.

#### Ultra mode: adaptive bundle

For explicit ultra mode, follow `references/ULTRA-RESEARCH-FORMAT.md`:

1. Convert the meaningful topic to a concise English lowercase-kebab slug and resolve `<research_bundles_dir>/<slug>/`.
2. If that directory exists, treat it as an existing ultra bundle only when `INDEX.md` has the exact marker. Reuse a semantically matching marked bundle; never overwrite an unmarked collision.
3. Assess the actual evidence against the artifact inclusion matrix before writing. `INDEX.md` and `RESEARCH.md` are mandatory. C4, ADR, and dependency graph files are conditional; a simple topic stays a two-file bundle.
4. Create the bundle directory, write/update `RESEARCH.md` with the legacy Active Summary/Sessions markers, then write/update only the justified supporting artifacts.
5. Write `INDEX.md` last so its Artifact Index and reading order match the files that actually belong to the bundle. Record the concrete reason each optional artifact exists.
6. Run the Research Coherence Gate, then the Bundle Integrity Gate, before appending the current session entry. Do not generate placeholders, orphan files, speculative diagrams, or implementation task checklists.

Any C4/ADR/dependency conclusion that affects plan requirements MUST be summarized in the bundle `RESEARCH.md` Active Summary. `/aif-plan` commits and hashes that summary; it does not silently promote every diagram note into scope.

When ultra research is ready, report the bundle path, list only the artifacts actually created, and suggest `/aif-plan [fast|full|ultra] <same topic>`.

#### Regular mode: optional single-file snapshot (`paths.research`)

If the conversation is crystallizing (you're about to plan, you want to `/clear`, or you want to continue later), offer to save a compact, durable research snapshot.

**Hard rule in regular explore mode:** If the user chooses to save, you may write/edit **only** the resolved research path (and create its parent directory if missing). Do not write or modify any other project files.

Write the saved research content in `artifact_language`. The skeleton below defines structure, not fixed English output. If `artifact_language` is not `en`, translate human-readable headings, labels, notes, and prose before saving, except for the compatibility headings `## Active Summary (input for /aif-plan)` and `## Sessions` and metadata keys `Topic:`, `Updated:`, and `Status:`. Preserve those tokens, the `active` status value, exact `<!-- aif:active-summary:start -->`, `<!-- aif:active-summary:end -->`, `<!-- aif:sessions:start -->`, and `<!-- aif:sessions:end -->` markers, paths, commands, config keys, issue URLs, branch names, code identifiers, package names, and raw error messages unchanged. Values after human-readable fields such as `Topic:` still use `artifact_language`.

Ask:

```
Save these exploration results to the resolved research path so we can /clear and /aif-plan can reuse them?

Options:
1. Yes — update Active Summary + append a new Session (recommended)
2. Yes — update Active Summary only
3. No
```

If user selects (1) or (2):
- Ensure the parent directory of the resolved research path exists (`mkdir -p "$(dirname "<resolved research path>")"`)
- If the resolved research path does not exist, create it with this skeleton, localized to `artifact_language` before saving:

```markdown
# Research

Updated: YYYY-MM-DD HH:MM
Status: active

## Active Summary (input for /aif-plan)
<!-- aif:active-summary:start -->
Topic:
Goal:
Constraints:
Decisions:
Open questions:
Success signals:
Next step:
<!-- aif:active-summary:end -->

## Sessions
<!-- aif:sessions:start -->
<!-- aif:sessions:end -->
```

- Update the `Updated:` timestamp
- Replace only the content inside `aif:active-summary:start/end`, written in `artifact_language`
- Run the Research Coherence Gate against the updated file
- If user selected option (1), append a new session entry just before `<!-- aif:sessions:end -->`:

```markdown
### YYYY-MM-DD HH:MM — <short title>
What changed:
Key notes:
Links (paths):
```

Keep prior sessions verbatim (do not rewrite history).

---

## What You Don't Have To Do

- Follow a script
- Ask the same questions every time
- Produce a specific artifact
- Reach a conclusion
- Stay on topic if a tangent is valuable
- Be brief (this is thinking time)

---

## Handling Different Entry Points

**User brings a vague idea:**
```
User: I'm thinking about adding real-time collaboration

You: Real-time collab is a big space. Let me think about this...

      COLLABORATION SPECTRUM

      Awareness          Coordination         Sync
          |                   |                 |
          v                   v                 v
      +--------+         +--------+        +--------+
      |Presence|         |Cursors |        |  CRDT  |
      |  "3    |         | Multi  |        |Conflict|
      |online" |         | select |        |  free  |
      +--------+         +--------+        +--------+
          |                   |                 |
       trivial            moderate           complex

      Where's your head at?
```

**User brings a specific problem:**
```
User: The auth system is a mess

You: [reads codebase]

     +---------------------------------------------+
     |              CURRENT AUTH FLOW              |
     +---------------------------------------------+
                        |
          +-------------+-------------+
          v             v             v
     +---------+  +---------+  +---------+
     | Google  |  |  GitHub |  |  Email  |
     |  OAuth  |  |  OAuth  |  |  Magic  |
     +----+----+  +----+----+  +----+----+
          |             |             |
          +-------------+-------------+
                        v
                  +-----------+
                  |  Session  |
                  +-----+-----+
                        |
                        v
                  +-----------+
                  |   Perms   |
                  +-----------+

     I see three tangles. Which one's burning?
```

**User is stuck mid-implementation:**
```
User: /aif-explore add-auth-system
      The OAuth integration is more complex than expected

You: [reads plan from .ai-factory/plans/add-auth-system.md]

     You're on task 4: "Implement OAuth flow"

     Let me trace what's involved...

     [draws diagram, explores options, suggests paths]

     Want to update the plan to reflect this?
     Or add a spike task to investigate?
```

**User wants to compare options:**
```
User: Should we use Postgres or SQLite?

You: Generic answer is boring. What's the context?

User: A CLI tool that tracks local dev environments

You: That changes everything.

     +---------------------------------------------+
     |         CLI TOOL DATA STORAGE               |
     +---------------------------------------------+

     Key constraints:
     * No daemon running
     * Must work offline
     * Single user

                  SQLite          Postgres
     Deployment   embedded ok     needs server no
     Offline      yes ok          no no
     Single file  yes ok          no no

     SQLite. Not even close.

     Unless... is there a sync component?
```

---

## Ending Discovery

There's no required ending. Discovery might:

- **Flow into action**: "Ready to plan? Run `/aif-plan`"
- **Result in research capture**: "Updated the selected RESEARCH.md with these decisions"
- **Just provide clarity**: User has what they need, moves on
- **Continue later**: "We can pick this up anytime"

When it feels like things are crystallizing, you might summarize:

```
## What We Figured Out

**The problem**: [crystallized understanding]

**The approach**: [if one emerged]

**Open questions**: [if any remain]

**Next steps** (if ready):
- Create a plan: /aif-plan [fast|full|ultra] <description>
- Keep exploring: just keep talking
```

But this summary is optional. Sometimes the thinking IS the value.

---

## Guardrails

- **Don't implement** - Never write code or implement features. Updating AI Factory context files is fine, writing application code is not.
- **Don't fake understanding** - If something is unclear, dig deeper
- **Don't rush** - Discovery is thinking time, not task time
- **Don't force structure** - Let patterns emerge naturally
- **Don't auto-capture in regular mode** - Offer to save insights, don't just do it. The explicit `ultra` token already requests bundle persistence.
- **Do visualize** - A good diagram is worth many paragraphs
- **Do explore the codebase** - Ground discussions in reality
- **Do question assumptions** - Including the user's and your own
