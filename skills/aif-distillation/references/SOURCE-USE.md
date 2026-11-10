# Source Use and Provenance

Preserve evidence about source use, not a legal conclusion. Record only terms
the user supplied or that were encountered in the selected material. Missing
license information is not permission; independently authored guidance is not
legal approval. Do not require a registry, network lookup, or legal-approval
gate for local distillation. Leave unresolved reuse decisions to the
source/package owner.

## Per-source record

Extend the existing `references/SOURCE-MAP.md`; keep coverage and use terms
together. Use stable neutral source IDs within the package, including split
children. Every metadata value has an explicit state:

| State | Meaning |
|-------|---------|
| `known` | Supplied or encountered evidence; retain the exact value/reference |
| `unknown` | Not supplied or not established; never infer permission |
| `not-applicable` | Does not apply, with a concrete reason; never use for missing terms |
| `redacted` | Known identifying information withheld by disclosure policy |

Use this compact record for each source; do not leave ambiguous blanks:

```markdown
### Source A
- Metadata revision: 1 (current; no prior revision)
- Source kind: known — documentation
- Locator: known — <permitted source URL or path>
- Edition/revision/digest: unknown — no version supplied
- Relation to output: known — principles in references/WORKFLOW.md; adapted example in examples/requests.md
- License/terms: unknown — no terms supplied or encountered
- Notices: unknown — no notice information supplied
- Export restrictions: known — user permits local use only; no public export
- Material separation: referenced — <source section>; interpretation — <output section>; independently authored guidance — <output section>
- Owner decisions: unresolved — whether this package may be redistributed
```

When terms are known, preserve their exact license identifier/title and exact
provided reference (URL, license file + section, or supplied terms excerpt), with
edition/revision/digest where available. Do not guess a standard license from
the presence of a repository, public access, or a copyright notice. Preserve
several terms entries and their scopes when they conflict; say `unresolved
conflict`, retaining both references. Do not choose the more permissive one.
Do not infer the generated package's license from any source's license.

Preserve relevant notices and explicit user/project export restrictions as
recorded, including conditions on excerpts and adapted examples. Distinguish
`quoted/referenced material`, `agent interpretation`, and `independently authored
guidance` in the actual references/examples, not only in the metadata. Link each
to its relevant source ID; never describe a synthesized rule as a direct quote.
Use short excerpts only when essential; do not copy full books.

## Redaction and downstream handoff

`--redact-source-map` still omits source maps entirely. Put a compact `Source
use` section in the generated `SKILL.md` instead, using neutral IDs, safe states,
current metadata revision, non-identifying terms, notices, and restrictions.
Explicitly state `Reduced public traceability: source identifiers withheld`.
Set identifying locator, terms reference, edition, title, or digest values to
`redacted`; never encode hidden values in hashes, links, filenames, examples,
namespace prefixes, or handoff fields. Keep `unknown` for genuinely missing
information and `not-applicable` only with a reason.

If a notice contains hidden identifiers, do not leak it or silently discard its
condition. Retain the non-identifying condition and mark the exact notice
`redacted`; record that public export remains unresolved with the owner because
the identifying notice cannot be included under current disclosure restrictions.
Do not claim that a sanitized notice satisfies the original attribution terms.

Every affected split child and downstream handoff (including project
hypotheses or a separately requested publication proposal) carries current
metadata revision, known terms/references where permitted, notices, export
restrictions, conflicts, and unresolved owner decisions. Copy only permitted
metadata; downstream artifacts must not restore redacted identifiers. Publication
requires a separate explicit opt-in; local distillation does not publish sources,
install a skill separately, train a model, or decide redistribution rights.

## Source or terms updates

Compare the selected source revision/content and recorded terms, notices,
restrictions, and disclosure policy with the previous record on `--update`.
Any material change invalidates the prior metadata revision: increment the
revision, mark it `current; supersedes N`, and identify N as `superseded — source
or terms changed`. Re-evaluate all affected fields; never silently retain an
old reuse conclusion or copy old terms onto a new source version. If inputs
cannot be compared, record that uncertainty and create a new revision rather
than assert unchanged metadata. Keep history non-identifying under redaction.

When redaction requires leaving an existing non-empty `SOURCE-MAP.md` unchanged,
do so. Put the new neutral revision in `SKILL.md`, explicitly supersede the old
metadata for current handoffs, and disclose that the old map remains a legacy
private file excluded from public handoff. Do not delete user files or include
that legacy map in a publication proposal.

## Synthetic acceptance checks

Exercise these cases against generated output, including a downstream handoff;
these are behavioral checks, not permission determinations:

1. **Known:** synthetic docs v1, supplied `CC-BY-4.0` at
   `https://example.test/docs/LICENSE`, supplied notice `Credit Example Author`.
   Expect exact known reference, revision v1, preserved notice, separated
   referenced/interpretation/independent output; no permission verdict.
2. **Missing:** synthetic local notes, no terms or version supplied. Expect
   `unknown` terms/version, usable local output, no invented license and no
   approval/network/registry gate. An absent edition is not automatically
   `not-applicable`; an explicitly unversioned live conversation may use
   `not-applicable — no editions exist`.
3. **Conflicting:** synthetic source says `CC-BY-4.0` in its header and
   `All rights reserved` in an attached terms file. Expect both exact references
   and scopes, `unresolved conflict`, and an owner decision; no winner selected.
4. **Redacted:** source title `Hidden Atlas`, path `/private/hidden-atlas.md`,
   terms URL `https://hidden.example.test/terms`, notice naming `Hidden Atlas`,
   user restriction `local only`, and `--redact-source-map`. Expect none of
   those identifiers anywhere in generated files or handoff, no source map,
   redacted reference/notice, preserved local-only condition, reduced public
   traceability, and unresolved public export. Repeat for split children.
5. **Updated:** update case 1 to source v2 with local-only terms at a new supplied
   reference. Expect metadata revision 2 superseding 1, refreshed version/terms,
   and no current handoff relying on revision 1. Also change only the recorded
   terms with unchanged source v1: metadata must still advance. Repeat with a
   pre-existing private source map plus redaction; preserve that file while
   current neutral metadata supersedes it and public handoff excludes it.
