# Context Management

Referenced from `SKILL.md` Step 9.

The loop generates significant context per iteration (subagent results, evaluation data, critique). After several iterations the conversation context grows large, degrading LLM quality.

All loop state is persisted to disk — clearing context loses nothing. The `resume` command fully reconstructs state from files.

## When to recommend context clear

Recommend clearing context to the user in these situations:

1. **After iteration 2** — the midpoint of a default 4-iteration loop
2. **On Phase A → B transition** — natural boundary, new evaluation scope begins
3. **After any iteration where `iteration >= 3`** — context is already heavy

## How to recommend

After the iteration summary, append:

```text
💡 Context is growing. Recommended: /clear then /aif-loop resume
   All state is saved on disk — nothing will be lost.
```

Do not force or auto-clear. The user decides. If the user ignores the recommendation, continue normally.
