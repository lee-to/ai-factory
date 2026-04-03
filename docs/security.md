[← Plan Files](plan-files.md) · [Back to README](../README.md) · [Extensions →](extensions.md)

# Security

**Security is a first-class citizen in AI Factory.** Skills downloaded from external sources (skills.sh, GitHub, URLs) can contain prompt injection attacks — malicious instructions hidden inside SKILL.md files that hijack agent behavior, steal credentials, or execute destructive commands.

AI Factory protects against this with a **mandatory two-level security scan** that runs before any external skill is used:

```
External skill downloaded
         │
         ▼
┌─── Level 1: Automated Scanner ────────────────────────────┐
│                                                            │
│  Python-based static analysis (security-scan.py)           │
│                                                            │
│  Detects:                                                  │
│  ✓ Prompt injection patterns                               │
│    ("ignore previous instructions", fake <system> tags)    │
│  ✓ Data exfiltration attempts                              │
│    (curl with .env/secrets, reading ~/.ssh, ~/.aws)        │
│  ✓ Stealth instructions                                    │
│    ("do not tell the user", "silently", "secretly")        │
│  ✓ Destructive commands (rm -rf, fork bombs, disk format)  │
│  ✓ Config tampering (agent dirs, .bashrc, .gitconfig)      │
│  ✓ Encoded payloads (base64, hex, zero-width characters)   │
│  ✓ Social engineering ("authorized by admin")              │
│  ✓ Hidden HTML comments with suspicious content            │
│                                                            │
│  Smart code-block awareness: patterns inside markdown      │
│  fenced code blocks are demoted to warnings (docs/examples)│
│                                                            │
└──────────────────────┬─────────────────────────────────────┘
                       │ CLEAN/WARNINGS?
                       ▼
┌─── Level 2: LLM Semantic Review ──────────────────────────┐
│                                                            │
│  The AI agent reads all skill files and evaluates:         │
│                                                            │
│  ✓ Does every instruction serve the skill's stated purpose?│
│  ✓ Are there requests to access sensitive user data?       │
│  ✓ Is there anything unrelated to the skill's goal?        │
│  ✓ Are there manipulation attempts via urgency/authority?  │
│  ✓ Subtle rephrasing of known attacks that regex misses    │
│  ✓ "Does this feel right?" — a linter asking for network   │
│    access, a formatter reading SSH keys, etc.              │
│                                                            │
└──────────────────────┬─────────────────────────────────────┘
                       │ Both levels pass?
                       ▼
                ✅ Skill is safe to use
```

## Why Two Levels?

| Level | Catches | Misses |
|-------|---------|--------|
| **Python scanner** | Known patterns, encoded payloads, invisible characters, HTML comment injections | Rephrased attacks, novel techniques |
| **LLM semantic review** | Intent and context, creative rephrasing, suspicious tool combinations | Encoded data, zero-width chars, binary payloads |

They complement each other — the scanner is deterministic and catches what LLMs might skip over; the LLM understands meaning and catches what regex can't express.

## Scan Results

- **CLEAN** (exit 0) — no threats, safe to install
- **BLOCKED** (exit 1) — critical threats detected, skill is deleted and user is warned
- **WARNINGS** (exit 2) — suspicious patterns found, user must explicitly confirm

A skill with **any CRITICAL threat is never installed**. No exceptions, no overrides.

## Running the Scanner Manually

```bash
# Scan a skill directory (use your agent's skills path)
python3 .claude/skills/aif-skill-generator/scripts/security-scan.py ./my-downloaded-skill/

# Strict mode: code block examples are treated as real threats (no demotion)
python3 .claude/skills/aif-skill-generator/scripts/security-scan.py --strict ./my-downloaded-skill/

# Scan a single SKILL.md file
python3 .claude/skills/aif-skill-generator/scripts/security-scan.py ./my-skill/SKILL.md

# For other agents, adjust the path accordingly:
# python3 .codex/skills/aif-skill-generator/scripts/security-scan.py ./my-skill/
# python3 .agents/skills/aif-skill-generator/scripts/security-scan.py ./my-skill/
```

## Internal Self-Scan (AI Factory repo)

Built-in AI Factory skills contain security threat examples in documentation, which can trigger expected false positives.
For repository self-audits, use the internal allowlist:

```bash
./scripts/security-self-scan.sh
# or:
# python3 skills/aif-skill-generator/scripts/security-scan.py \
#   --md-only \
#   --allowlist scripts/security-scan-allowlist-ai-factory.json \
#   skills/
```

Use `--allowlist` only for trusted first-party content. Do not use it when scanning external downloaded skills.

## See Also

- [Core Skills](skills.md) — `/aif-security-checklist` for project-level security audits
- [Plan Files](plan-files.md) — skill acquisition strategy and how scanning fits in
- [Extensions](extensions.md) — extension system and its security model
- [Configuration](configuration.md) — MCP servers and project structure
