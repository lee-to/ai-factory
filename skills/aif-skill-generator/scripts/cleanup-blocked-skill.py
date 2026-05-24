#!/usr/bin/env python3
"""
Cleanup helper for security-blocked skills.

Workaround for upstream bug vercel-labs/skills#977:
  On project scope, `npx skills remove` deletes files but leaves the
  skills-lock.json entry stale. A later `npx skills experimental_install`
  (or a teammate cloning the repo and running install) resurrects the
  blocked skill — defeating the security scan gate in /aif.

This script:
  1. Runs `npx skills remove -s <skill> -y` (best-effort; removes files,
     may leave the lock entry behind on project scope).
  2. Patches <root>/skills-lock.json to drop the "skills.<skill>" key
     atomically (tmp + os.replace). No-op if the entry is absent.
  3. Verifies the patched lock file no longer contains the skill entry.

When upstream skills#977 is fixed, step 2 becomes a no-op and the script
can be reduced to just calling `npx skills remove`; no consumer changes
needed.

Usage:
  cleanup-blocked-skill.py --skill <name> [--root <dir>]
                           [--installed-path <path>] [--dry-run]

Exit codes:
  0 - clean removal
  1 - operational error (invalid JSON, write failed, lock-verify failed,
      npx missing in non-dry-run, skill directory still present at
      --installed-path, or `npx skills remove` returned non-zero when
      --installed-path was not supplied to confirm file deletion)
  2 - usage error (missing/invalid arguments)

Notes on --installed-path:
  When provided, the helper verifies the physical skill directory is
  gone after cleanup. This makes the exit code an exact signal:
    - dir still exists  -> exit 1 (covers the silent rc=0+dir-leak case)
    - dir is gone       -> exit 0 even if `npx skills remove` returned
                           non-zero (downgrade partial-failure when the
                           actual security goal is achieved)
  When omitted, behavior is unchanged for backward compatibility:
  any non-zero from `npx skills remove` is reported as exit 1.

  IMPORTANT: pass the ACTUAL installed directory (the one previously
  fed to security-scan.py). Do NOT synthesize the path from the
  logical skill name — upstream `skills` CLI sanitizes the on-disk
  directory name (lowercase, non-alphanumeric runs collapsed to `-`),
  so a logical name like "Convex Best Practices" lives at
  `.<agent>/skills/convex-best-practices`, not `.<agent>/skills/Convex Best Practices`.
  Synthesizing the path from the logical name will silently verify
  the wrong location and may report success while the blocked skill
  remains on disk.
"""

import argparse
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path


def validate_skill_name(name: str):
    """Return error message if name is unsafe, None if OK.

    Deny-list approach: aligns with the upstream skills CLI surface
    (which accepts plain spaces and broader punctuation) while
    rejecting genuinely unsafe values.
    """
    if not name or not name.strip():
        return "empty or whitespace-only"
    if any(ord(c) < 0x20 or ord(c) == 0x7f for c in name):
        return "control characters not allowed"
    if '/' in name or '\\' in name:
        return "path separators not allowed"
    if any(c in name for c in '*?'):
        return "wildcards not allowed; specify exact name"
    if name.lstrip().startswith('-'):
        return "leading hyphen not allowed (could be parsed as a flag)"
    if name.strip() in ('.', '..'):
        return "reserved name"
    return None


def patch_lock(lock_path: Path, skill: str, dry_run: bool = False):
    """Remove skills[<skill>] from skills-lock.json.

    Returns (changed: bool, message: str). Raises RuntimeError on invalid JSON.
    Atomic write: writes to <lock>.tmp then os.replace. Preserves 2-space
    indent and trailing newline if the original had one.

    When the key is absent, returns a non-modifying (False) result and
    includes the sorted list of available keys in the message so the
    caller can spot typos or display-name vs canonical-key mismatches.
    """
    if not lock_path.exists():
        return (False, f"lock file not found: {lock_path} (nothing to clean)")

    raw = lock_path.read_text(encoding='utf-8')
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as e:
        raise RuntimeError(f"invalid JSON in {lock_path}: {e}")

    skills_section = data.get('skills')
    if not isinstance(skills_section, dict):
        return (False, "no 'skills' object in lock file (nothing to clean)")

    if skill not in skills_section:
        available = sorted(skills_section.keys())
        if not available:
            return (False, f"skill '{skill}' not present; lock file has no skill entries")
        return (False, f"skill '{skill}' not present in lock file; available keys: {available}")

    if dry_run:
        return (True, f"would remove '{skill}' from {lock_path}")

    del skills_section[skill]

    new_text = json.dumps(data, indent=2, ensure_ascii=False)
    if raw.endswith('\n'):
        new_text += '\n'

    tmp_path = lock_path.with_name(lock_path.name + '.tmp')
    tmp_path.write_text(new_text, encoding='utf-8')
    os.replace(tmp_path, lock_path)
    return (True, f"removed '{skill}' from {lock_path}")


def _resolve_npx():
    """Locate the npx executable (handles npx.cmd on Windows)."""
    return shutil.which('npx') or shutil.which('npx.cmd')


def run_skills_remove(skill: str, root: Path, dry_run: bool = False) -> int:
    """Invoke `npx skills remove -s <skill> -y` with cwd=<root>.

    Returns the CLI exit code. In non-dry-run mode, raises RuntimeError
    if npx is not on PATH — a missing CLI is a hard failure for the
    security cleanup contract, not a silent success.

    The subprocess runs with cwd=root so the upstream CLI inspects the
    correct project's `skills-lock.json` even when `--root` points at a
    project other than the helper's own cwd. Without this, the helper
    could patch one project's lock file while telling npx to remove
    skills from a different project context.
    """
    npx = _resolve_npx()
    if not npx:
        if dry_run:
            print(f"would run (in {root}): npx skills remove -s {skill!r} -y "
                  "(npx not on PATH; would be a hard error in non-dry-run)",
                  file=sys.stderr)
            return 0
        raise RuntimeError("npx not found on PATH; cannot remove skill files")

    cmd = [npx, 'skills', 'remove', '-s', skill, '-y']
    if dry_run:
        print(f"would run (in {root}): {' '.join(cmd)}")
        return 0
    result = subprocess.run(cmd, cwd=str(root))
    return result.returncode


def verify_lock_clean(lock_path: Path, skill: str) -> bool:
    """Confirm the skill is absent from skills-lock.json after patching.

    Deterministic: re-reads the lock file and inspects the in-memory
    structure. Avoids fragile string/regex matching against the
    ANSI-colored output of `npx skills list` (which also breaks for
    skill names that contain spaces).
    """
    if not lock_path.exists():
        return True  # no lock file = trivially clean
    try:
        data = json.loads(lock_path.read_text(encoding='utf-8'))
    except json.JSONDecodeError:
        return False  # corrupt lock file: cannot verify
    skills_section = data.get('skills')
    if not isinstance(skills_section, dict):
        return True
    return skill not in skills_section


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Cleanup helper for security-blocked skills: deletes the skill directory and clears its entry from skills-lock.json.",
    )
    parser.add_argument('--skill', required=True,
                        help="Skill name to remove. Accepts the same name surface "
                             "as the upstream skills CLI (including spaces). "
                             "Rejects path separators, wildcards, control chars, "
                             "leading hyphen, and reserved '.'/'..'.")
    parser.add_argument('--root', default='.',
                        help="Project root containing skills-lock.json (default: cwd)")
    parser.add_argument('--installed-path', default=None,
                        help="Optional: absolute path (or path relative to --root) "
                             "to the installed skill directory. When provided, the "
                             "helper verifies the directory is gone after cleanup "
                             "and uses that signal to refine the exit code "
                             "(see module docstring).")
    parser.add_argument('--dry-run', action='store_true',
                        help="Print actions without executing")
    args = parser.parse_args()

    skill = args.skill
    err = validate_skill_name(skill)
    if err is not None:
        print(f"error: invalid --skill value: {skill!r} ({err})", file=sys.stderr)
        return 2

    root = Path(args.root).resolve()
    if not root.is_dir():
        print(f"error: --root is not a directory: {root}", file=sys.stderr)
        return 2

    lock_path = root / 'skills-lock.json'

    # Step 1: ask the CLI to remove (deletes files; may leave lock stale on project scope).
    # Subprocess runs with cwd=root so npx inspects the right project's lock file.
    # If npx is missing in non-dry-run mode, this is a hard error.
    cli_failed = False
    try:
        rc = run_skills_remove(skill, root, dry_run=args.dry_run)
    except RuntimeError as e:
        print(f"error: {e}", file=sys.stderr)
        return 1
    if rc != 0 and not args.dry_run:
        # Non-zero from npx is NOT immediately fatal: the lock patch below
        # is the security-critical step. We still patch, then exit 1 at the
        # end to signal partial failure (lock cleared but file deletion
        # uncertain — caller should verify the skill directory is gone).
        print(f"warning: `npx skills remove` returned exit {rc}; "
              "continuing to lock-file patch (file deletion uncertain)",
              file=sys.stderr)
        cli_failed = True

    # Step 2: patch lock file (workaround for skills#977).
    try:
        _, msg = patch_lock(lock_path, skill, dry_run=args.dry_run)
    except RuntimeError as e:
        print(f"error: {e}", file=sys.stderr)
        return 1
    print(msg)

    # Step 3: verify by re-reading the lock file.
    if not args.dry_run and not verify_lock_clean(lock_path, skill):
        print(f"error: '{skill}' is still present in {lock_path} after patch",
              file=sys.stderr)
        return 1

    # Step 4: optional physical-directory verification.
    # When --installed-path is supplied, the helper can give an exact
    # signal: a missing directory downgrades partial CLI failure to
    # success, and a present directory escalates even an "all green"
    # run to exit 1 (catches the rc=0 + dir-still-there silent leak).
    if args.installed_path and not args.dry_run:
        installed = Path(args.installed_path)
        if not installed.is_absolute():
            installed = root / installed
        if installed.exists():
            print(f"error: skill directory still present at {installed}; "
                  "manual cleanup required (`rm -rf` the path)",
                  file=sys.stderr)
            return 1
        cli_failed = False

    # Partial-failure exit: lock cleared but `npx skills remove` failed
    # and we cannot independently confirm the files are gone.
    if cli_failed:
        return 1

    return 0


if __name__ == '__main__':
    sys.exit(main())
