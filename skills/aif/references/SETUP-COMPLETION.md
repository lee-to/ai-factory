After DESCRIPTION.md, AGENTS.md, skills, and MCP are configured, **generate the architecture document**:

**Step 7: Generate Architecture Document**

Invoke `/aif-architecture` to define project architecture. This creates `.ai-factory/ARCHITECTURE.md` with architecture pattern, folder structure, dependency rules, and code examples tailored to the project.

Present the completion summary and next-step recommendations in resolved `language.ui`. Cover:

```
[Localized completion heading in `language.ui`]

- [Localized project-description label in `language.ui`]: `.ai-factory/DESCRIPTION.md`
- [Localized architecture label in `language.ui`]: `.ai-factory/ARCHITECTURE.md`
- [Localized project-map label in `language.ui`]: `AGENTS.md`
- [Localized skills-installed label in `language.ui`]: [list]
- [Localized MCP-configured label in `language.ui`]: [list]
- [Localized next-steps heading in `language.ui`]:
  - `/aif-roadmap` — [Localized roadmap recommendation in `language.ui`]
  - `/aif-plan <description>` — [Localized planning recommendation in `language.ui`]
  - `/aif-implement` — [Localized execution recommendation in `language.ui`]
```

**For existing projects (Mode 1), also suggest next steps:**

Present these suggestions in resolved `language.ui`:
- `/aif-docs` — [Localized documentation recommendation in `language.ui`]
- `/aif-rules` — [Localized rules recommendation in `language.ui`]
- `/aif-build-automation` — [Localized build-automation recommendation in `language.ui`]
- `/aif-ci` — [Localized CI recommendation in `language.ui`]
- `/aif-dockerize` — [Localized containerization recommendation in `language.ui`]

Present these as `AskUserQuestion` with multi-select options:
1. [Localized docs option label in `language.ui`] (`/aif-docs`)
2. [Localized build-automation option label in `language.ui`] (`/aif-build-automation`)
3. [Localized CI option label in `language.ui`] (`/aif-ci`)
4. [Localized docker option label in `language.ui`] (`/aif-dockerize`)
5. [Localized skip option label in `language.ui`]

If user selects one or more → invoke the selected skills sequentially.
If user skips → done.

**DO NOT:**
- ❌ Start writing project code
- ❌ Create project files (src/, app/, etc.)
- ❌ Implement features
- ❌ Set up project structure beyond skills/MCP/AGENTS.md

**Your job ends when skills, MCP, and AGENTS.md are configured.** The user decides when to start implementation.
