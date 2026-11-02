# Replay-проверки `/aif-review +check`

```sh
npm run test:review-check
npm run test:review-check -- --report /tmp/review-check-report.json
```

Набор включён в `npm test`. Требуются установленные devDependencies, Node.js 18+ и Git. Авторизация Claude, Codex и GitHub не нужна.

Три файла `*.spec.yaml` теперь исполняются. Runner использует schema loader, подготовку временного Git sandbox и assertions из установленного `@cutcode/ai-tester`. `files_staged` действительно записываются и добавляются в индекс временного репозитория; записанный diff сверяется с полученным `git diff --cached`.

Далее runner вызывает тот же `check-workflow.mjs run` / `advanceReview`, который указан в skill: источник → внутренний Reviewer → один validator Task → разбор ответа → финальный gate. Reviewer означает шаг составления review основным агентом. В тесте и он, и validator получают фиксированные ответы; модель не запускается. Проверяется работа исполняемого workflow, а не способность модели следовать произвольному тексту skill.

`_replay/cases.json` содержит управляемые записи Git/PR, draft review, ответы validator, ожидаемые статусы и содержимое отчёта. Отказы, timeout и пустые ответы сохраняют исходные findings; частичный ответ обрабатывается по каждому item. Проверяются confidence markers, многострочный `Modified-text`, переносы severity, сохранение context gates, отсутствие pinned evidence, freshness и пустой список findings.

PR-запрос явно задаёт `working_directory`. Reviewer возвращает отдельный `project_context`: pinned excerpt либо пустую строку. Версия workflow 3 сохраняет каталог в обоих случаях и добавляет непустой excerpt без замены локальным описанием. Положительный replay-кейс проверяет точный блок контекста и его связь с `DESCRIPTION.md` на pinned head; отрицательные проверки сохраняют запрет локального контекста и отклоняют пропущенные/некорректные поля до source/validator-вызовов.

Host независимо получает config и description через `pr-source.mjs context` на pinned head до Reviewer; путь определяется pinned config. Непустой PR excerpt и запись Reviewer должны совпадать с этим независимым результатом: проверяются repository, path, commit, bytes, SHA-256, Git blob и совпадение текста. Необязательный `project_context_path` Reviewer сверяется с путём, независимо полученным host. Отсутствие config доказывается деревом Git, недоступный или неподдерживаемый config сохраняет неопределённость; недоступный файл записывается в `unavailable_context` при пустом excerpt. Missing/blank/duplicate `Reason` сохраняет исходный finding с WARN; проверяются все verdict и marked items.

Replay-ключ имеет вид `call_id:tool:sha256(canonical_args)`. `call_id` последовательно растёт в пределах сценария. Поэтому два идентичных `TaskStatus` с ответами `pending` и `success` имеют разные ключи. Ключи содержат весь набор аргументов, включая validator prompt; только абсолютный путь установленного `pr-source.mjs` заменяется стабильным `<references>`.

При отсутствии записи, несовпадении аргументов, дублирующемся ключе или неиспользованной записи прогон падает. Replay transport не имеет callback для живых инструментов и не импортирует SDK. Локальный Git используется только для подготовки и проверки fixtures. Исходный checkout не меняется.

JSON-отчёт содержит итоговый review, gate, полный trace вызовов, результаты assertions, SHA-256 skill/references, scenario и recordings, версии package, Node.js, `ai-tester`, workflow и хеши исполняемых runner-файлов. Путь отчёта печатается в конце прогона. `AIF_REVIEW_DEBUG=1` включает stderr-диагностику workflow.

## Опциональный coupling lens

`npm run test:coupling` выполняет offline-проверки синтетических producer/consumer,
реального parser/host protocol, prepare/finish, integrity и лимитов источников,
финального PR payload с обеими revisions, установки каждого skill отдельно и
обоих вместе для всех профилей, удаления flat workflow с сохранением данных и
фактического npm package inventory. Для Kilo plan находится в workflows, review —
в skills; тест использует эти реальные пути. Authoring fixtures не публикуются.

Replay содержит отдельные coupling-staged/coupling-pr cases. Поле `lenses` —
совместимое опциональное расширение workflow v3; новый reference и helper входят
в source receipts. При выключенном lens нет новых tool calls или lens fields.
Изменение SKILL/CHECK-MODE меняет хеш Reviewer instructions; validator/source
payload и остальные baseline traces сравниваются без ослабления hash contract.

`coupling_dependencies` проходит полную проверку до дополнительных source calls:
дубликаты объединяются по repository/commit/path, конфликт отклоняется; недоступное
остаётся unavailable. Границы: 16 identities, 1 MiB/file, 2 MiB UTF-8 total.
Host получает доступные записи независимо из pinned head/merge-base того же PR
repository и добавляет их после project-context merge. Неверные данные не дают
PASS, отсутствие внешнего consumer не превращается в доказанный дефект.

Матрица automatic-marker проверяет prepare/finish envelopes и routing-инструкции,
включая отсутствие разрешённого автоматического fallback. Выбор dispatch остаётся
процедурой родительского skill; тест не доказывает исполнение native runtime.
Статические проверки planner не исполняют LLM parser. Все проверки без inference;
качество обнаружения моделью и native UI acceptance остаются NOTRUN.

После осознанного изменения prompt или протокола можно пересоздать записи:

```sh
node scripts/capture-review-check.mjs --write
npm run test:review-check
```

Это отдельная команда обслуживания, которую тесты и CI никогда не вызывают. Она воспроизводит явно заданные ответы из capture-скрипта и сохраняет новые хеши запросов; ожидаемые результаты заданы отдельно и не вычисляются из output workflow. Перед принятием записей проверьте diff. Никакие записи из живой модели не создаются, её вариативность остаётся вне scope.
