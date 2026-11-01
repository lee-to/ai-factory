# PHP Profile

Inspect composer.json/lock, PHP constraints/extensions, framework/version,
scripts, binary locations and existing tool configs. Distinguish declared PHP
constraints from the executable used on the host/container. Read PHP config files
as text during audit; requiring them or loading Composer plugins/autoload is execution.

## Recommendation Rules

- Preserve existing Pint, PHP CS Fixer, PHPCS, PHPStan, Psalm or other native checks.
  Prefer framework-compatible installed tools over adding overlapping ones.
- For a new project, propose syntax checking, one suitable style/formatter tool
  and static analysis. Explain PHP CS Fixer versus PHPCS based on the desired
  formatting/standard workflow; choose PHPStan or Psalm according to project
  annotations/framework extensions and compatibility, rather than installing both.
- Composer is the normal dependency/script interface when already used. Preserve
  its constraints, repositories, scripts and plugin policy; show dev dependency
  and lockfile changes before installation. Do not install Node just for hooks.
- Resolve analysis scope/level from existing policy or user choice. Strictness
  means selected rules fail on findings; it does not automatically mean maximum
  analysis level. Do not generate a baseline or blanket ignores to hide failures.

## Commands and Scope

Keep check/fix separate. Examples include a formatter dry run versus its fix
command, PHPCS versus PHPCBF, native `php -l` for selected files and project-wide
static analysis with the actual config. A single-file syntax check does not prove
style or type correctness across the project.

Do not append staged paths to a Composer script whose scope is project-wide.
Confirm a formatter's file/path handling still respects exclusions/config; explicit
paths can change discovery behavior. Staged filenames alone do not isolate unstaged
hunks. Use a verified staged-content runner or propose a clearly labelled full
component check at a suitable event.

Adapt [the PHP example](../../examples/php.md). Hook manager selection follows
[hooks](hooks.md): existing manager first; otherwise explain native/system or
polyglot choices and their installation requirements.

Sources: [PHPStan](https://phpstan.org/user-guide/getting-started),
[PHP CS Fixer usage](https://cs.symfony.com/doc/usage.html),
[PHPCS](https://github.com/PHPCSStandards/PHP_CodeSniffer),
[Psalm](https://psalm.dev/docs/).
