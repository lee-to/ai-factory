# Example: Composer PHP Component

Discovery: Composer project with existing tests, PHP CS Fixer and PHPStan. Keep
those versions/configs; propose missing script entrypoints and optional hooks.
Do not install an additional Node toolchain.

Merge missing scripts, preserving existing definitions:

```json
{
  "scripts": {
    "style:check": "php-cs-fixer fix --dry-run --diff",
    "style:fix": "php-cs-fixer fix",
    "analyse": "phpstan analyse --configuration=phpstan.neon"
  }
}
```

These assume compatible local Composer binaries and an existing selected config.
For a new application whose sources are src/, a starting phpstan.neon could be:

```neon
parameters:
    level: 6
    paths:
        - src
```

Level 6 is an example to discuss, not a mandatory preset. Choose the level and
framework extensions from actual requirements and current compatibility. Do not
create a baseline simply to make the first run pass.

For a selected new PHP CS Fixer configuration, adapt .php-cs-fixer.dist.php:

```php
<?php

return (new PhpCsFixer\Config())
    ->setRules(['@PSR12' => true])
    ->setFinder(PhpCsFixer\Finder::create()->in(__DIR__ . '/src'));
```

Read this file as text during audit; loading it is execution. Framework-native
formatters or PHPCS may be more appropriate for an existing project. For selected
single-file syntax checks, `php -l path/to/file.php` checks syntax only.

Run project analysis from this component's CWD, without staged filenames. If an
existing manager provides staged-content isolation, connect compatible style
checks there. Otherwise propose an explicitly full-component style/analysis check
on pre-push and CI; do not claim a bare filename list isolates unstaged hunks.
