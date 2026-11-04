# Fix defaults — behavioral regression matrix

These are manual agent scenarios, separate from the executable config-helper
tests (`npm run test:workflow-defaults-config`) and static rendered-skill checks
(`npm run test:selective-references`). Passing those checks does not mean a model
executed these scenarios.

Use a disposable Node project with a reproducible null-access bug and an existing
regression test. Keep UI/artifacts English, no skill-context overrides, and no
fix plan unless specified. Observe actual questions, reads, writes, test commands,
and Handoff calls. Decline additional coverage when prompted; repeat completed
fix cases accepting it. That preference must not affect the patch policy.

| Config / invocation | Expected behavior |
|---------------------|-------------------|
| Missing config/keys, bug supplied | Ask Fix now / Plan first once; choosing now verifies the regression and writes one learning patch |
| Each `fix_mode: ask`, `now`, `plan` with each `fix_patch: true`, `false` | Ask only for ask; now executes, plan saves configured fix plan and stops without code edits or patch; completed fixes write a patch only when enabled |
| `fix_mode: plan`, `--fix-now <bug>` | Execute without mode question; preserve configured patch policy |
| `fix_mode: now`, `--plan-first <bug>` | Save only the fix plan and stop; no completed-fix patch even with `--patch` |
| `fix_patch: false`, `--patch <bug>`; `fix_patch: true`, `--no-patch <bug>` | Explicit flag overrides patch config independently of mode |
| `--plan-first --fix-now <bug>`; reversed flags | Last mode flag wins |
| `--patch --no-patch <bug>`; reversed flags | Last patch flag wins |
| Bug text includes `--no-patch-example`, a quoted `"--plan-first"`, or a code span | Preserve that problem text; do not interpret it as a control flag |
| No plan, empty arguments or only control flags | Missing-problem message; no mode question or artifact writes |
| Existing default fix plan, `fix_mode: plan`, `--plan-first --no-patch` and no description | Execute existing plan, verify and delete default plan; no learning patch |
| Existing custom fix plan, `fix_patch: false` | Execute and preserve custom plan; no patch writes or patches-directory creation; preserve existing patch files |
| Plan created with `--no-patch`, later executed with config `fix_patch: true` | Later invocation writes patch; earlier override was not persisted to plan/config |
| `fix_mode: deep` or `true`; `fix_patch: "false"` or `never` | WARN [config] per invalid key, independently fall back to ask / true; explicit flags still override |
| `HANDOFF_MODE=1`, each ask / now / plan, both patch values | No mode questions or MCP calls; only ask falls back to now; plan creates annotated plan and stops; retain patch policy |
| Manual linked Handoff task, completed fix with patches disabled | Keep implementing → review/done sync and paused contract; no patch writes |
| Failed/blocked verification, patches enabled | No completed-fix patch or successful-plan cleanup |

All execution cases retain regression-first handling, logging, required
clarification/approval, extra coverage suggestions, and artifact language/path
rules. Disabled patch creation must report the skip in the UI language; it does
not disable the optional read-only fallback to existing patches.
