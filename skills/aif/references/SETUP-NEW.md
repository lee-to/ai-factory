### Mode 2: New Project with Description

**Trigger:** `/aif <project description>`

**Step 1: Resolve Language Settings**

Immediately after reading `$ARGUMENTS`, resolve the run-scoped language state. If repository context is insufficient, the first user question after mode detection MUST be about `UI language` / `Artifact language`.

**Step 2: Persist config.yaml**

Immediately after language resolution, create `.ai-factory/` if needed and write `.ai-factory/config.yaml` via `update-config.mjs`.

**Step 3: Interactive Stack Selection**

Based on project description, ask user to confirm stack choices.
Show YOUR recommendation with "(Recommended)" label, tailored to the project type.
Ask the stack questions in resolved `language.ui`.

Ask about:
1. **Programming language** — recommend based on project needs (performance, ecosystem, team experience)
2. **Framework** — recommend based on project type (if applicable — not all projects need one)
3. **Database** — recommend based on data model (if applicable)
4. **ORM/Query Builder** — recommend based on language and database (if applicable)

**Why these recommendations:**
- Explain WHY you recommend each choice based on the specific project type
- Skip categories that don't apply (e.g., no database for a CLI tool, no framework for a library)

**Step 4: Create .ai-factory/DESCRIPTION.md**

After user confirms choices, create specification in resolved `language.artifacts`:

```markdown
# [Localized project title in resolved artifacts language]

## [Localized heading: Overview]
[Enhanced, clear description of the project in resolved artifacts language]

## [Localized heading: Core Features]
- [Feature 1]
- [Feature 2]
- [Feature 3]

## [Localized heading: Tech Stack]
- **[Localized label: Programming language]:** [user choice]
- **[Localized label: Framework]:** [user choice]
- **[Localized label: Database]:** [user choice]
- **[Localized label: ORM]:** [user choice]
- **[Localized label: Integrations]:** [Stripe, etc.]

## [Localized heading: Architecture Notes]
[High-level architecture decisions based on the stack]

## [Localized heading: Non-Functional Requirements]
- [Localized label: Logging]: Configurable via LOG_LEVEL
- [Localized label: Error handling]: Structured error responses
- [Localized label: Security]: [relevant security considerations]
```

Save to `.ai-factory/DESCRIPTION.md`.

**Step 5: Search & Install Skills**

Based on confirmed stack:
1. Search skills.sh for matching skills
2. Plan custom skills for domain-specific needs
3. Configure relevant MCP servers

**Step 6: Setup Context**

Install skills, configure MCP, generate `AGENTS.md` in resolved `language.artifacts`, and generate architecture document via `/aif-architecture` after the earlier helper-driven config write, using the shared acquisition policy and the selected security, MCP, project-map, and completion procedures from the invoking entrypoint.

---
