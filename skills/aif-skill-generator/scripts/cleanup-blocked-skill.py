#!/usr/bin/env python3
"""
Cleanup helper for security-blocked skills.

Workaround for upstream bug vercel-labs/skills#977:
  On project scope, `npx skills remove` deletes files but leaves the
  skills-lock.json entry stale. A later `npx skills experimental_install`
  (or a teammate cloning the repo and running install) resurrects the
  blocked skill — defeating the security scan gate in /aif.

This script:
  1. Runs `npx skills remove -s <skill> -y` (best-effort first pass).
  2. Patches <root>/skills-lock.json to drop the "skills.<skill>" key
     atomically (tmp + os.replace). No-op if the entry is absent.
  3. Verifies the patched lock file no longer contains the skill entry.
  4. When --installed-path is provided: physically removes the directory
     via `safe_remove_installed()` after strict safety validation.
     This is the authoritative cleanup step — the helper is the
     guarantor of physical removal, not the upstream CLI. See the
     comment block above Step 4 in main() for the upstream-CLI
     mismatch that makes this step necessary.

Usage:
  cleanup-blocked-skill.py --skill <name> [--root <dir>]
                           [--installed-path <path>] [--dry-run]

Exit codes:
  0 - clean removal (lock cleared; if --installed-path supplied, dir is gone)
  1 - operational error (invalid JSON, write failed, lock-verify failed,
      npx missing in non-dry-run, `npx skills remove` returned non-zero
      and --installed-path was not supplied, or a safety check on
      --installed-path rejected the deletion)
  2 - usage error (missing/invalid arguments)

Caller contract for --installed-path:
  Pass the ACTUAL installed directory (the same path previously fed to
  security-scan.py). Do NOT synthesize the path from the logical skill
  name — upstream `skills` CLI sanitizes the on-disk directory name
  (lowercase, non-alphanumeric runs collapsed to `-`), so a logical
  name like "Convex Best Practices" lives at
  `.<agent>/skills/convex-best-practices`. A synthesized path silently
  misses the real blocked skill.
"""

import argparse
import json
import os
import shutil
import stat
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


# Reparse-point bit on Windows. NTFS junctions (created via `mklink /J`)
# carry FILE_ATTRIBUTE_REPARSE_POINT but Path.is_symlink() does not detect
# them reliably on Python <= 3.11. We detect them explicitly so an
# attacker cannot redirect `.claude/skills/foo` to an arbitrary path on
# disk via a junction.
_FILE_ATTRIBUTE_REPARSE_POINT = 0x0400


def _is_reparse_point(p: Path) -> bool:
    """True if `p` is a symlink OR (on Windows) a reparse point.

    Inspects `os.lstat` BEFORE any resolve() — resolve() would follow the
    redirect and hide it. On non-Windows platforms this falls back to
    the standard `is_symlink()` check.
    """
    try:
        st = os.lstat(p)
    except OSError:
        return False
    if stat.S_ISLNK(st.st_mode):
        return True
    # st_file_attributes is Windows-only (Python 3.5+).
    attrs = getattr(st, 'st_file_attributes', None)
    if attrs is not None and (attrs & _FILE_ATTRIBUTE_REPARSE_POINT):
        return True
    return False


def _chmod_retry(func, path, exc_info):
    """`shutil.rmtree` onerror: retry after clearing the read-only bit.

    Windows refuses to delete read-only files via the standard unlink
    syscall; clearing FILE_ATTRIBUTE_READONLY makes the retry succeed.
    On POSIX, chmod +w is harmless when the original failure was a
    different cause (the retry will simply fail again and propagate).
    """
    try:
        os.chmod(path, stat.S_IWRITE | stat.S_IREAD)
    except OSError:
        pass
    func(path)


def safe_remove_installed(installed: Path, root: Path) -> None:
    """Physically remove the installed skill directory after safety checks.

    Raises RuntimeError when any check rejects the path; the caller maps
    that to exit 1 with the rejection reason. Returns silently (idempotent)
    when the directory is already absent. See inline comments for the
    rationale of each check.
    """
    # 1. Resolve. strict=False so we don't crash if dir already absent.
    original = installed
    if not original.is_absolute():
        original = root / original
    resolved = original.resolve(strict=False)

    # 2. Already absent -> trivially clean.
    if not resolved.exists():
        return

    # 3. Symlink / NTFS junction (pre-resolve check on `original`).
    if _is_reparse_point(original):
        raise RuntimeError(
            f"refusing to delete {original}: path is a symlink or junction "
            "(possible redirect to another location)"
        )

    # 4. Must be a directory.
    if not resolved.is_dir():
        raise RuntimeError(
            f"refusing to delete {resolved}: not a directory"
        )

    # 5. Anti-escape: resolved must be strictly inside root.
    #
    # Use normcase to handle case-insensitive filesystems (Windows, macOS
    # HFS+). pathlib's is_relative_to() compares case-sensitively on
    # POSIX even when the underlying FS is not, which can produce false
    # rejects.
    real_root = root.resolve()
    resolved_n = os.path.normcase(str(resolved))
    root_n = os.path.normcase(str(real_root))
    if not (resolved_n == root_n or resolved_n.startswith(root_n + os.sep)):
        raise RuntimeError(
            f"refusing to delete {resolved}: outside --root {real_root} "
            "(path traversal or symlink escape)"
        )

    # 5b. Explicit equality guard. Cheap defense-in-depth: catches the
    # `--installed-path .` / `--installed-path ""` bug class where the
    # caller passes an empty/dot path and the resolved value equals root.
    if resolved_n == root_n:
        raise RuntimeError(
            f"refusing to delete {resolved}: equals --root"
        )

    # 6. Must have a `skills` segment under root. Skill dirs always live
    # under `<agent>/skills/<name>` (e.g. .claude/skills/, .cursor/skills/).
    rel_parts = resolved.relative_to(real_root).parts
    if 'skills' not in rel_parts:
        raise RuntimeError(
            f"refusing to delete {resolved}: no 'skills' segment under "
            f"--root {real_root} (skill directories live under <agent>/skills/)"
        )

    # 7. Plausibility marker: SKILL.md must exist. Upstream skills format
    # requires SKILL.md at the root of every installed skill — its
    # absence almost certainly means the caller passed the wrong path
    # (parent, sibling, or unrelated dir). Hard block, not warning:
    # soft-warning + delete would be silently destructive.
    if not (resolved / 'SKILL.md').is_file():
        raise RuntimeError(
            f"refusing to delete {resolved}: no SKILL.md marker "
            "(upstream skill format requires it). Verify --installed-path "
            "points at the skill directory, not its parent or a sibling."
        )

    # 8. Delete. shutil.rmtree refuses top-level symlinks and uses
    # os.scandir internally (no symlink-following for children).
    shutil.rmtree(resolved, onerror=_chmod_retry)


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

    # Step 4: authoritative physical-directory removal.
    # When --installed-path is supplied, the helper itself removes the
    # directory after strict safety checks (see safe_remove_installed).
    # This is required because upstream `npx skills remove` does not
    # apply sanitizeName() to its --skill argument before matching, so
    # for logical names that differ from the sanitized on-disk basename
    # (e.g. "Convex Best Practices" vs convex-best-practices) upstream
    # is a silent no-op. With this step, the helper is the guarantor.
    if args.installed_path and not args.dry_run:
        installed = Path(args.installed_path)
        try:
            safe_remove_installed(installed, root)
        except RuntimeError as e:
            print(f"error: {e}", file=sys.stderr)
            return 1
        # Successful removal (or already-absent) means we no longer care
        # whether `npx skills remove` reported partial failure earlier:
        # the security goal — directory gone, lock cleared — is met.
        cli_failed = False
    elif args.installed_path and args.dry_run:
        # Surface the would-be action for transparency.
        installed = Path(args.installed_path)
        if not installed.is_absolute():
            installed = root / installed
        print(f"would safely remove installed directory: {installed}")

    # Partial-failure exit: lock cleared but `npx skills remove` failed
    # and we cannot independently confirm the files are gone.
    if cli_failed:
        return 1

    return 0


if __name__ == '__main__':
    sys.exit(main())
