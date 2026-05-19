---
name: wp-init
description: >-
  Interactively deploys a WordPress instance in the current directory for local development.
  Checks for WP-CLI (shows install instructions if missing), creates a MySQL database,
  downloads WordPress core, generates wp-config.php, and adds a .gitignore.
  Designed for MAMP PRO + DBngin environments where the server and database are already running.
  The final WordPress setup is completed via the browser wizard — no wp core install.
  Use when starting a new WordPress project locally from scratch.
argument-hint: "[locale]"
disable-model-invocation: true
allowed-tools: Bash(which *) Bash(wp *) Bash(mysql *) Bash(find *) Bash(git *) Bash(npm *) Read Write Edit
metadata:
  author: vyatka-it
  version: "1.0"
  category: wordpress
---

# WordPress Local Installer

Interactively sets up a WordPress instance in the current directory for local development.
Server and database must already be running (MAMP PRO + DBngin or equivalent).

---

## Step 1 — Check WP-CLI

```bash
which wp
```

**If WP-CLI is NOT found**, show this message and **STOP completely**:

```
WP-CLI не найден. Установи его:

  curl -O https://raw.githubusercontent.com/wp-cli/builds/gh-pages/phar/wp-cli.phar
  chmod +x wp-cli.phar
  sudo mv wp-cli.phar /usr/local/bin/wp

Проверь установку командой: wp --info

После установки запусти /wp-init снова.
```

If found — proceed to Step 2.

---

## Step 2 — Collect Configuration (Interactive)

First compute these values:
```bash
FOLDER=$(basename "$(pwd)")
DB_NAME_DEFAULT=$(echo "$FOLDER" | tr '[:upper:]' '[:lower:]' | tr '-' '_')
SITE_URL="http://${FOLDER}.local"
```

### 2a — Show defaults and ask for confirmation

Print:

```
⚙️ WordPress: Параметры установки

  База данных:  {DB_NAME_DEFAULT}
  Хост БД:      127.0.0.1:3306
  Пользователь: root
  Пароль:       (пустой)

  Локаль:       ru_RU

Подходит? [Y/n]
```

**If the user confirms** (Y / Enter / yes) — store all defaults:
- `DB_NAME = {DB_NAME_DEFAULT}`
- `USER = root`
- `PASS =` (пустой)
- `HOST = 127.0.0.1`
- `PORT = 3306`
- `LOCALE = ru_RU`

Then proceed to Step 3.

**If the user declines** (n / нет / anything else) — fall back to Step 2b.

### 2b — Interactive questions (fallback)

Ask the user the following questions **one by one**, waiting for each answer before asking the next.

| # | Question (ru) | Default |
|---|---------------|---------|
| 1 | Имя базы данных? | `{DB_NAME_DEFAULT}` |
| 2 | Пользователь БД? | `root` |
| 3 | Пароль БД? | (пустой) |
| 4 | Хост БД? | `127.0.0.1` |
| 5 | Порт БД? | `3306` |
| 6 | Локаль WordPress? | `ru_RU` |

Store all answers as variables for use in subsequent steps.

---

## Step 3 — Find mysql and Create Database

### 3a — Resolve mysql binary

First check if `mysql` is in PATH:
```bash
which mysql
```

If not found, search common local server locations:
```bash
find \
  /Applications/MAMP \
  /Applications/MAMP\ PRO \
  /Applications/OpenServer \
  ~/OpenServer \
  -name "mysql" -type f 2>/dev/null | head -1
```

Use the found path as `{MYSQL}`. If nothing is found anywhere, show this message and **STOP**:
```
mysql не найден. Убедись что MAMP / MAMP PRO / OpenServer запущен, или добавь mysql в PATH.
```

### 3b — Create Database

If `{PASS}` is empty:
```bash
{MYSQL} -h {HOST} -P {PORT} -u {USER} \
  -e "CREATE DATABASE IF NOT EXISTS \`{DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
```
If `{PASS}` is not empty:
```bash
{MYSQL} -h {HOST} -P {PORT} -u {USER} -p'{PASS}' \
  -e "CREATE DATABASE IF NOT EXISTS \`{DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
```

**If this command fails** (wrong credentials, server not running, etc.):
- Show the error output
- Print: `Не удалось создать базу данных. Проверь настройки и попробуй снова.`
- **STOP** — do not proceed to file download

---

## Step 4 — Download WordPress Core

```bash
wp core download --locale={LOCALE} --path=.
```

This downloads WordPress files into the current directory. Existing files (.ai-factory, .claude, etc.) are not affected — WP-CLI only creates WordPress-specific files.

---

## Step 5 — Create wp-config.php

```bash
wp config create \
  --dbname={DB_NAME} \
  --dbuser={USER} \
  --dbpass={PASS} \
  --dbhost={HOST}:{PORT} \
  --path=.
```

---

## Step 6 — Create or Update .gitignore

Read the template from `templates/wordpress.gitignore`.

Check if `.gitignore` already exists in the current directory:
- **Does NOT exist** — create it using the template content
- **Already exists** — append the template content to the existing file

---

## Step 7 — Clone Starter Theme

Check if git is available:
```bash
which git
```

**If git is NOT found**, print warning but do NOT stop:
```
⚠️ git не найден. Пропускаю установку стартовой темы.
```
Proceed to Step 8.

**If git is found**, clone the theme:
```bash
git clone git@github.com:vyatkait/wp-starter-theme.git wp-content/themes/wp-starter-theme
```

**If clone fails** (permission denied, no SSH key):
- Show the Git error output
- Print:
  ```
  ⚠️ Не удалось клонировать стартовую тему.

  Убедись, что твои SSH-ключи настроены и добавлены на GitHub.
  https://docs.github.com/en/authentication/connecting-to-github-with-ssh

  После настройки SSH запусти установку снова.
  WordPress развёрнут без стартовой темы.
  ```
- **Proceed to Step 8** (WordPress works without theme).

**If clone succeeds**, proceed to Step 8.

---

## Step 8 — Install Theme Dependencies

If the theme directory exists (`wp-content/themes/wp-starter-theme`):
  Check if `npm` is available:
  ```bash
  which npm
  ```
  **If npm is NOT found**, print warning and skip:
  ```
  ⚠️ npm не найден. Пропускаю установку зависимостей темы.
  ```
  Proceed to Step 9.

  **If npm is found**:
  ```bash
  cd wp-content/themes/wp-starter-theme && npm install
  ```
  Return to project root after installation completes.

If the theme directory does NOT exist — skip this step and proceed to Step 9.

---

## Step 9 — Activate Starter Theme

If the theme was cloned successfully (wp-content/themes/wp-starter-theme exists):
```bash
wp theme activate wp-starter-theme --path=.
```

---

## Step 10 — Show Summary

Print the following summary to the user:

```
✅ WordPress успешно развёрнут!

  База данных:  {DB_NAME}  (utf8mb4)
  Хост:         {HOST}:{PORT}
  Пользователь: {USER}

  Сайт: {SITE_URL}
  Тема:   wp-starter-theme (активна)

  Открой сайт в браузере и пройди мастер установки WordPress.
  Там потребуется указать название сайта, логин и пароль администратора.
```

**If the theme was NOT installed** (clone failed or git/npm missing), print:
```
✅ WordPress успешно развёрнут!

  База данных:  {DB_NAME}  (utf8mb4)
  Хост:         {HOST}:{PORT}
  Пользователь: {USER}

  Сайт: {SITE_URL}

  ⚠️ Стартовая тема не установлена.
  Для установки склонируй репозиторий вручную:
  git clone git@github.com:vyatkait/wp-starter-theme.git wp-content/themes/wp-starter-theme

  Открой сайт в браузере и пройди мастер установки WordPress.
  Там потребуется указать название сайта, логин и пароль администратора.
```
