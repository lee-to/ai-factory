# API contract compatibility

Use this reference when the reviewed application changes an API contract or its producer/consumer behavior: routes, schemas, SDK interfaces, events, validation, errors, authorization, pagination, operation completion, cancellation, or retries. Apply project rules and version-support policy first. A new version is not proof that existing consumers migrated; an intentionally separate version need not preserve an unrelated version's wire shape.

This is a review lens, not a generator, runner, or new quality gate. With no relevant API change, continue the normal checklist without loading unrelated consumers. Planning may use the same evidence to propose acceptance checks in an existing plan; this reference authorizes no implementation or artifact writes.

## Pin the comparison and consumer scope

Record the contract path/interface, old and new immutable revisions (commit SHA, release artifact digest, or supplied versioned fixture), supported API versions, and the inspected consumers with revisions and call sites. Pin relevant implementation and tests as well as a schema: a declaration alone does not establish runtime behavior.

In PR mode follow `PR-SOURCE.md`: current producer/consumer evidence comes from the pinned source package, never the local checkout. Use its merge base/head as the change's before/after sides. The merge base is not automatically the last supported release. If another release is the compatibility baseline, pin it separately, retrieve its exact contract through the existing source collector, and label it in the same package without replacing the captured PR identities or diff. Pass relied-on fragments and unavailable dependencies to `+check`; its validator cannot fetch missing PR context.

Bound conclusions to the inspected consumers. Name missing contracts, unknown configuration, uninspected relevant consumers, and external consumers outside that scope. Missing evidence is unknown, not proof of a missing symbol or proof that no clients break. Follow the existing review-uncertainty policy; never invent a consumer to strengthen a finding. A bounded clean result is not a universal compatibility guarantee.

## Compare wire shape and semantics separately

| Surface | Questions grounded in the supported contract and actual callers |
|---|---|
| Inputs and validation | Do existing valid requests still work? Check required fields, defaults, types, enums, limits, coercion, omitted versus null values, and unknown-field handling. Does a new optional input preserve behavior when absent? |
| Responses | Check removed/renamed fields, types, nullability, enums and serialization. Extra optional fields can be compatible for tolerant clients; closed schemas or exhaustive decoders may reject them. Inspect the actual reader instead of declaring every addition safe or breaking. |
| Errors | Compare status/error codes, body shape, success versus failure meaning, partial results and retryability. A schema-valid error encoded as success can make a caller report completion or skip recovery. |
| Authorization | Compare scopes, ownership/tenant checks, roles and token assumptions. Follow explicit security policy; do not preserve an authorization bypass merely for compatibility. Report legitimate migration impact separately. |
| Pagination | Check ordering/tie-breakers, cursor scope/expiry, limit defaults/maxima, continuation signals and duplicate/omitted results across pages under supported mutations. |
| Async operations | Distinguish acceptance from completion, operation IDs, polling/events, terminal states and committed side effects. An unchanged status schema does not prove unchanged completion semantics. |
| Cancellation | Establish whether cancellation acknowledges receipt, guarantees termination, or requests best effort. Compare completion races, partial effects, subsequent polling and cleanup ownership. |
| Retry and idempotency | Check retryable failures, backoff/retry hints, timeout-after-commit, key scope/retention, replayed results and duplicated effects. For retries of the same logical operation, preserve the key when the server's deduplication contract requires it; a fresh key denotes another operation. An idempotency header alone does not establish safety. |

Trace each suspected break through one bounded scenario: old accepted input/output → exact producer change → supported consumer path → changed result or side effect. Separate source facts, inferred impact, proposed checks and executed checks. Actionable hypotheses follow the existing confidence-marker and validation lifecycle; do not suppress them or move them into Questions to avoid validation.

## Findings and verification

Use existing **Critical Issues** or **Suggestions** and `SEVERITY.md`; do not make every schema difference a blocker. A confirmed break on a supported downstream path can be critical. A documentation/migration improvement without a demonstrated broken path can be a suggestion. Version-support policy determines which callers must remain compatible.

Keep the normal behavior → source path/line → bounded fix shape. Include the old/new revisions, affected consumer scenario and material limitations. For example, removing `name` breaks an inspected caller that invokes `response.name.toUpperCase()`; cite both sides and propose preserving the supported field or coordinating a versioned migration, plus a focused regression fixture. The synthetic examples below are not findings about a real project.

Reuse existing OpenAPI/schema validators and contract/regression fixtures only through commands already permitted and approved by the calling workflow. Do not install tools, execute project imports/hooks to discover behavior, call production, or run PR code. PR review retains its source-only boundary; propose checks needing separate authorization outside that review. This reference grants no independent execution authority.

Call a check executed only with its actual command, checked revision/fixture, result and relevant output; otherwise mark it proposed or not run. Passing schema validation does not establish retry, authorization, completion or cancellation semantics. Record incomplete consumer inspection in **Review Sources** for PR mode or the normal summary otherwise. Preserve the existing `aif-gate-result` schema, validation lifecycle and final-fence ordering.

## Synthetic examples

These independently authored examples use fixture labels B0/B1, not real commit IDs. They illustrate what the skill should assess in an application's code. Local assertions check the example data, not a model's finding quality; they do not authorize running a reviewed repository.

| Fixture | B0 → B1 change and inspected consumer | Expected assessment |
|---|---|---|
| `removed-field` | `{id: "job-1", name: "ready"}` → `{id: "job-1"}`; the reader calls `response.name.toUpperCase()` | Field removal breaks this reader. Cite producer/reader revisions and propose a regression fixture. |
| `nullable-response` | `name: "ready"` → `name: null`; the same reader expects a non-null string | A distinct nullability break: the field still exists. |
| `retry-dedup` | Both versions accept `requestId` and return `{id: string}`. B0 deduplicates the key; B1 ignores it. After a timeout-after-commit the caller repeats the operation with the same key | Wire shape is compatible; the repeated operation creates two jobs instead of one. Check scope/retention and effects. |
| `additive-tolerant` | B1 adds optional `displayLabel`; the inspected reader uses only the unchanged `name` and tolerates unknown fields | No break established for this reader. Do not automatically reject the addition or claim uninspected clients are safe. |
| `additive-closed` | The same addition reaches another reader whose closed decoder rejects unknown fields | This decoder establishes a concrete concern; tolerant readers do not disprove it. |
| `uninspected-consumer` | Only the web reader was inspected at its recorded revision; a relevant supported mobile reader is unavailable | Mobile compatibility remains unknown. Keep limitations visible and concrete hypotheses in the existing validation path; never claim all consumers passed. |

## Source provenance

Methodological pointer: Sergey Konstantinov, [The API](https://twirl.github.io/The-API-Book/index.ru.html), especially backward compatibility (accessed 2026-10-28). This reference and its synthetic examples are original AI Factory guidance, not copied book text. The book is not the reviewed project's contract or version-support authority.
