## Commands

### Start/Resume Implementation

```
/aif-implement
```

Continues from next incomplete task.

### List Available Plans

```
/aif-implement --list
```

Lists the resolved fast/fix plan paths and current-branch full/ultra artifacts
(including sequential identifiers), then exits without implementation.

### Use Explicit Plan Artifact

```
/aif-implement @my-custom-plan.md
/aif-implement @.ai-factory/plans/feature-user-auth.md status
/aif-implement @.ai-factory/plans/feature-user-auth status
```

Uses the provided plan file, ultra directory, or ultra `index.md` instead of
auto-detecting by branch/default artifacts.

### Inline Implementation (No Plan)

```
/aif-implement --without-plan add GET /healthz endpoint returning {"status":"ok"}
/aif-implement --without-plan rename LogLevel.VERBOSE to LogLevel.TRACE --docs=yes
```

One-shot execution of a small task without any plan file. Mutually exclusive with `@plan-file`, `status`, and task id. Does not create `FIX_PLAN.md` or patches. Default docs policy is `warn`; pass `--docs=yes` to run the docs checkpoint, `--docs=no` to silence the warning. See **Step 0.inline** for the full flow.

### Start from Specific Task

```
/aif-implement 5
```

Starts from task #5 (useful for skipping or re-doing).

### Check Status Only

```
/aif-implement status
```

Shows progress without executing.
