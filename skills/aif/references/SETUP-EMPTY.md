### Mode 3: Interactive New Project (Empty Directory)

**Trigger:** `/aif` (no arguments) + empty project (no package.json, composer.json, etc.)

**Step 1: Resolve Language Settings**

Resolve the run-scoped language state before asking for the project description. If repository context is insufficient, the first user question after mode detection MUST be about `UI language` / `Artifact language`.

**Step 2: Persist config.yaml**

Immediately after language resolution, create `.ai-factory/` if needed and write `.ai-factory/config.yaml` via `update-config.mjs`.

**Step 3: Ask Project Description**

```
I don't see an existing project here. Let's set one up!

What kind of project are you building?
(e.g., "CLI tool for file processing", "REST API", "mobile app", "data pipeline")

> ___
```

Ask this prompt in resolved `language.ui`.

**Step 4: Interactive Stack Selection**

After getting description, proceed with same stack selection as Mode 2:
- Programming language (with recommendation)
- Framework (with recommendation)
- Database (with recommendation)
- ORM (with recommendation)

**Step 5: Create .ai-factory/DESCRIPTION.md**

Same as Mode 2, in resolved `language.artifacts`, including creating `.ai-factory` before writing `config.yaml` or `DESCRIPTION.md`.

**Step 6: Setup Context**

Install skills, configure MCP, generate `AGENTS.md` in resolved `language.artifacts`, and generate architecture document via `/aif-architecture` after the earlier helper-driven config write, using the shared acquisition policy and the selected security, MCP, project-map, and completion procedures from the invoking entrypoint.

---
