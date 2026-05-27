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
  2. When --installed-path is provided: physically removes the directory
     via `safe_remove_installed()` after strict safety validation.
     This is the authoritative cleanup step — the helper is the
     guarantor of physical removal, not the upstream CLI.
  3. Patches <root>/skills-lock.json to drop the "skills.<skill>" key
     atomically (tmp + os.replace). No-op if the entry is absent.
  4. Verifies the patched lock file no longer contains the skill entry.

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
  This helper is project-scoped; global skill cleanup is out of scope.
  Pass the ACTUAL installed project-skill directory (the same path
  previously fed to security-scan.py). The path must be a direct child
  of a known agent skillsDir (for example
  `.<agent>/skills/convex-best-practices`). Do NOT synthesize the path
  from the logical skill name — upstream `skills` CLI sanitizes the
  on-disk directory name, so a synthesized path can miss the real
  blocked skill.
"""

import argparse
import json
import os
import re
import shutil
import stat
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path

_BUILTIN_AGENT_SKILLS_DIRS = (
    '.claude/skills',
    '.cursor/skills',
    '.codex/skills',
    '.agents/skills',
    '.github/skills',
    '.gemini/skills',
    '.junie/skills',
    '.qwen/skills',
    '.windsurf/skills',
    '.warp/skills',
    '.zencoder/skills',
    '.roo/skills',
    '.kilocode/skills',
    '.agent/skills',
    '.opencode/skills',
)


@dataclass(frozen=True)
class ValidatedInstalledPath:
    original: Path
    resolved: Path
    original_is_reparse: bool
    skills_root: Path


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


def _normalize_configured_skills_dir(value):
    """Return a normalized project-relative skillsDir or None.

    Runtime extensions may define additional agent skills roots in
    `.ai-factory.json`. Accept only safe dot-prefixed project-relative
    paths ending in `skills`, matching the installed-agent shape this
    helper is allowed to clean.
    """
    if not isinstance(value, str):
        return None
    raw = value.strip().replace('\\', '/')
    if raw.startswith('./'):
        raw = raw[2:]
    if not raw or raw.startswith('/') or re.match(r'^[A-Za-z]:($|/)', raw):
        return None
    parts = raw.split('/')
    if any(not part or part == '.' or part == '..' for part in parts):
        return None
    if not parts[0].startswith('.') or parts[-1].lower() != 'skills':
        return None
    return '/'.join(parts)


def _allowed_agent_skills_dirs(root: Path):
    """Known project agent skills roots, as root-relative path strings."""
    roots = set(_BUILTIN_AGENT_SKILLS_DIRS)
    config_path = root / '.ai-factory.json'
    try:
        data = json.loads(config_path.read_text(encoding='utf-8'))
    except (OSError, json.JSONDecodeError):
        return tuple(sorted(roots))

    agents = data.get('agents')
    if not isinstance(agents, list):
        return tuple(sorted(roots))

    for agent in agents:
        if not isinstance(agent, dict):
            continue
        normalized = _normalize_configured_skills_dir(agent.get('skillsDir'))
        if normalized:
            roots.add(normalized)
    return tuple(sorted(roots))


def _path_norm(value: Path) -> str:
    return os.path.normcase(str(value))


def _is_inside_path(path: Path, parent: Path) -> bool:
    path_n = _path_norm(path)
    parent_n = _path_norm(parent)
    return path_n == parent_n or path_n.startswith(parent_n + os.sep)


def _existing_path_prefixes(path: Path, root: Path):
    """Yield existing path prefixes from root to path without resolving."""
    try:
        rel_parts = path.relative_to(root).parts
    except ValueError:
        return

    current = root
    for part in rel_parts:
        current = current / part
        if current.exists() or current.is_symlink():
            yield current


def _matching_agent_skills_root(resolved: Path, root: Path):
    """Return the matching allowed skills root if resolved is its child."""
    resolved_parent_n = _path_norm(resolved.parent)
    for skills_dir in _allowed_agent_skills_dirs(root):
        skills_root = (root / Path(*skills_dir.split('/'))).resolve(strict=False)
        if resolved_parent_n == _path_norm(skills_root):
            return skills_root
    return None


def _sanitize_skill_name(name: str) -> str:
    """Port of upstream skills sanitizeName() used for install paths."""
    return re.sub(r'[^a-z0-9._]+', '-', name.lower()).strip('.-')


def _read_skill_frontmatter_name(skill_md: Path):
    """Best-effort parser for a simple `name:` key in YAML frontmatter."""
    try:
        lines = skill_md.read_text(encoding='utf-8').splitlines()
    except OSError:
        return None
    if not lines or lines[0].strip() != '---':
        return None

    for line in lines[1:]:
        stripped = line.strip()
        if stripped == '---':
            return None
        if not stripped or stripped.startswith('#') or ':' not in stripped:
            continue
        key, value = stripped.split(':', 1)
        if key.strip() != 'name':
            continue
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in ('"', "'"):
            value = value[1:-1]
        return value
    return None


def validate_installed_skill_path(installed: Path, root: Path, skill: str) -> ValidatedInstalledPath:
    """Resolve and validate an installed project skill directory path.

    Raises RuntimeError when any check rejects the path; the caller maps
    that to exit 1 with the rejection reason. The path may already be
    absent for idempotent retries, but it still must point to a plausible
    installed-agent skill child and match the requested skill identity.
    A symlink/junction at the installed path itself is allowed only for
    managed project installs whose canonical target is another known
    project agent skills root.
    """
    original = installed
    if not original.is_absolute():
        original = root / original
    real_root = root.resolve()
    resolved = original.resolve(strict=False)
    original_n = _path_norm(original)

    # Reject parent redirects before resolve() can hide them. The final
    # installed path may itself be a managed symlink/junction; that case
    # is validated below against the same project-root and skills-root
    # boundaries as a normal installed directory.
    for prefix in _existing_path_prefixes(original, real_root):
        if _path_norm(prefix) == original_n:
            continue
        if _is_reparse_point(prefix):
            raise RuntimeError(
                f"refusing to delete {prefix}: path is a symlink or junction "
                "(possible redirect to another location)"
            )
    original_is_reparse = _is_reparse_point(original)

    # Anti-escape: resolved must be strictly inside root.
    #
    # Use normcase to handle case-insensitive filesystems (Windows, macOS
    # HFS+). pathlib's is_relative_to() compares case-sensitively on
    # POSIX even when the underlying FS is not, which can produce false
    # rejects.
    resolved_n = _path_norm(resolved)
    root_n = _path_norm(real_root)
    if not _is_inside_path(resolved, real_root):
        raise RuntimeError(
            f"refusing to delete {resolved}: outside --root {real_root} "
            "(path traversal or symlink escape)"
        )

    # Explicit equality guard. Cheap defense-in-depth: catches the
    # `--installed-path .` / `--installed-path ""` bug class where the
    # caller passes an empty/dot path and the resolved value equals root.
    if resolved_n == root_n:
        raise RuntimeError(
            f"refusing to delete {resolved}: equals --root"
        )

    if resolved.exists() and not resolved.is_dir():
        raise RuntimeError(
            f"refusing to delete {resolved}: not a directory"
        )

    if original_is_reparse and _matching_agent_skills_root(original, real_root) is None:
        raise RuntimeError(
            f"refusing to delete {original}: symlink or junction is not a "
            "direct child of a known project agent skills directory"
        )

    skills_root = _matching_agent_skills_root(resolved, real_root)
    if skills_root is None:
        raise RuntimeError(
            f"refusing to delete {resolved}: not a direct child of a known "
            "project agent skills directory"
        )

    sanitized = _sanitize_skill_name(skill)
    if resolved.name.lower() != sanitized:
        frontmatter_name = None
        if resolved.exists():
            frontmatter_name = _read_skill_frontmatter_name(resolved / 'SKILL.md')
        if not frontmatter_name or frontmatter_name.strip().lower() != skill.strip().lower():
            raise RuntimeError(
                f"refusing to delete {resolved}: identity mismatch "
                f"(--skill {skill!r} does not match installed directory "
                f"basename {resolved.name!r} or SKILL.md name)"
            )

    # Plausibility marker: SKILL.md must exist. Upstream skills format
    # requires SKILL.md at the root of every installed skill — its
    # absence almost certainly means the caller passed the wrong path
    # (parent, sibling, or unrelated dir). Hard block, not warning:
    # soft-warning + delete would be silently destructive.
    if resolved.exists() and not (resolved / 'SKILL.md').is_file():
        raise RuntimeError(
            f"refusing to delete {resolved}: no SKILL.md marker "
            "(upstream skill format requires it). Verify --installed-path "
            "points at the skill directory, not its parent or a sibling."
        )

    return ValidatedInstalledPath(
        original=original,
        resolved=resolved,
        original_is_reparse=original_is_reparse,
        skills_root=skills_root,
    )


def _remove_reparse_point(path: Path) -> None:
    """Remove a symlink or Windows junction without following it."""
    if not _is_reparse_point(path):
        return
    try:
        path.unlink()
        return
    except OSError as unlink_error:
        try:
            path.rmdir()
            return
        except OSError as rmdir_error:
            raise RuntimeError(
                f"failed to remove symlink or junction {path}: {rmdir_error}"
            ) from unlink_error


def safe_remove_installed(validated: ValidatedInstalledPath) -> None:
    """Physically remove the installed skill directory after validation."""
    resolved = validated.resolved
    if not resolved.exists():
        pass
    elif not resolved.is_dir():
        raise RuntimeError(
            f"refusing to delete {resolved}: not a directory"
        )
    else:
        try:
            shutil.rmtree(resolved, onerror=_chmod_retry)
        except OSError as e:
            raise RuntimeError(f"failed to remove {resolved}: {e}") from e

    if validated.original_is_reparse:
        _remove_reparse_point(validated.original)
        if validated.original.exists() or validated.original.is_symlink():
            raise RuntimeError(
                f"failed to remove symlink or junction {validated.original}: "
                "path still exists"
            )

    if resolved.exists():
        raise RuntimeError(f"failed to remove {resolved}: path still exists")


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

    installed = Path(args.installed_path) if args.installed_path else None
    validated_installed = None
    if installed is not None:
        try:
            validated_installed = validate_installed_skill_path(installed, root, skill)
        except RuntimeError as e:
            print(f"error: {e}", file=sys.stderr)
            return 1

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
        # Non-zero from npx is NOT immediately fatal: the bounded helper
        # cleanup and lock patch below are the security-critical steps.
        # We still continue, then exit 1 at the end if no installed path
        # was supplied to independently confirm physical cleanup.
        print(f"warning: `npx skills remove` returned exit {rc}; "
              "continuing to bounded cleanup and lock-file patch "
              "(file deletion uncertain)",
              file=sys.stderr)
        cli_failed = True

    # Step 2: authoritative physical-directory removal.
    # When --installed-path is supplied, the helper itself removes the
    # directory after strict safety checks (see safe_remove_installed).
    # This is required because upstream `npx skills remove` does not
    # apply sanitizeName() to its --skill argument before matching, so
    # for logical names that differ from the sanitized on-disk basename
    # (e.g. "Convex Best Practices" vs convex-best-practices) upstream
    # is a silent no-op. With this step, the helper is the guarantor.
    if validated_installed is not None and not args.dry_run:
        try:
            safe_remove_installed(validated_installed)
        except RuntimeError as e:
            print(f"error: {e}", file=sys.stderr)
            return 1
        # Successful removal (or already-absent) means we no longer care
        # whether `npx skills remove` reported partial failure earlier:
        # the directory is gone and the lock patch below can finish cleanup.
        cli_failed = False
    elif validated_installed is not None and args.dry_run:
        # Surface the would-be action for transparency.
        print(f"would safely remove installed directory: {validated_installed.resolved}")
        if validated_installed.original_is_reparse:
            print(f"would remove managed symlink or junction: {validated_installed.original}")

    # Step 3: patch lock file (workaround for skills#977). For calls
    # with --installed-path, this intentionally happens after physical
    # cleanup so a failed deletion cannot leave a stale blocked skill
    # installed with its lock entry already cleared.
    try:
        _, msg = patch_lock(lock_path, skill, dry_run=args.dry_run)
    except RuntimeError as e:
        print(f"error: {e}", file=sys.stderr)
        return 1
    print(msg)

    # Step 4: verify by re-reading the lock file.
    if not args.dry_run and not verify_lock_clean(lock_path, skill):
        print(f"error: '{skill}' is still present in {lock_path} after patch",
              file=sys.stderr)
        return 1

    # Partial-failure exit: lock cleared but `npx skills remove` failed
    # and we cannot independently confirm the files are gone.
    if cli_failed:
        return 1

    return 0


if __name__ == '__main__':
    sys.exit(main())
