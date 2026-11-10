### Step 0.2: Find Plan Artifact

Normalize every selected artifact to:

- `plan_entrypoint` — the single markdown file containing settings and `## Tasks`
- `plan_bundle_dir` — empty for fast/full/fix plans; the ultra directory otherwise
- `phase_files` — empty for single-file plans; ordered links from the ultra
  entrypoint's `## Phase Index` otherwise

**If `$ARGUMENTS` contains `@<path>`:**

1. Resolve the path relative to project root (absolute paths are also valid).
2. Accept an existing markdown file, an ultra directory containing `index.md`,
   or that ultra bundle's `index.md`.
3. If neither representation exists, report the missing path with examples for
   a fast file, full file, and ultra directory, then STOP.
4. Before normalizing a directory or treating an explicit `index.md` as ultra,
   Read `index.md` and require exactly one
   `<!-- aif:plan-mode:ultra -->`; otherwise STOP with a plan-integrity error.
5. If the selected file is `paths.fix_plan`, invoke `/aif-fix` and STOP.
6. Otherwise use it and skip automatic discovery.

**Without an explicit override, resolve in this order:**

```
1. Branch-based full/ultra artifact:
   a. Compute <branch-stem> by replacing "/" with "-".
   b. For workflow.plan_id_format=sequential, glob both:
        <paths.plans>/[0-9][0-9][0-9][0-9]_<branch-stem>.md
        <paths.plans>/[0-9][0-9][0-9][0-9]_<branch-stem>/index.md
      Read every directory candidate and retain it only when `index.md` contains
      exactly one <!-- aif:plan-mode:ultra -->. Choose the highest numeric prefix
      across valid artifacts. If multiple valid candidates exist, emit
      WARN [aif-implement] and name the chosen artifact; if both shapes share
      the highest prefix, prefer ultra.
   c. If no valid sequential candidate exists, or sequential mode is inactive,
      check:
        <paths.plans>/<branch-stem>/index.md
        <paths.plans>/<branch-stem>.md
      Read the directory entrypoint before selection and ignore it unless it
      contains exactly one <!-- aif:plan-mode:ultra -->. If both valid shapes
      exist, emit WARN and prefer the ultra entrypoint.
2. If no branch artifact resolves, count active named artifacts as:
     - each root <paths.plans>/*.md file except resolved paths.plan and paths.fix_plan
     - each direct child <paths.plans>/*/index.md containing <!-- aif:plan-mode:ultra -->
   Exactly one total → use it. More than one → ask the user to choose or use
   @<path>; do not count phase files as independent plans.
3. No named artifact → paths.plan.
4. No regular plan → paths.fix_plan, then redirect to /aif-fix and STOP.
```

Priority remains: explicit path → branch-based full/ultra artifact → single
named full/ultra artifact → fast plan → fix-plan redirect. Discovery scans only
`paths.plans`; archived files and directories under `paths.archive/plans` are
excluded.

**Read the selected artifact:**

- If an automatically discovered directory entrypoint does not contain exactly
  one `<!-- aif:plan-mode:ultra -->`, it is not an AI Factory plan. Ignore it and
  continue discovery. If it contains the marker but its Phase Index is malformed,
  STOP with a plan-integrity error instead of falling back to another plan.
- Always read `plan_entrypoint` completely.
- If it is ultra (contains `<!-- aif:plan-mode:ultra -->`),
  validate every relative Phase Index link, reject paths escaping the bundle,
  record the ordered phase files, and ensure every indexed task maps to exactly
  one `## Task N` section. Warn and STOP on a broken bundle rather than guessing.
- Read a task's complete phase file before implementing that task. On resume,
  re-read the active phase even if it was read in a previous session.
- `index.md` is the only progress source; phase files must not own duplicate
  task checkboxes.
- Treat `## Original Request` as useful original scope context. Executable inputs
  remain settings, dependencies, the task checklist, committed Research Context,
  and (for ultra) linked phase specifications.
- Apply the research-drift contract to Research Context in the entrypoint. Parse
  the first `Source:` / `Reference:` line with canonical
  `^(?:Source|Reference):\s+\x60([^\x60]+)\x60\s+\(` syntax; capture the backtick-delimited
  path so spaces and brackets remain intact. For older bare-path lines, fall back
  to `^(?:Source|Reference):\s+(.+?)\s+\(`. Fall back to `paths.research` only
  when neither form identifies a usable path.
- If the parsed source is inside `research_bundles_dir`, require its sibling
  `INDEX.md` to contain `<!-- aif:research-mode:ultra -->` exactly once and link
  that `RESEARCH.md` from `## Artifact Index`; otherwise emit
  `WARN [research-drift]`. Valid sibling C4/ADR/dependency artifacts remain
  rationale only and do not expand committed scope.
- When `SHA256:` is present, extract the current source text strictly between
  `<!-- aif:active-summary:start -->` and `<!-- aif:active-summary:end -->`,
  remove HTML comment blocks, preserve line order and leading whitespace, trim
  trailing spaces from every line, use LF endings, and end with one newline.
  Hash through stdin with `shasum -a 256` or `sha256sum`; the digest is
  authoritative. Use `Updated:` only as a legacy fallback when `SHA256:` is
  absent. On a missing/invalid source or revision mismatch, emit
  `WARN [research-drift]` and continue using committed plan context.
  In the single-file wording of this contract: emit `WARN [research-drift]` and continue using the plan's embedded Research Context as scope.

**Immediately after reading `plan_entrypoint`, check its first line for
`<!-- handoff:task:<uuid> -->`:**

- In manual mode, extract it and call `handoff_sync_status` with status
  `implementing`, the actual current UTC timestamp, direction
  `aif_to_handoff`, and `paused: true`.
- In autonomous Handoff mode, do not call MCP.
- If absent, skip MCP sync for this session.

When pushing ultra progress to Handoff, serialize the full bundle as entrypoint
content followed by each linked phase file in order, prefixed with
`<!-- ultra-phase:<relative-path> -->`.
