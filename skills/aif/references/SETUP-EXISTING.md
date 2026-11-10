### Mode 1: Analyze Existing Project

**Trigger:** `/aif` (no arguments) + project has config files

**Step 1: Scan Project**

Read these files (if they exist):
- `package.json` → Node.js dependencies
- `composer.json` → PHP (Laravel, Symfony)
- `requirements.txt` / `pyproject.toml` → Python
- `go.mod` → Go
- `Cargo.toml` → Rust
- `docker-compose.yml` → Services
- `prisma/schema.prisma` → Database schema
- Directory structure (`src/`, `app/`, `api/`, etc.)

**Step 2: Resolve Language Settings**

Resolve the run-scoped language state (see Language Resolution in the invoking entrypoint) before generating any setup-time text artifact.

**Step 3: Persist config.yaml**

Immediately after language resolution, create `.ai-factory/` if needed and write `.ai-factory/config.yaml` via `update-config.mjs`.

**Step 4: Generate .ai-factory/DESCRIPTION.md**

Based on analysis, create project specification in resolved `language.artifacts`:
- Detected stack
- Identified patterns
- Architecture notes

**Step 5: Recommend Skills & MCP**

| Detection | Skills | MCP |
|-----------|--------|-----|
| Prisma/PostgreSQL | `db-migrations` | `postgres` |
| MongoDB | `mongo-patterns` | - |
| GitHub repo (.git) | - | `github` |
| Stripe/payments | `payment-flows` | - |

**Step 6: Search skills.sh**

```bash
npx skills search <relevant-keyword>
```

**Step 7: Present Plan & Confirm**

Present this setup analysis and confirmation prompt in resolved `language.ui`.

```markdown
## 🏭 Project Analysis

**Detected Stack:** [language], [framework], [database if any]

## Setup Plan

### Skills
**From skills.sh:**
- [matched skills] ✓

**Generate custom:**
- [project-specific skills]

### MCP Servers
- [x] [relevant MCP servers]

Proceed? [Y/n]
```

**Step 8: Execute**

1. Create directory: `mkdir -p .ai-factory`
2. Write `.ai-factory/config.update.json` with helper payload (`mode: "create"` if config is missing, `mode: "merge"` if it already exists)
3. Run `node <reference-dir>/update-config.mjs --template <reference-dir>/config-template.yaml --target .ai-factory/config.yaml --payload .ai-factory/config.update.json`
4. Delete `.ai-factory/config.update.json` after the helper succeeds
5. Save `.ai-factory/DESCRIPTION.md` in resolved `language.artifacts`
6. **Create rules/base.md**:
   - Ensure `.ai-factory/rules/` directory exists
   - Write `.ai-factory/rules/base.md` with detected conventions in resolved `language.artifacts`
7. For each external skill from skills.sh:
   ```bash
   npx skills install {{skills_cli_agent_flag}} <name>
   # AUTO-SCAN: immediately after install. Example for PYTHON_CMD=(python3).
   python3 ~/{{skills_dir}}/aif-skill-generator/scripts/security-scan.py <installed-path>
   ```
   - Exit 1 (BLOCKED) → run the selected concrete Python command with `~/{{skills_dir}}/aif-skill-generator/scripts/cleanup-blocked-skill.py --skill <name> --installed-path <installed-path>` (reuse the same `<installed-path>` you passed to security-scan.py — upstream `skills` sanitizes the directory name, so synthesizing it from `<name>` can miss the real folder), warn user, skip this skill
   - Exit 2 (WARNINGS) → show to user, ask confirmation
   - Exit 0 (CLEAN) → read files yourself (Level 2), verify intent, proceed
8. Generate custom skills via `/aif-skill-generator` (pass URLs for Learn Mode when docs are available)
9. Configure MCP in `{{settings_file}}`
10. Generate `AGENTS.md` in project root in resolved `language.artifacts` (read SETUP-AGENTS.md before generation)
11. Generate architecture document via `/aif-architecture` only after config exists with resolved language settings (read SETUP-COMPLETION.md before the handoff)

---
