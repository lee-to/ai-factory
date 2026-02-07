# Learn Mode — Self-Learning Skill Generation

Learn Mode activates automatically when the user passes one or more URLs as arguments to `/skill-generator`. The system studies external sources and generates a skill based on the acquired knowledge.

## URL Detection

Scan `$ARGUMENTS` for patterns matching `https?://[^\s]+`. Any argument containing a URL triggers Learn Mode.

**Examples of invocation:**
```
/skill-generator https://docs.example.com/api-reference
/skill-generator https://react.dev/learn https://react.dev/reference
/skill-generator my-skill-name https://some-docs.com/guide
/skill-generator https://github.com/owner/repo https://blog.example.com/best-practices
```

When a non-URL argument is also present (like `my-skill-name`), use it as the skill name hint.

## Learn Mode Workflow

### Phase 1: Collect & Study

For EACH URL provided:

1. **Fetch the page** using `WebFetch` with a targeted prompt:
   ```
   WebFetch(url, "Extract ALL key information from this page:
   - Main topic and purpose
   - Key concepts, terms, and definitions
   - Code examples and patterns
   - API methods, parameters, return types
   - Configuration options
   - Best practices and recommendations
   - Error handling patterns
   - Links to related important pages
   Provide a comprehensive, structured summary.")
   ```

2. **Assess depth** — if the page references critical sub-pages (API reference, guides, examples), fetch those too (up to 5 additional pages per source URL, prioritize by relevance).

3. **Record findings** — for each source, capture:
   - Topic and domain
   - Core concepts and terminology
   - Practical patterns and code examples
   - Configuration / API surface
   - Common pitfalls and edge cases

### Phase 2: Enrich with Web Search

Run 1-3 targeted `WebSearch` queries to fill knowledge gaps:

- `"<topic> best practices 2025 2026"` — latest recommendations
- `"<topic> common mistakes"` — pitfalls to document
- `"<topic> cheat sheet"` — concise reference material

Only search if the fetched URLs don't already provide comprehensive coverage.

### Phase 3: Synthesize Knowledge Base

Combine all gathered material into a structured knowledge base:

```markdown
## Knowledge Base: <Topic>

### Core Concepts
- Concept 1: explanation
- Concept 2: explanation

### API / Interface
- Method/function signatures
- Parameters and types
- Return values

### Patterns & Examples
- Pattern 1: code example + when to use
- Pattern 2: code example + when to use

### Configuration
- Option 1: description, default, valid values
- Option 2: description, default, valid values

### Best Practices
1. Practice with reasoning
2. Practice with reasoning

### Common Pitfalls
1. Pitfall: what goes wrong and how to avoid
2. Pitfall: what goes wrong and how to avoid
```

### Phase 4: Clarify with User

Ask the user 2-3 targeted questions using `AskUserQuestion`:

1. **Skill name** — suggest a name based on the studied material, let user confirm or override
2. **Skill type** — based on content analysis, recommend the best type:
   - Reference/Basic — if the sources are mostly documentation, guidelines
   - Task — if the sources describe workflows, processes, deployment
   - Research — if the sources are about analysis, review patterns
   - Visual — if the sources involve generating output, reports, diagrams
3. **Scope** — what aspects to focus on (the sources may cover a broad topic, ask which parts matter most)

**Skip questions that have obvious answers.** For example, if the user already provided a skill name in arguments, don't ask again.

### Phase 5: Generate the Skill

Using the synthesized knowledge, generate a complete skill package:

1. **Create directory structure**:
   ```
   skill-name/
   ├── SKILL.md              # Main skill with instructions derived from sources
   ├── references/
   │   ├── GUIDE.md           # Detailed knowledge base from studied material
   │   └── EXAMPLES.md        # Code examples extracted from sources
   └── (scripts/ or templates/ if applicable)
   ```

2. **Write SKILL.md** — transform the knowledge into actionable instructions:
   - Frontmatter with proper metadata
   - Clear workflow steps based on what was learned
   - Inline examples from the sources
   - Reference to detailed docs in `references/`

3. **Write references/GUIDE.md** — the full synthesized knowledge base:
   - Comprehensive reference material
   - All code examples with context
   - Configuration options
   - Best practices and pitfalls
   - Source attribution (list original URLs at the bottom)

4. **Write references/EXAMPLES.md** (if enough examples found):
   - Practical code examples organized by use case
   - Input/output pairs
   - Edge cases

5. **Generate scripts/templates** if the learned material suggests automation opportunities

### Phase 6: Validate & Present

1. Run validation on the generated skill
2. Present a summary to the user:
   - What was learned from each source
   - Generated skill structure
   - Key capabilities of the skill
3. Ask if they want to adjust anything

## Quality Rules for Learn Mode

- **Source Attribution**: Always list studied URLs in `references/GUIDE.md` under a "Sources" section
- **No Hallucination**: Only include information actually found in the sources. If a source didn't cover something, say so rather than making it up
- **Freshness**: When sources conflict, prefer more recent information
- **Completeness**: Cover all major topics from the sources, don't skip sections
- **Actionability**: Transform passive documentation into active instructions ("Use X when..." instead of "X is a feature that...")
- **Code Examples**: Preserve working code examples from sources, adapt them to fit the skill context

## Multi-URL Strategy

When multiple URLs are provided:

| Scenario | Strategy |
|----------|----------|
| Same domain, different pages | Treat as one comprehensive source, merge into single knowledge base |
| Different domains, same topic | Cross-reference, pick best practices from each, note differences |
| Different topics | Ask user how they relate, potentially suggest multiple skills or a combined skill |
| Mix of docs + blog posts | Prioritize official docs for accuracy, use blog posts for practical tips |

## Examples

### Example 1: Single Documentation URL
```
/skill-generator https://tailwindcss.com/docs
```
Result: A skill that helps write Tailwind CSS classes with a reference guide of utilities, responsive patterns, and best practices.

### Example 2: Multiple Related URLs
```
/skill-generator https://react.dev/learn/thinking-in-react https://react.dev/reference/react/hooks
```
Result: A React development skill with component design patterns and hooks reference.

### Example 3: URL + Name
```
/skill-generator fastapi-helper https://fastapi.tiangolo.com/tutorial/
```
Result: A skill named `fastapi-helper` with FastAPI patterns, endpoint templates, and validation examples.

### Example 4: Mixed Sources
```
/skill-generator https://docs.docker.com/compose/ https://blog.example.com/docker-compose-tips
```
Result: A Docker Compose skill combining official reference with practical tips from the blog.
