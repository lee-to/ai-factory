## AGENTS.md Generation

**Generate `AGENTS.md` in the project root** as a structural map for AI agents. This file helps any AI agent (or new developer) quickly understand the project layout.

**Scan the project** to build the structure:
- Read directory tree (top 2-3 levels)
- Identify key entry points (main files, config files, schemas)
- Note existing documentation files
- Reference `.ai-factory/DESCRIPTION.md` for tech stack

Use resolved `language.artifacts` for all headings, notes, table descriptions, and rule text inside `AGENTS.md`. Keep the filename `AGENTS.md` unchanged.

**Template:**

```markdown
# AGENTS.md

> [Localized AGENTS.md maintenance note in resolved artifacts language]

## [Localized heading: Project Overview]
[1-2 sentence description from DESCRIPTION.md]

## [Localized heading: Tech Stack]
- **[Localized label: Programming language]:** [language]
- **[Localized label: Framework]:** [framework]
- **[Localized label: Database]:** [database]
- **[Localized label: ORM]:** [orm]

## [Localized heading: Project Structure]
\`\`\`
[directory tree with inline comments explaining each directory]
\`\`\`

## [Localized heading: Key Entry Points]
| [Localized header: File] | [Localized header: Purpose] |
|---------------------------|------------------------------|
| [main entry] | [description in resolved artifacts language] |
| [config file] | [description in resolved artifacts language] |
| [schema file] | [description in resolved artifacts language] |

## [Localized heading: Documentation]
| [Localized header: Document] | [Localized header: Path] | [Localized header: Description] |
|-------------------------------|-------------------------|--------------------------------|
| README | README.md | [Localized README description in resolved artifacts language] |
| [other docs if they exist] | | |

## [Localized heading: AI Context Files]
| [Localized header: File] | [Localized header: Purpose] |
|---------------------------|------------------------------|
| AGENTS.md | [Localized AGENTS.md description in resolved artifacts language] |
| .ai-factory/DESCRIPTION.md | [Localized DESCRIPTION.md description in resolved artifacts language] |
| .ai-factory/ARCHITECTURE.md | [Localized ARCHITECTURE.md description in resolved artifacts language] |
| CLAUDE.md | [Localized CLAUDE.md description in resolved artifacts language] |

## [Localized heading: Agent Rules]
- [Localized shell-command decomposition rule in resolved artifacts language]
  - [Localized example label for an incorrect combined command] `git checkout <configured-base-branch> && git pull`
  - [Localized example label for the correct decomposed command] First `git checkout <configured-base-branch>`, then `git pull origin <configured-base-branch>`
```

**Rules for AGENTS.md:**
- Keep it factual — only describe what actually exists in the project
- Update it when project structure changes significantly
- The Documentation section will be maintained by `/aif-docs`
- Do NOT duplicate detailed content from DESCRIPTION.md — reference it instead
- Keep the filename `AGENTS.md`, but localize the content inside it to resolved `language.artifacts`

---
