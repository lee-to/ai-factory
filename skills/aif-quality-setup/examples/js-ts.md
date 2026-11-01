# Example: Existing JS Service and Optional TS Check

Discovery: npm project, existing `lint` and `prepare`, no formatter. Recommend
keeping existing lint/build logic and adding format checks. Install compatible
local dev tool versions only after selection; these snippets do not select versions.

Merge only missing entries into package.json (do not replace scripts):

```json
{
  "scripts": {
    "lint": "eslint . --max-warnings 0",
    "prepare": "npm run build",
    "format:check": "prettier --check .",
    "format:fix": "prettier --write .",
    "check:staged": "lint-staged"
  }
}
```

The first two lines represent existing selected policy. If lint already means
something else, preserve it. For a TS component with a suitable tsconfig and no
framework-specific checker, separately propose `tsc --noEmit -p tsconfig.json`.
Do not add it to a pure JS project or pass filenames to it.

For a new compatible plain JS flat config, adapt eslint.config.mjs:

```js
import js from '@eslint/js';
import prettier from 'eslint-config-prettier';

export default [
  { ignores: ['dist/**', 'coverage/**'] },
  js.configs.recommended,
  prettier,
];
```

This is not a TS/framework preset. Add appropriate parser/globals/framework rules
from the actual project; preserve existing legacy configs unless migration is chosen.
If Biome already covers lint/format here, prefer its existing project commands and
retain a separate typecheck rather than adding this competing configuration.

After choosing compatible lint-staged, a check-only lint-staged.config.mjs can be:

```js
export default {
  '*.{js,ts,jsx,tsx}': ['eslint --max-warnings 0', 'prettier --check'],
};
```

This ordered list checks the same selected files sequentially. Add other file types
only when supported. For a selected Husky installation, the pre-commit body can
run `npm run check:staged`. Compose Husky installation with the existing prepare
command rather than overwriting it with init. A TS pre-push hook can run the chosen
project typecheck script without filenames.

Fix-and-stage is a separate choice: use an ordered fix task list with lint-staged's
supported staging protections; no extra broad git add. Fix-and-stop requires a
compatible failure-on-change mechanism and leaves fixes for review. Verify both
modes with partial staging before offering them as supported.
