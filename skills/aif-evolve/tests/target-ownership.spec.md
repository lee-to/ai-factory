# Target Ownership Smoke Scenarios

Manual model/runtime scenarios; no automated runner consumes this file. The
installation smoke test checks delivery of the instructions, not these decisions.
Use disposable project/home roots, freeze their absolute paths, and snapshot all
files before each run. Stop after Step 0.1 unless explicitly testing application.
Do not use real user-global skills. The fixture's runtime catalog supplies the
disposable global root, including a home path containing spaces.

| Scenario | Fixture / invocation | Expected target and forbidden effects |
|----------|----------------------|---------------------------------------|
| Project built-in | Matching runtime/root AI Factory record for `aif-plan`, no extension claims; `plan` | Project built-in record, canonical installed base, project `skill-context/aif-plan/SKILL.md` destination; no base edits |
| Prefixed custom | User confirms ownership of untracked `aif-team-helper` and `aifhub-custom-skill`; invoke each exact name | User-owned canonical entrypoint, no synthetic built-in skill-context |
| Exact name wins | User-owned `plan` and managed `aif-plan` both exist; `plan` | Select custom `plan`, never shadow with the built-in alias |
| Extension prefixed | Registered extension declares `skills/aif-team-helper`; invoke that name | Warning naming extension ownership; no eligible target, log, cursor, installed-copy, or extension-source writes |
| Extension replacement | `replaces: {"skills/custom-plan": "aif-plan"}`, applied `extensions[].replacedSkills` entry, and installed entrypoint matching the transformed replacement source; `aif-plan` | Verified extension ownership takes precedence; no direct edit and no `skill-context/aif-plan` creation |
| Failed replacement / restored base | Registered manifest still declares `replaces: {"skills/custom-plan": "aif-plan"}`, but installation failed and rolled back; no applied `replacedSkills` entry; matching AI Factory runtime/root record and physical bundled `aif-plan`; `plan` | Resolve alias to the project built-in and freeze `skill-context/aif-plan/SKILL.md` as the eligible destination; do not skip because of the manifest claim; installed base and extension source stay read-only |
| Replacement record / file mismatch | Applied `replacedSkills` entry exists but the physical entrypoint matches the restored bundle or an unrelated source | Ownership unresolved; named mode requests clarification, `all` skips; no builtin override or direct managed-file writes |
| Default isolation | Same-name project and global user-owned skills; `all` | Only project targets, no global search or writes |
| Global flag order | Verified global user-owned skill plus project copy; `all --global`, then reset and `--global all` | Identical global-only records; absolute expanded paths without literal `~`; no project target edits |
| Managed global | Global catalog shows AI Factory and extension-managed skills; `all --global` | Warn/skip both managed classes; no managed-file edits or invented global override directory |
| Linked escape | Project entrypoint links to global or unrelated external root; `all` | Report and skip canonical out-of-scope file; a local-looking link grants no authority |
| Alias / ambiguity | Two entries link to one file, then two distinct same-name files in selected roots | Deduplicate first case; require exact-path choice for the second, never choose arbitrarily |
| Unknown provenance | Missing registered extension manifest or conflicting ownership records | Named target stops for clarification, `all` skips; no inferred user ownership |
| Missing target / root | Missing name, unknown global root, then invalid `--global=false`, duplicate flag, and extra selector | Explain selected scope and actual searched paths or unresolved root; reject malformed arguments before analysis/writes |
| Transfer boundary | Invoke transfer with a custom target or `--global` | Reject unsupported target/scope before source analysis; only current-project built-in skill-context is eligible |

For application checks, supply reproducible baseline/candidate evaluation evidence
and explicitly approve only the exact validated revision. Verify a user-owned global
approval names its absolute output path and cross-project reach. Then replace a
target or context parent with an escaping symlink, change its ownership record, or
edit its baseline before apply/cleanup: each must stop that write and require fresh
resolution/validation and approval for changed content or destination. An "apply all"
response never makes a skipped managed target eligible. Compare the final snapshots:
only approved frozen destinations and project-local evolution artifacts may change.
