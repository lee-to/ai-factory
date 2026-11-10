# Shared Skill-Context

Read during Step 0.2 and before proposing shared writes, consolidation, or stale
cleanup. This extends project built-in context only; it creates no global install
location, group registry, config keys, or direct-write permission for managed skills.

## Layers and Consumers

All paths are fixed relative to the current project root:

| Layer | Path under `.ai-factory/skill-context/` | Consumers |
|-------|----------------------------------------|-----------|
| Global | `global-skill-context.md` | Every bundled AI Factory skill |
| Build | `build-skill-context.md` | Exactly `aif-fix`, `aif-implement`, `aif-plan`, `aif-verify`, `aif-improve` |
| Individual | `<skill-name>/SKILL.md` | That skill only |

Load global → build (only for a listed consumer) → individual, once per invocation.
Missing files are optional; an existing unreadable file stops dependent work with
its path. Individual overrides build, build overrides global, and each overrides
skill defaults only on the same instruction. Preserve non-conflicting rules and
unique parts. Apply the result to every output, including templates and reports.
`global` means project-wide consumers, not the user's home directory or `--global`.

These files hold learned workflow prevention instructions. Project coding and
architecture conventions still belong in the existing rules/architecture hierarchy;
reference them instead of copying them here. No layer may weaken explicit project
requirements, ownership/scope boundaries, safety/privacy, validation, or required
approval. Report an unresolved conflict rather than silently overriding those rules.
Custom and extension skills do not automatically opt into this loader.

## Select the Smallest Valid Destination

1. Use the frozen individual destination by default, especially in a named run.
   Do not promote a rule merely because its text appears in two files.
2. A shared destination is eligible only in project `all` mode. Enumerate its full
   consumer set from the bundled inventory (all skills for global; the exact five
   above for build). Resolve each using `TARGET-OWNERSHIP.md`, including the verified
   package-source fallback for an absent installed built-in. Record every canonical
   base, owner/evidence, and all effective context paths/revisions. If any consumer
   is missing, replaced, ambiguous, out of scope, or cannot be checked, leave the
   shared file unchanged and keep the proposal individual or postpone it.
3. Require the exact same applicability and action to be appropriate for every
   consumer. Conditional instructions need an explicit trigger and controls for
   consumers where that trigger must not activate. If only some consumers need the
   rule, keep it individual; do not add arbitrary groups or broaden the condition.
4. Freeze one shared change record with the exact canonical destination and the
   complete affected-consumer records. Canonicalize its nearest existing parent and
   enforce project containment, just as for an individual context. Show the full
   reach in approval, not only the skills that supplied the original patches.
   Recheck every affected baseline and ownership record before writes.

Named and `--global` runs may read shared project context where applicable, but
must not edit, delete, or consolidate shared files. Evolve's own project context
still governs its workflow; never apply unrelated project contexts to custom or
user-global target skills. Transfer must preserve this restriction and its privacy
checks; its sanitized registry supplies evidence, not extra target authority.

## Coverage, Validation, and Consolidation

- Steps 3–5 compare each consumer's base plus all its applicable layers. A shared
  rule is not stale just because one consumer's base covers it. Remove or narrow it
  only after checking every consumer and preserving each uncovered prevention point.
  With an incomplete consumer set, report a deferred shared finding without deletion.
- Before Step 6.5, assign every candidate an individual or frozen shared destination.
  Use `CANDIDATE-VALIDATION.md` on **each affected consumer**, with complete baseline
  and candidate compositions, original cases and out-of-condition controls. Shared
  changes also need checks that other consumers retain their behavior. Missing
  evidence means `NOTRUN` / `postpone`; approval cannot substitute for comparison.
- Consolidation is an explicit candidate, never automatic migration. Show the exact
  move, sources, duplicate deletions, precedence changes and any individual exceptions.
  Preserve unique instructions, applicability, provenance, and non-conflicting rules.
  Validate the final combined move, including deletions, before removing any original.
  Behavior equivalence alone does not show a new rule improved behavior: for an
  equivalent consolidation, also record the measured reduction in duplicate copies
  as the maintenance benefit. Do not claim token or runtime savings without measurement.
- If one consumer fails, the whole shared candidate is ineligible. Refine to local
  candidates or postpone; do not partially publish a shared rule. Apply only the
  approved tested revision. Retain the original bytes of every changed file; write
  and verify the shared replacement before removing duplicate originals. If any
  write fails, restore changed files; report any failed restoration as a blocker.
  Never advance the cursor on an incomplete apply.

Shared files use the existing English context header/rule format, with an explicit
`Applies to:` consumer list (or all bundled skills for global). Candidate cards and
logs name the layer, exact file, all consumers, validation results, and moved/deleted
rules. Delete an empty shared **file only**, never the `skill-context` directory.
Individual empty-file/directory cleanup keeps its existing behavior.
