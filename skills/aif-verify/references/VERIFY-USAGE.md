## Usage

### After implement (suggested automatically)
```
/aif-verify
```

With an explicit plan (required for full-stay/fast plans whose stem does not match the current branch):

```
/aif-verify @.ai-factory/plans/add-search.md
```

### Strict mode before merge
```
/aif-verify --strict
```

### Standalone (no plan, verify branch diff)
```
/aif-verify
→ No plan found → verify branch diff against the configured base branch
```
