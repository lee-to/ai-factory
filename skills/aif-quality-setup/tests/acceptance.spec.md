# Runtime Acceptance Specification

These cases require actual execution of the selected skill in disposable projects.
They are not run by the offline packaging suite. Start with reviewed fixture copies;
record independent hashes for source/config/lock/hook files, Git index tree/patch,
unstaged patch and relevant Git config. Use exact CWD and preserve prior failures.

| Case | Action | Observable acceptance |
| --- | --- | --- |
| A01 discovery/audit | Audit each js-ts/php/python/rust fixture without applying | Correct manifest/runtime/tool evidence; project bytes/index/config unchanged; no install, script or config execution |
| A02 choices | Select only a subset of checks; repeat with cancel | Only selected changes/dependencies; cancel preserves all state; no Node requirement added to another stack |
| A03 compatibility | Use conflicting managers, a missing runtime and an incompatible tool version | Focused questions/reasoned compatible options; unavailable execution is not_run; no silent runtime upgrade |
| A04 existing setup | Enhance existing lint/prepare/config/hooks, then rerun | Original semantics/order/comments and unrelated changes preserved; no duplicate entries or unchosen migration |
| A05 mixed monorepo | Audit/setup mixed fixture backend and web | Both stacks identified with correct roots/CWD; repository hook routes selected commands; analysis never receives filenames |
| A06 multirepo | Initialize independent Git roots in multirepo fixture before invocation; use the supplied conflicting contexts and select api and worker | Resolve api custom paths/Russian artifacts and worker English artifacts/git.enabled:false independently; preserve root-local rules and skill-context; gateway missing config uses its own defaults and stays byte/index/config unchanged; invocation UI stays stable; no Git queries/hooks in worker and no api-to-worker cross-check without explicit choice |
| A07 partial staging/check | Stage one hunk, leave another unstaged; run actual check hook | Index and working tree restored exactly; hook checks advertised content scope; unrelated hunks never committed |
| A08 fix-and-stop | Select a supported mutating runner, induce a fix and run Git commit | Commit stops; only agreed fixes remain; unrelated unstaged hunks preserved; no retry/bypass or broad stage |
| A09 fix-and-stage | Select a verified runner, stage one hunk and induce supported fixes | Only selected staged fixes enter actual commit; unrelated unstaged hunk remains; commit skill inspects committed scope before push offer |
| A10 hook failure | Introduce an intentional lint/config failure | Git commit fails; HEAD creation state inspected; no --no-verify; retry uses current index/message and valid authorization |
| A11 worktree | Create a linked worktree; repeat with existing custom hooksPath | .git file understood; correct effective paths; no global/shared/sibling config changes outside selected scope |
| A12 no Git | Run with no repository or git.enabled:false | Native checks-only proposal works; no git init/hook install; no claim hooks are configured |
| A13 aggregate result | Make one selected required component check unavailable | Per-repository configured/verified/not_run/failed result; aggregate is incomplete, never verified success |
| A14 platforms | Execute selected generated hooks on Windows and Linux, including paths with spaces | Actual hook invocation, quoting, line endings and environment work on each claimed platform |
| A15 native scope | Verify Cargo members/features, Python environment, PHP analysis and TS/framework typecheck | Exact project coverage/config/CWD maintained; no filenames appended to project-wide commands |
| A16 partial failure | Fail dependency/hook installation after some selected writes | Exact partial changes and recovery reported; no false rollback, reset/clean or weakened ignores |
| A17 EOL conflict | Use LF source with inherited autocrlf conversion and no matching attributes; compare with an explicitly aligned LF fixture | Conflict identified before claiming staged byte preservation; no automatic Git/attributes changes; incompatible isolation is withheld or replaced by an agreed truthful scope; failed observation retained |

For A07–A10 compare index and working tree separately; a clean status alone is
insufficient. A successful format example or stubbed tool verifies only that example
or adapter, not the skill's choices, staging guarantees or the complete workflow.

For A02/A08/A09 start an additional fresh setup without installed quality tools:
observe tool/candidate selection and explicit scratch-install/execution authorization
before validation, then activation only after matching version/platform/EOL/staging
checks pass. Repeat with refusal, failed validation and missing prerequisites: no
mutating hook activation, honest failed/not_run, and check-only alternative selected
separately when it changes the agreed effects. Audit never starts this sequence.
