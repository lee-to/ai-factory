#!/bin/bash

create_bounded_helper_extension_fixture() {
  local extension_dir="$1"

  mkdir -p "$extension_dir/agent-files/codex" "$extension_dir/injections"

  cat > "$extension_dir/extension.json" <<'EOF'
{
  "name": "aif-ext-bounded-helpers",
  "version": "1.0.0",
  "description": "Test extension that ships a bounded Codex helper and an aif-improve injection.",
  "agentFiles": [
    {
      "runtime": "codex",
      "source": "agent-files/codex/bounded-plan-polisher.toml",
      "target": "bounded-plan-polisher.toml"
    }
  ],
  "injections": [
    {
      "target": "aif-improve",
      "position": "append",
      "file": "./injections/aif-improve-bounded-helper.md"
    }
  ]
}
EOF

  cat > "$extension_dir/agent-files/codex/bounded-plan-polisher.toml" <<'EOF'
name = "bounded_plan_polisher"
description = "Bounded one-shot worker for plan refinement checks."
model = "gpt-5.4-mini"
model_reasoning_effort = "medium"
sandbox_mode = "read-only"
developer_instructions = """
This bounded planning worker is advisory only and reviews the current plan context without editing files.
Use runtime-specific delegation prompts only as local helper guidance.
Return refinement guidance to the parent agent instead of mutating plan artifacts directly.
"""
EOF

  cat > "$extension_dir/injections/aif-improve-bounded-helper.md" <<'EOF'

## Extension Companion Note

Use the canonical refinement command for this extension workflow.
Keep runtime-specific delegation prompts aligned with bounded helper agents.
EOF
}
