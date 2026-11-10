[← Config Reference](config-reference.md) · [Back to README](../README.md)

# Instruction Composition Manifests

`ai-factory instructions` records the instruction package for an **explicitly registered** skill invocation. It preserves exact file hashes, permitted snapshots, declared composition operations, dependencies, and caller-supplied load observations. It does not launch a model or upload records.

An extension or runtime adapter registers the invocation and supplies what it knows. Ordinary skill invocation remains unchanged. This command is config-agnostic: it does not read `config.yaml`, modify skills, resolve rule precedence, or introduce `context.provider`. The caller resolves configured context paths and passes them explicitly.

## Register an invocation

From the consuming project's root, prepare a specification from its installed skill:

```bash
ai-factory instructions prepare .agents/skills/aif-implement \
  --skill aif-implement --runtime codex \
  --context AGENTS.md .ai-factory/RULES.md .ai-factory/rules/base.md \
    .ai-factory/skill-context/aif-implement/SKILL.md \
  --snapshot --output composition.json
ai-factory instructions start --spec composition.json
```

Use the actual installed directory for your runtime. For flat workflow files, pass their containing directory and `--entry aif-implement.md`; only that entry and the shared `references/` tree are inventoried. For directory skills, `prepare` inventories regular package files, excluding the top-level authoring `tests/` directory. It does not read those files into the model's execution context.

Missing context files remain explicit missing resources after `start`. `--output` writes a new UTF-8 file without a BOM, avoiding PowerShell redirection encoding differences. JSON inputs also accept UTF-8 BOMs and UTF-16LE BOMs.

If shared skill-context files exist, callers also list
`.ai-factory/skill-context/global-skill-context.md` and, for its five workflow
consumers, `.ai-factory/skill-context/build-skill-context.md` before the individual
context. `prepare` does not discover optional layers or claim they were loaded.

`--snapshot` grants local capture of the selected package and explicit context paths. Without it, hashes and sizes are recorded, but historical bytes are not preserved. Review generated `policy.snapshot_roots` and `policy.exclude` before starting. A snapshot root is an exact project-relative file or a directory prefix; exclusions use the same semantics, not globs.

Set `task` and `stage` in the generated JSON when known. `start` returns a generated `run_id` and the manifest location. Supply a unique `run_id` in the specification for deterministic external registration. Existing runs are never overwritten.

The registered package includes installed bytes and references; it does not infer the original extension sources or historical assembly operations. An extension/runtime producer can enrich the JSON with its actual base, replacement, injection, intermediate files, and operation sequence:

```json
{
  "run_id": "implement-task-42",
  "skill": "aif-implement",
  "task": "42",
  "stage": "implementation",
  "runtime": "codex",
  "policy": {
    "snapshot_roots": ["instruction-inputs", ".agents/skills/aif-implement"],
    "exclude": ["instruction-inputs/private"],
    "settings_allowlist": ["model", "reasoning_effort"]
  },
  "settings": { "model": "configured-model", "reasoning_effort": "high" },
  "resources": [
    { "id": "base", "role": "base", "path": "instruction-inputs/SKILL.md" },
    { "id": "team", "role": "injection", "path": "instruction-inputs/team.md", "addition": true },
    {
      "id": "installed", "role": "installed",
      "path": ".agents/skills/aif-implement/SKILL.md",
      "required": true, "in_composition": true,
      "output_path": ".agents/skills/aif-implement/SKILL.md"
    },
    {
      "id": "logging", "role": "reference",
      "path": ".agents/skills/aif-implement/references/LOGGING-GUIDE.md",
      "required": true,
      "output_path": ".agents/skills/aif-implement/references/LOGGING-GUIDE.md"
    }
  ],
  "dependencies": [
    {
      "from": "installed", "to": "logging", "required": true,
      "condition": "when implementing code",
      "declaration": "SKILL.md: Logging",
      "resolution": "declared"
    }
  ],
  "operations": [
    {
      "kind": "append", "inputs": ["base", "team"], "output": "installed",
      "implementation": "ai-factory applyInjection@2.19.0"
    }
  ]
}
```

This is a template: use real resources and operations. Initial operation endpoints are resource IDs; `start` binds them to revision 1. Further `operation` commands use exact `id@revision` references. Supported kinds are `replace`, `transform`, `template`, `prepend`, `append`, and `include`.

These are **declarations**, not a new composition engine or an independently verified recipe. Preserve intermediate outputs if their history matters. Prepending A then B places B before A; operation order does not establish instruction precedence.

The manifest always labels coverage `declared_only`, dependency discovery `unknown`, and runtime evidence `caller_supplied`. The producer must include dependencies it knows about, including missing mandatory resources and configured project rules.

Declaration conditions are preserved; the recorder does not evaluate them or resolve #110 grouping. References in arbitrary prose or opaque runtime settings cannot be discovered reliably by this recorder.

## Append revisions and load observations

`instructions resource RUN --spec resource.json` captures a new resource or appends its next revision. Initial metadata flags and output path are inherited on recapture unless explicitly changed. Previous resource hashes and snapshots remain unchanged.

```json
{ "id": "logging", "role": "reference", "path": ".agents/skills/aif-implement/references/LOGGING-GUIDE.md" }
```

`instructions observe RUN --spec observation.json` appends a load report:

```json
{
  "resource": "logging@1",
  "kind": "tool_event",
  "source": "adapter:read-result-17",
  "reported_status": "partial",
  "range": { "unit": "lines", "start": 1, "end": 100 },
  "truncated": true,
  "evidence": "read-receipt@1",
  "delivered": "read-payload@1"
}
```

First register `read-receipt` and `read-payload` with `resource`, normally using role `evidence` and safe local files permitted by the initial capture policy. `evidence` and `delivered` are optional. They bind the report to captured receipt and delivered-payload revisions; a whole-file hash must not stand in for a truncated payload. Do not include payload bytes in the observation JSON itself.

Observation kinds are `agent_report`, `tool_event`, and `runtime_event`. These describe the **caller's claimed source**, not authentication by AI Factory. Reports remain visible without receipts, while load status stays `unknown`. `evidence_provided` means a receipt snapshot was provided; `verify` checks its actual bytes. Authenticated runtime loading remains `unknown` in this recorder. Loading does not prove instruction compliance.

Byte ranges are zero-based with an exclusive end; line ranges are one-based with an inclusive end. `reported_status` is `complete`, `partial`, or `unknown`. `truncated` is boolean or `unknown`; a truncated read cannot be reported as complete. `reported_at` is optional (ISO timestamp, otherwise `unknown`); `recorded_at` and `sequence` are recorder-assigned. Later reads of modified files must name their new resource revision.

## Finish, verify, restore, and resume

```bash
ai-factory instructions show RUN
ai-factory instructions finish RUN
ai-factory instructions verify RUN
ai-factory instructions verify RUN --restore restored-instructions
```

`finish` explicitly finalizes recording, not task success or complete instruction loading. A run remains open until then. A killed capture leaves an open invocation; an interrupted initial capture remains `initialization: capturing` and rejects further mutations, including finalization. Create a new invocation linked through `previous_run_id` to resume it.

A detected resource-capture failure preserves completed captures and records `run.capture_error` with the failing `resource_id` and a sanitized reason (safe recorder messages or a filesystem error code, without the source path or raw filesystem error). The CLI identifies the run and resource even if the diagnostic cannot be persisted.

Other resumed invocations use the same predecessor field, which must name an existing local predecessor. Missing task/stage/predecessor information is `unknown`; `not_applicable` can explicitly describe an absent predecessor.

Writes are serialized by a run-local `.lock`; initialization holds it continuously from the first published placeholder through completed capture. Concurrent writers fail explicitly instead of modifying a placeholder that initialization could overwrite. Manifest replacement uses an atomic rename.

If a process is killed while holding the lock, `show` and `verify` still read the last published record. Confirm the process has stopped before manually removing its `.lock`. Finalized runs reject all further resource/operation/observation writes.

`verify` validates persisted record shapes before accounting or resolving output paths, checks every preserved resource against its exact-byte SHA-256 and length, checks dependency/operation/observation references, and recomputes composition, accounting, and load status. Its JSON result uses `pass`, `warn`, or `fail`; only `fail` sets a nonzero exit code.

Unreadable, malformed, or unsupported manifests produce structured `fail` with unknown completeness/accounting and no restoration. Missing required dependencies, incomplete runs, and unpreserved resources are explicit warnings.

Missing/corrupt promised snapshots are failures and make reconstruction unavailable; a requested restore also returns `fail` without creating its destination when verification has failed.

Persisted objects reject fields outside the published schema. Resource states are checked together: a captured resource requires a hash and byte count; `preservation: snapshot` also requires its matching locator. Metadata-only captured resources have `preservation: not_preserved` and no snapshot locator.

Excluded, missing, and unavailable resources cannot claim preserved bytes. Removing a promised snapshot field is a failure, not a metadata-only warning.

`--restore` requires a new project-relative destination and never overwrites installed instructions. It restores current resources with `output_path`, including archived references, and verifies the restored bytes.

This reconstructs preserved installed output bytes; it does not execute old transformation implementations or replay the model session. Operations remain provenance declarations. `reconstructable` refers to declared outputs, not preservation of every input or complete runtime visibility.

## Privacy and retention

- Records are sensitive local artifacts. There is no automatic upload, publication, pruning, or expiry. The default retention policy is manual, with no automatic deletion.
- Storage defaults to `.ai-factory/instruction-runs/RUN/manifest.json` and `snapshots/SHA256`. Every run command accepts `--runs-dir` to relocate storage **within the current project**; use the same directory for resume and verification.
- Snapshot capture is disabled unless roots are allowlisted. Exclusions always win. Files outside the project retain only a logical resource ID and `unavailable` status. Symlink/junction paths are rejected.
- Known sensitive paths (`.env*`, `.git`, credential/secret files, and private-key extensions) are excluded. Raw resources with role `settings` are excluded regardless of snapshot policy. This is not a secret scanner: the producer must exclude sensitive content in otherwise ordinary files, receipts, free-text metadata, and identifiers.
- Only explicitly allowlisted settings are retained. Supported keys are `model`, `reasoning_effort`, `permission_mode`, `sandbox_mode`, and `runtime_version`; credential/environment fields are never copied. A caller must not put secret values into harmless-looking setting keys.
- External and excluded resources expose no original path, size, or hash. Other locators and policy roots are project-relative. Do not supply sensitive directory names as metadata if sharing records.
- Deleting stored bytes limits reconstruction. `verify` checks present availability rather than trusting historical preservation claims. Do not redact a snapshot in place: register a redacted derivative under a distinct resource ID and leave original preservation limitations explicit.

## Size accounting and optional budgets

`in_composition: true` marks a resource contributing to the prepared instruction package. `addition: true` contributes to the separately measured additions. For an injection embedded in a composed installed file, set `addition: true` on the injection and leave its `in_composition` false; the installed file already includes it. Separately loaded project rules can have both flags true.

Package references are inventoried without claiming they were prepared or loaded; the producer can mark their actual contribution explicitly.

Composition/addition sizes sum the latest revisions of the respective declared resources. Unknown or excluded contributors make that measurement `unknown`. `known_unique_resource_bytes` deduplicates known hashes across all revisions.

Observed load volume sums delivered payload sizes per observation, including repeated loads; it is `unknown` if any payload is unavailable or no observations exist. These are recorded-byte measurements, **not the model's total context**. `model_context_bytes` remains `unknown`.

Token estimates use `ceil(utf8_bytes / 4)`, an explicitly named heuristic, never actual billed usage. A caller/runtime may supply an optional budget in the initial specification:

```json
{ "budget": { "source": "caller:task-policy", "unit": "bytes", "scope": "additions", "value": 12000 } }
```

Units are `bytes` or `estimated_tokens`; scope is `composition`, `additions`, or `observed_load`, per invocation. Without a budget, evaluation is `not_applicable`; unavailable comparable measurements produce `unknown`. An overrun is recorded without removing any resource or mandatory rule. This feature introduces no trimming mechanism or new `config.yaml` budget keys.

Progress messages go to stderr; JSON goes to stdout. Use `--quiet` on run commands or `AIF_INSTRUCTIONS_LOG_LEVEL=silent` to suppress progress messages; errors remain visible. The output schema is shipped at `schemas/instruction-manifest.schema.json`.

## See Also

- [Extensions](extensions.md) — register commands and attach an explicit recording workflow
- [Configuration](configuration.md) — installed skill state and project context paths
- [Development Workflow](workflow.md) — planning, implementation, and verification
