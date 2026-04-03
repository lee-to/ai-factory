# Reference Examples

Practical examples of `/aif-reference` usage and expected output.

## Example 1: Single URL — Library Documentation

**Input:**
```
/aif-reference https://zod.dev --name zod-validation
```

**Result:** `.ai-factory/references/zod-validation.md`

```markdown
# Zod Validation Reference

> Source: https://zod.dev
> Created: 2026-03-20
> Updated: 2026-03-20

## Overview

Zod is a TypeScript-first schema declaration and validation library.
Zero dependencies, works in Node.js and browsers. Use for runtime
type validation, form parsing, API request/response validation.

## Core Concepts

- **Schema**: a validator object created with `z.<type>()` methods
- **Parse**: `schema.parse(data)` throws on invalid, `safeParse` returns result object
- **Infer**: `z.infer<typeof schema>` extracts TypeScript type from schema

## API / Interface

### Primitive schemas
| Method | Validates |
|--------|-----------|
| `z.string()` | string |
| `z.number()` | number |
| `z.boolean()` | boolean |
| `z.date()` | Date instance |
| `z.undefined()` | undefined |
| `z.null()` | null |
| `z.any()` | any (no validation) |

### String validations
- `z.string().min(n)` — minimum length
- `z.string().max(n)` — maximum length
- `z.string().email()` — email format
- `z.string().url()` — URL format
- `z.string().regex(re)` — custom regex

...
```

## Example 2: Multiple URLs — Cross-Referencing

**Input:**
```
/aif-reference https://docs.astro.build/en/getting-started/ https://docs.astro.build/en/guides/content-collections/
```

**Result:** `.ai-factory/references/astro-framework.md`

The skill merges content from both pages into a single coherent reference,
noting which information came from which source when there are differences.

## Example 3: Local File

**Input:**
```
/aif-reference ./docs/api-spec.yaml --name internal-api
```

**Result:** `.ai-factory/references/internal-api.md`

Reads the OpenAPI/Swagger spec and creates a human-readable reference
with endpoints, parameters, response types, and example requests.

## Example 4: Update Existing

**Input:**
```
/aif-reference --update --name zod-validation
```

**Result:** re-fetches https://zod.dev (from the reference header),
compares with existing content, updates changed sections, preserves
creation date.

## Example 5: Interactive Mode

**Input:**
```
/aif-reference
```

**Result:** the skill asks what topic the user needs a reference for,
whether they have specific URLs or want the AI to search, and what
aspects matter most. Then proceeds with the standard workflow.

## Example 6: Large Topic — Split Into Directory

When a single reference exceeds ~1000 lines:

```
.ai-factory/references/kubernetes/
├── INDEX.md          # Overview + links to sub-references
├── pods.md           # Pod configuration and lifecycle
├── services.md       # Service types and networking
├── deployments.md    # Deployment strategies
└── configmaps.md     # ConfigMaps and Secrets
```

## Reference Output Quality Checklist

A good reference:
- [ ] Has source URLs in the header
- [ ] Has Created/Updated dates
- [ ] Overview explains what + when to use in 1-3 paragraphs
- [ ] Code examples are verbatim from source (not paraphrased)
- [ ] API signatures include all parameters and types
- [ ] Best practices include reasoning ("because...")
- [ ] No hallucinated information — gaps are omitted, not filled
- [ ] Under 1000 lines (or split into directory)
- [ ] Registered in INDEX.md
