# Visual Output Skill Template

Use for generating HTML reports, visualizations, diagrams.

```yaml
---
name: {{SKILL_NAME}}
description: {{DESCRIPTION}}
allowed-tools: Bash(python *)
metadata:
  author: {{AUTHOR}}
  version: "1.0"
---

# {{TITLE}}

Generate interactive visualization for $ARGUMENTS.

## Usage

```bash
python ~/{{skills_dir}}/{{SKILL_NAME}}/scripts/visualize.py $ARGUMENTS
```

## Output

Creates `{{OUTPUT_FILE}}` in current directory and opens in browser.

## Features

- Feature 1
- Feature 2
- Feature 3

## Requirements

- Python 3.8+
- No external dependencies (uses standard library only)
```

---

## Example Script Structure

Create `scripts/visualize.py`:

```python
#!/usr/bin/env python3
"""Generate interactive visualization."""

import json
import sys
import webbrowser
from pathlib import Path

def scan(path: Path) -> dict:
    """Scan and collect data."""
    # Your data collection logic
    return {"data": []}

def generate_html(data: dict, output: Path) -> None:
    """Generate HTML visualization."""
    html = f'''<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>{{TITLE}}</title>
    <style>
        body {{ font: 14px system-ui; margin: 0; background: #1a1a2e; color: #eee; }}
        .container {{ padding: 20px; }}
    </style>
</head>
<body>
    <div class="container">
        <h1>{{TITLE}}</h1>
        <div id="content"></div>
    </div>
    <script>
        const data = {json.dumps(data)};
        // Your visualization logic
        document.getElementById('content').innerHTML = JSON.stringify(data, null, 2);
    </script>
</body>
</html>'''
    output.write_text(html)

if __name__ == '__main__':
    target = Path(sys.argv[1] if len(sys.argv) > 1 else '.').resolve()
    data = scan(target)
    output = Path('{{OUTPUT_FILE}}')
    generate_html(data, output)
    print(f'Generated {output.absolute()}')
    webbrowser.open(f'file://{output.absolute()}')
```
