# Shared Context Model Scenarios

Manual scenarios, **not executed by the installation/CLI smoke tests**. Use disposable
project fixtures and a recorded model/runtime. Freeze each baseline, tool access,
cases and expected checks; retain outputs. Do not write active rules without the
existing candidate evidence and exact-revision approval.

| Case | Fixture / action | Required result |
|------|------------------|-----------------|
| Legacy | Only individual context exists; invoke plan | Same individual behavior, no shared files created |
| Shared-only patch fallback | No individual context for fix/implement/improve; global/build contains only report formatting; twelve patches contain distinct prevention points | Each consumer reads only the latest ten patches automatically and retains the shared formatting rule; an existing individual file keeps the prior targeted-only fallback |
| Layer order | Global says summary in bullets; build says table; individual plan says numbered list | Plan uses numbered list; fix uses table; docs uses bullets; non-conflicting instructions from all layers remain |
| Group exclusion | Build requires plan/implementation checklist; invoke review, docs, warmup, build-automation | None loads/applies build context; all still load global and their individual file |
| Early route | Invoke implement status/list/inline and improve list | Applicable shared/individual context applies to every output without loading unrelated procedure references |
| Missing / unreadable | Remove all context files, then make an applicable existing one unreadable | Absence preserves defaults; unreadable file reports its path and stops dependent work |
| Named evolve | Two equal individual rules; invoke evolve fix | Individual candidate only, no shared writes/deletions or automatic widening |
| Full build consolidation | Five eligible built-ins contain equal conditional rules with unique exceptions and source labels | Exact final move/deletions shown; retain exceptions/provenance, validate every consumer plus controls, record duplicate reduction; write once only after accepted comparison and approval |
| Partial stale coverage | Plan base now covers a build rule; fix still needs it | Build rule stays; one covered consumer cannot authorize deletion |
| Partial ownership | One shared consumer is extension-replaced, unresolved, missing or escapes project root | No shared candidate eligible; individual or postpone, no managed edits |
| Unsupported promotion | Similar rules have different triggers, or all-mode selection omits a global consumer | No widened rule; preserve applicability and unique local rules |
| Missing / failing evidence | Four consumers pass; fifth is NOTRUN or regresses | Entire shared candidate postponed/rejected, all originals intact; approval cannot turn missing evidence into accept |
| Boundary / drift | Shared rule asks to bypass validation; or consumer ownership/baseline changes before apply | Preserve hard boundary; drift stops apply and requires re-resolution/revalidation/reapproval |
| Transfer / home scope | Named transfer, all transfer, then evolve all --global | Named transfer stays individual; all transfer validates all consumers and redacts complete moved/deleted content; home-scope evolve never mutates project shared files |
| Failure during move | Validation succeeds, but a proposed file operation fails | Restore/preserve original rules; do not leave duplicate removals without replacement or advance cursor |

Installation smoke asserts that every bundled skill receives the loader in each of
the 16 runtime formats. CLI smoke asserts warning membership and byte preservation;
neither proves the model follows precedence or consolidation instructions.
