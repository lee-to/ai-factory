#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
CLI="$ROOT_DIR/dist/cli/index.js"

TMPDIR=$(mktemp -d)
trap 'rm -rf "$TMPDIR"' EXIT

cd "$TMPDIR"
mkdir -p .ai-factory

cat > .ai-factory.json <<'JSON'
{
  "version": "2.3.0",
  "agents": [],
  "extensions": []
}
JSON

# init should create default subagents config
node "$CLI" subagent init >/dev/null
node -e 'const fs=require("fs");const c=JSON.parse(fs.readFileSync(".ai-factory.json","utf8")); if(!c.subagents||!c.subagents.enabled){process.exit(1)}'

# plan scouting on fast plan
cat > .ai-factory/PLAN.md <<'MD'
- [ ] Task A
- [ ] Task B deps: Task A
MD
node "$CLI" subagent run-plan "auth impact" >/dev/null
node "$CLI" subagent run-implement >/dev/null
node "$CLI" subagent status >/dev/null

# implement should also work when only branch plan exists
rm .ai-factory/PLAN.md
mkdir -p .git .ai-factory/plans
cat > .git/HEAD <<'HEAD'
ref: refs/heads/feature-subagents
HEAD
cat > .ai-factory/plans/feature-subagents.md <<'MD'
1. Branch task 1
2. Branch task 2 depends on: Branch task 1
MD
node "$CLI" subagent run-implement >/dev/null

# extension add/remove should apply/remove subagent profiles in config
mkdir -p local-ext
cat > local-ext/extension.json <<'JSON'
{
  "name": "ext-subagent-test",
  "version": "1.0.0",
  "subagents": [
    {
      "id": "ext-worker",
      "role": "planner-scout",
      "description": "extension worker",
      "maxContextChars": 8000,
      "outputFormat": "markdown"
    }
  ]
}
JSON

node "$CLI" extension add ./local-ext >/dev/null
node -e 'const fs=require("fs");const c=JSON.parse(fs.readFileSync(".ai-factory.json","utf8")); const has=(c.subagents?.profiles||[]).some(p=>p.id==="ext-worker"); if(!has) process.exit(1); const ext=(c.extensions||[]).find(e=>e.name==="ext-subagent-test"); if(!ext||!ext.subagentProfileIds||ext.subagentProfileIds[0]!=="ext-worker") process.exit(1);'

node "$CLI" extension remove ext-subagent-test >/dev/null
node -e 'const fs=require("fs");const c=JSON.parse(fs.readFileSync(".ai-factory.json","utf8")); const has=(c.subagents?.profiles||[]).some(p=>p.id==="ext-worker"); if(has) process.exit(1);'

echo "subagent tests passed"
