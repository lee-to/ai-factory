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
allowed-tools: Bash(which *) Bash(wp *) Bash(mysql *) Bash(find *) Read Write Edit
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

Print this message first:
```
Настройка WordPress — нажимай Enter чтобы принять значение по умолчанию.
```

Then ask the user the following questions **one by one**, waiting for each answer before asking the next.

To get the default DB name: take the current directory name (`basename $(pwd)`), replace hyphens with underscores and convert to lowercase.

| # | Question (ru) | Default |
|---|---------------|---------|
| 1 | Локаль WordPress? | `ru_RU` |
| 2 | Имя базы данных? | `{folder_name}` |
| 3 | Пользователь БД? | `root` |
| 4 | Пароль БД? | `root` |
| 5 | Хост БД? | `127.0.0.1` |
| 6 | Порт БД? | `3306` |

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

```bash
{MYSQL} -h {HOST} -P {PORT} -u {USER} -p{PASS} \
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

Read the template from `~/.claude/skills/wp-init/templates/wordpress.gitignore`.

Check if `.gitignore` already exists in the current directory:
- **Does NOT exist** — create it using the template content
- **Already exists** — append the template content to the existing file

---

## Step 7 — Show Summary

Print the following summary to the user:

```
✅ WordPress успешно развёрнут!

  База данных:  {DB_NAME}  (utf8mb4)
  Хост:         {HOST}:{PORT}
  Пользователь: {USER}

  Открой сайт в браузере и пройди мастер установки WordPress.
  Там потребуется указать название сайта, логин и пароль администратора.
```
