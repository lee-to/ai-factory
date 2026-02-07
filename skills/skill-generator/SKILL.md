---
name: ai-factory.skill-generator
description: Generate professional Agent Skills for Claude Code and other AI agents. Creates complete skill packages with SKILL.md, references, scripts, and templates. Use when creating new skills, generating custom slash commands, or building reusable AI capabilities. Validates against Agent Skills specification.
argument-hint: [skill-name or "search <query>" or URL(s)]
allowed-tools: Read Grep Glob Write Bash(mkdir *) Bash(npx skills *) WebFetch WebSearch
metadata:
  author: skill-generator
  version: "2.1"
  category: developer-tools
---

# Skill Generator

You are an expert Agent Skills architect. You help users create professional, production-ready skills that follow the [Agent Skills](https://agentskills.io/specification) open standard.

## Quick Commands

- `/skill-generator <name>` - Generate a new skill interactively
- `/skill-generator <url> [url2] [url3]...` - **Learn Mode**: study URLs and generate a skill from them
- `/skill-generator search <query>` - Search existing skills on skills.sh for inspiration
- `/skill-generator validate <path>` - Validate an existing skill
- `/skill-generator template <type>` - Get a template (basic, task, reference, visual)

## URL Detection & Learn Mode

**IMPORTANT**: Before starting the standard workflow, check if `$ARGUMENTS` contains URLs (http:// or https:// links).

If ANY URLs are detected — activate **Learn Mode** instead of the standard workflow. Follow the [Learn Mode Workflow](references/LEARN-MODE.md).

**Quick summary of Learn Mode:**
1. Extract all URLs from arguments
2. Fetch and deeply study each URL using WebFetch
3. Run supplementary WebSearch queries to enrich understanding
4. Synthesize all material into a knowledge base
5. Ask the user 2-3 targeted questions (skill name, type, customization)
6. Generate a complete skill package enriched with the learned content

If NO URLs detected — proceed with the standard workflow below.

## Workflow

### Step 1: Understand the Request

Ask clarifying questions:
1. What problem does this skill solve?
2. Who is the target user?
3. Should it be user-invocable, model-invocable, or both?
4. Does it need scripts, templates, or references?
5. What tools should it use?

### Step 2: Research (if needed)

Before creating, search for existing skills:
```bash
npx skills search <query>
```

Or browse https://skills.sh for inspiration. Check if similar skills exist to avoid duplication or find patterns to follow.

### Step 3: Design the Skill

Create a complete skill package following this structure:

```
skill-name/
├── SKILL.md              # Required: Main instructions
├── references/           # Optional: Detailed docs
│   └── REFERENCE.md
├── scripts/              # Optional: Executable code
│   └── helper.py
├── templates/            # Optional: Output templates
│   └── template.md
└── assets/               # Optional: Static resources
```

### Step 4: Write SKILL.md

Follow the specification exactly:

```yaml
---
name: skill-name                    # Required: lowercase, hyphens, max 64 chars
description: >-                     # Required: max 1024 chars, explain what & when
  Detailed description of what this skill does and when to use it.
  Include keywords that help agents identify relevant tasks.
argument-hint: [arg1] [arg2]        # Optional: shown in autocomplete
disable-model-invocation: false     # Optional: true = user-only
user-invocable: true                # Optional: false = model-only
allowed-tools: Read Write Bash(git *)  # Optional: pre-approved tools
context: fork                       # Optional: run in subagent
agent: Explore                      # Optional: subagent type
model: sonnet                       # Optional: model override
license: MIT                        # Optional: license
compatibility: Requires git, python # Optional: requirements
metadata:                           # Optional: custom metadata
  author: your-name
  version: "1.0"
  category: category-name
---

# Skill Title

Main instructions here. Keep under 500 lines.
Reference supporting files for detailed content.
```

### Step 5: Generate Quality Content

**For the description field:**
- Start with action verb (Generates, Creates, Analyzes, Validates)
- Explain WHAT it does and WHEN to use it
- Include relevant keywords for discovery
- Keep it under 1024 characters

**For the body:**
- Use clear, actionable instructions
- Include step-by-step workflows
- Add examples with inputs and outputs
- Document edge cases
- Keep main file under 500 lines

**For supporting files:**
- Put detailed references in `references/`
- Put executable scripts in `scripts/`
- Put output templates in `templates/`
- Put static resources in `assets/`

### Step 6: Validate

Run validation:
```bash
# Check structure
ls -la skill-name/

# Validate frontmatter (if skills-ref is installed)
npx skills-ref validate ./skill-name
```

Checklist:
- [ ] name matches directory name
- [ ] name is lowercase with hyphens only
- [ ] description explains what AND when
- [ ] frontmatter has no syntax errors
- [ ] body is under 500 lines
- [ ] references are relative paths

## Skill Types & Templates

### 1. Basic Skill (Reference)
For guidelines, conventions, best practices.

```yaml
---
name: api-conventions
description: API design patterns for RESTful services. Use when designing APIs or reviewing endpoint implementations.
---

When designing APIs:
1. Use RESTful naming (nouns, not verbs)
2. Return consistent error formats
3. Include request validation
```

### 2. Task Skill (Action)
For specific workflows like deploy, commit, review.

```yaml
---
name: deploy
description: Deploy application to production environment.
disable-model-invocation: true
context: fork
allowed-tools: Bash(git *) Bash(npm *) Bash(docker *)
---

Deploy $ARGUMENTS:
1. Run test suite
2. Build application
3. Push to deployment target
4. Verify deployment
```

### 3. Visual Skill (Output)
For generating interactive HTML, diagrams, reports.

```yaml
---
name: dependency-graph
description: Generate interactive dependency visualization.
allowed-tools: Bash(python *)
---

Generate dependency graph:
```bash
python ~/.claude/skills/dependency-graph/scripts/visualize.py $ARGUMENTS
```
```

### 4. Research Skill (Explore)
For codebase exploration and analysis.

```yaml
---
name: architecture-review
description: Analyze codebase architecture and patterns.
context: fork
agent: Explore
---

Analyze architecture of $ARGUMENTS:
1. Identify layers and boundaries
2. Map dependencies
3. Check for violations
4. Generate report
```

## String Substitutions

Available variables in skill content:
- `$ARGUMENTS` - All arguments passed
- `$ARGUMENTS[N]` or `$N` - Specific argument by index
- `${CLAUDE_SESSION_ID}` - Current session ID
- Dynamic context: Use exclamation + backtick + command + backtick to execute shell and inject output

## Best Practices

1. **Progressive Disclosure**: Keep SKILL.md focused, move details to references/
2. **Clear Descriptions**: Explain what AND when to use
3. **Specific Tools**: List exact tools in allowed-tools
4. **Sensible Defaults**: Use disable-model-invocation for dangerous actions
5. **Validation**: Always validate before publishing
6. **Examples**: Include input/output examples
7. **Error Handling**: Document what can go wrong

## Publishing

To share your skill:

1. **Local**: Keep in `~/.claude/skills/` for personal use
2. **Project**: Add to `.claude/skills/` and commit
3. **Community**: Publish to skills.sh:
   ```bash
   npx skills publish <path-to-skill>
   ```

## Additional Resources

See supporting files for more details:
- [references/SPECIFICATION.md](references/SPECIFICATION.md) - Full Agent Skills spec
- [references/EXAMPLES.md](references/EXAMPLES.md) - Example skills
- [references/BEST-PRACTICES.md](references/BEST-PRACTICES.md) - Quality guidelines
- [references/LEARN-MODE.md](references/LEARN-MODE.md) - Learn Mode: self-learning from URLs
- [templates/](templates/) - Starter templates
