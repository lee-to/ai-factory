# Documentation Review Checklists

## Meaning-Preservation Gate — Before Readability

Apply to every editorial rewrite of requirements, including simplification,
translation, summaries, splitting, and consolidation. Compare each rewritten
requirement with its source passage, keeping surrounding qualifiers in scope.
This check preserves the contract; it does not authorize changing it.

- [ ] Modal verbs keep their meaning and level: possibility, recommendation,
      obligation, and permission remain distinct. Preserve [RFC 2119](https://www.rfc-editor.org/info/rfc2119/) keywords
      verbatim, including MUST, MUST NOT, SHOULD, SHOULD NOT, REQUIRED, SHALL, SHALL NOT,
      RECOMMENDED, NOT RECOMMENDED, MAY, and OPTIONAL. Never delete them as redundant wording.
- [ ] Conditions, exceptions, negations, actors, and action order keep their
      original scope. Preserve numbers, units, thresholds, identifiers, and link
      targets exactly; keep each attached to the same requirement.
- [ ] An applicability condition stays a condition. "Check the config only while
      the service is stopped" never authorizes stopping the service, including
      production, to make the check possible. If the condition is unmet, the
      rewrite keeps that limit; it adds no action to satisfy it.
- [ ] Unknown causes stay unknown; hypotheses retain their qualification.
      "Include the cause, if known" permits stating an evidenced cause when
      known; it does not permit inventing one. Permission or capability is never
      rewritten as an action already completed.
- [ ] Keep check/verify/confirm/validate distinct unless the source explicitly
      defines them as equivalent. Preserve their object, evidence standard,
      acceptance criteria, and required outcome.
- [ ] No fact becomes more certain and no obligation becomes stronger or weaker
      through an editorial change, even when the result reads more smoothly.

| Source | Safe rewrite | FAIL: changed meaning |
|--------|--------------|-----------------------|
| The client may retry after 30 seconds. | After 30 seconds, the client may retry. | Retry after 30 seconds. |
| Operators SHOULD validate `config.yaml` before deployment. | Before deployment, operators SHOULD validate `config.yaml`. | Operators MUST validate `config.yaml` before deployment. |
| A stale token might cause rejection. | Rejection might result from a stale token. | Rejection was caused by a stale token. |
| Operators MAY clear the cache. | Clearing the cache is an action operators MAY take. | Operators cleared the cache. |
| Check the config only while the service is stopped. | Only check the config while the service is stopped. | Stop the service and check the config. |
| Do not retry unless `retry_enabled=true`; see `[policy](retry.md)`. | Unless `retry_enabled=true`, do not retry; see `[policy](retry.md)`. | Retry; see `[policy](retry.md)`. |

The label `Meaning preservation:` and verdicts `PASS`, `FAIL`, and `N/A` are
fixed output tokens; localize explanations only.

Report `Meaning preservation: PASS` only when every rewritten requirement has
been compared and all applicable checks pass. On `FAIL`, cite the source and
candidate passages and name the changed meaning; restore or repair the rewrite,
then rerun the gate before readability review or presenting the rewrite as
ready. Missing source or unresolved ambiguity yields `FAIL`; retain the source
wording and report the gap. With no requirement rewrites, report
`Meaning preservation: N/A — no requirements rewritten`.

## Technical Checklist

Verify structure, links, and completeness:

- [ ] README.md is under 150 lines
- [ ] README has: title, tagline, quick start, example, documentation table, license
- [ ] Each docs/ file has prev/next navigation header following the Documentation table order
- [ ] First doc page has no "← Previous" link; last page has no "Next →" link
- [ ] Each docs/ file has "See Also" section at bottom with 2-3 related links
- [ ] No content was lost during split/reorganization
- [ ] All internal links work (no broken references, no dead anchors)
- [ ] Code examples use the project's actual commands/syntax
- [ ] Installation instructions are real and work (verified from package manager files)
- [ ] No duplicate content between README and docs/
- [ ] No scattered root-level `.md` files that should be in docs/

## Readability Checklist — "New User Eyes"

Read every page as if you are a developer who has **never seen this project before**. For each page, verify:

### First 10 seconds (above the fold)
- [ ] Can I understand what this project does within 10 seconds of reading README?
- [ ] Is the tagline clear and specific — not vague marketing ("next-gen solution")?
- [ ] Is there a real install command I can copy-paste right now?

### "Show, don't tell"
- [ ] Does README have a concrete usage example (not just "install and run")?
- [ ] Do code blocks show real commands with real output, not abstract placeholders?
- [ ] Are examples copy-pasteable — no `<placeholder>` that the user must replace?

### Scannability
- [ ] Can I find any specific topic in under 5 seconds by scanning headers?
- [ ] Are paragraphs short (max 3-4 lines)? Long paragraphs get skipped
- [ ] Are lists used instead of comma-separated inline enumerations?
- [ ] Are tables used for structured data instead of nested bullet lists?

### Jargon and assumptions
- [ ] Does the docs page explain acronyms on first use (or link to explanation)?
- [ ] Are there no assumptions about internal knowledge? ("as described in the RFC" — which RFC?)
- [ ] Would a junior developer understand each page without asking a colleague?

### Navigation and flow
- [ ] After reading README, is it clear where to go next?
- [ ] After finishing any docs/ page, do prev/next links and "See Also" guide me logically forward?
- [ ] Is the Documentation table in README ordered by the path a new user would follow? (getting started → workflow → details)

### Motivation
- [ ] Does the README answer "why should I care?" before "how does it work?"
- [ ] Is there a "wow moment" — a feature or example that makes me want to try it?
- [ ] Does the docs structure feel inviting, not overwhelming? (max 6-8 doc pages)

## Standards Compliance Check

Docs may have been generated by an older version of this skill. Compare existing docs against current Core Principles and templates. Common gaps to detect:

| Missing standard | How to detect | Auto-fix |
|------------------|---------------|----------|
| No prev/next navigation | Header has only `[← Back to README]` without `·` links to sibling pages | Add prev/next links following Documentation table order |
| No "See Also" section | File ends without `## See Also` | Add section with 2-3 related page links |
| Old "Back to README" format | Link path or text doesn't match current pattern | Update to current format |
| Missing Documentation table in README | README has no table linking to docs/ pages | Add table |
| README too long | README is over 150 lines despite docs/ existing | Propose moving excess content to docs/ |

**When gaps are found**, include them in the audit report alongside content issues (Step 2.2). Treat them as regular improvements — show the plan and get user approval before applying.

**Do NOT ask "was this generated by an older version?"** — just silently detect what's missing and fix it. The user doesn't need to know about skill versioning; they just see their docs getting better.

## Presenting the Review

When the optional writing profile ran, use `WRITING-PROFILE.md` to also report
profile, actual files/languages, dictionary, skipped targets, and style
exceptions. Compare every edited passage (including descriptions) with its
pre-editorial source before readability findings. These are editorial results;
they do not establish requirement correctness or change quality-gate verdicts.

After running the meaning-preservation gate (when applicable) and both
checklists, present a summary. Meaning preservation must precede readability;
readability cannot compensate for a failed gate:

```
📋 Documentation Review

Meaning preservation: PASS
  ✅ Rewritten requirements compared with source passages
  ✅ Modality, conditions, negations, and uncertainty preserved

Technical:
  ✅ All links verified (14 internal links, 0 broken)
  ✅ README is 108 lines
  ✅ All pages have navigation
  ⚠️  docs/api.md has a placeholder example — needs real endpoint

Readability:
  ✅ README explains purpose in first 10 seconds
  ✅ All code examples are copy-pasteable
  ⚠️  docs/architecture.md has a 12-line paragraph — should be split
  ⚠️  "CQRS" used without explanation in docs/architecture.md

Fixes applied:
  → Split long paragraph in docs/architecture.md into 3 shorter ones
  → Added "(Command Query Responsibility Segregation)" after first mention of CQRS
  → Replaced placeholder in docs/api.md with real endpoint example

All checks passed ✅
```
