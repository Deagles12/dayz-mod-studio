# Agent Skills для DayZ Mod Studio

Набір Agent Skills для керування **DayZ Mod Studio 2.3.x** з Codex, OpenCode, Claude Code, Hermes Agent або іншого хоста, сумісного з Agent Skills.

Це операційний шар, а не підручник із моддингу DayZ. Він навчає агента реальному контракту `dayz-backend.exe --cli`, межам GUI-only функцій, файлам стану та правилам безпеки. Кожна команда, прапорець, шлях і формат звірені з вихідним кодом 2.3.7 (коміт `556523f8`).

## Що всередині

| Skill | Для чого |
|---|---|
| `dayz-mod-studio` | Маршрутизатор, bootstrap, контракт CLI/JSONL, рівні успіху, погодження. Починати тут. |
| `dayz-mod-studio-environment` | Пошук застосунку/бекенду, DayZ Tools/сервера/клієнта, проєкту, стану й налаштувань. |
| `dayz-mod-studio-build` | Збірка PBO, підпис, пара ключів, маніфест, quick build, перевірка пакета. |
| `dayz-mod-studio-deploy` | Транзакційне локальне встановлення, запуск, цілі, checkpoint, відкат, безпечна зупинка. |
| `dayz-mod-studio-testing` | `update`/`test`, готовність CE/Hive/UDP, журнали, повтори, пастка автопублікації. |
| `dayz-mod-studio-debugging` | Діагностика за етапами, тріаж журналів, каталог помилок, мінімальне виправлення й повторна перевірка. |
| `dayz-mod-studio-remote` | SSH/SFTP-розгортання на Linux-сервер, перевірки, атомарна заміна, відкат, files-only. |
| `dayz-mod-studio-workshop` | Перевірка власника, перший предмет, оновлення, угода, видимість, невизначені результати. |
| `dayz-mod-studio-textures` | Конвертація PNG/JPG/TGA -> PAA і PAA -> PNG з обробкою часткових помилок. |
| `dayz-mod-studio-models` | GLB -> P3D візуальні LOD, PAA, перевірка/перегляд P3D, 3D-Generator. |
| `dayz-mod-studio-automation` | Обмежений наскрізний цикл, докази, правила зупинки, відкат, шаблон звіту. |

Кожен skill має `SKILL.md`; глибші матеріали — у `references/`, детерміновані помічники — у `scripts/`. Головний skill підвантажує лише потрібний вузький skill.

## Вимоги

- **Windows 10/11** для самого DayZ Mod Studio (застосунок лише для Windows).
- DayZ Mod Studio 2.3.x із `dayz-backend.exe` поруч із `dayz-mod-studio.exe`.
- DayZ Tools для збірки/підпису/текстур; DayZ Server і клієнт для локальних тестів; Blender для експорту GLB.
- **PowerShell 7+** для `install.ps1`, `update.ps1`, `uninstall.ps1`.
- **Bash + Python 3** для `install.sh`, `update.sh`, `uninstall.sh` на Linux-хостах агента.
- Хост, сумісний з Agent Skills. Набір не встановлює сам DayZ Studio.

Скрипти .sh можуть розкласти skills на Linux, але запустити DayZ-бекенд там неможливо.

## Встановлення у Windows

З папки `skills`:

~~~powershell
pwsh -NoProfile -File .\install.ps1 -Agents all
~~~

Це встановлює всі 11 skills для Codex, OpenCode, Claude Code і Hermes у user scope. Типовий режим — `auto`: junction, потім symlink, потім copy, якщо посилання недоступні.

Варіанти:

~~~powershell
# Лише потрібні агенти
pwsh -NoProfile -File .\install.ps1 -Agents codex,claude

# Project scope: skills належать цьому проєкту
pwsh -NoProfile -File .\install.ps1 -Agents all -Scope project -ProjectPath "D:\Mods\MyMod"

# Примусові копії (без посилань)
pwsh -NoProfile -File .\install.ps1 -Agents all -Mode copy

# Показати зміни без запису
pwsh -NoProfile -File .\install.ps1 -Agents all -DryRun
~~~

Якщо цільовий шлях уже існує і не належить цьому набору, встановлення зупиниться, не перезаписуючи його. Виберіть інший scope, приберіть конфлікт вручну або вкажіть інших агентів.

## Встановлення на Linux

Для хостів агента на Linux:

~~~bash
chmod +x install.sh update.sh uninstall.sh
./install.sh --agents all
~~~

Варіанти:

~~~bash
./install.sh --agents codex,claude
./install.sh --agents all --scope project --project /home/me/DayZ/MyMod
./install.sh --agents all --mode copy
./install.sh --agents all --dry-run
~~~

`install.sh` типово створює symlink і за потреби переходить на copy. Для маніфесту потрібен `python3`.

## Scope і цільові папки

| Агент | User scope | Project scope |
|---|---|---|
| Codex | `~/.agents/skills` | `<project>/.agents/skills` |
| OpenCode | `~/.config/opencode/skills` | `<project>/.opencode/skills` |
| Claude Code | `~/.claude/skills` | `<project>/.claude/skills` |
| Hermes Agent | `~/.hermes/skills/dayz-mod-studio` | `<project>/.hermes/skills/dayz-mod-studio` |

Примітки:

- Застарілий `~/.codex/skills` не використовується; актуальний Codex читає `~/.agents/skills`.
- Використовується рідний шлях OpenCode. Він може читати й інші корені, але набір на це не покладається.
- Hermes використовує категорію набору. Project-scoped skills Hermes потрібно схвалити командою `hermes skills trust` відповідно до вашої версії Hermes.
- Можна встановити вручну: скопіювати кожну папку `dayz-mod-studio*` із `SKILL.md` у потрібний корінь. Ручні копії не відстежуються деінсталятором.

## Посилання, копії та власність

- **Link mode** тримає одне джерело істини — папку набору. Оновлення набору видно одразу.
- **Copy mode** потрібен, якщо junction/symlink недоступні. Кожна копія містить `.dayz-mod-studio-skill` із назвою набору, skill, версією й джерелом.
- Інсталятор записує кожен шлях у маніфест:
  - Windows: `%LOCALAPPDATA%\DayZ Mod Studio Skills\install.json`
  - Linux: `$XDG_STATE_HOME/dayz-mod-studio-skills/install.json`, типово `~/.local/state/dayz-mod-studio-skills/install.json`
- Деінсталятор видаляє шлях лише за наявності запису в маніфесті та доказу власності (ціль посилання або маркер копії). Чужі skills не видаляються.
- Якщо перемістити набір, старі посилання вказуватимуть на старе місце. Запустіть `update` (або спершу деінсталяцію зі старого шляху), щоб перевірити власність і перестворити посилання.

## Перевірка

Windows:

~~~powershell
Get-ChildItem "$HOME\.agents\skills" -Directory | Select-Object Name
Get-ChildItem "$HOME\.claude\skills" -Directory | Select-Object Name
Get-Content "$env:LOCALAPPDATA\DayZ Mod Studio Skills\install.json"
~~~

Linux:

~~~bash
ls -la ~/.agents/skills
ls -la ~/.claude/skills
cat ~/.local/state/dayz-mod-studio-skills/install.json
~~~

Валідний skill має `SKILL.md` із YAML frontmatter `name` і `description`; `name` має збігатися з папкою.

Якщо хост не бачить skills, перезапустіть сесію агента, щоб він пересканував каталог.

## Використання

Просіть результат, наприклад:

- "Знайди мій DayZ Mod Studio і цей мод."
- "Збери й підпиши мод, потім запусти локальний тестовий сервер."
- "Сервер не досягає готовності — проаналізуй журнали."
- "Розгорни збірку 20261115-112233-aaaabbbb на мій Linux-сервер."
- "Сконвертуй ці текстури в PAA."
- "Перевір, чи цей предмет Workshop належить мені, перш ніж публікувати."

`dayz-mod-studio` обере один вузький skill. Пряма перевірка бекенду:

~~~powershell
& "C:\Path\To\dayz-backend.exe" --help
& "C:\Path\To\dayz-backend.exe" --project "D:\Mods\MyMod" --json status
~~~

Глобальні прапорці (`--project`, `--recent`, `--json`, `--verbose`) мають стояти **перед** командою. Надавайте перевагу `--json` і читайте всі JSONL-події разом із кодом виходу; не робіть висновок за останнім рядком.

## Оновлення

Windows:

~~~powershell
pwsh -NoProfile -File .\update.ps1 -Agents all
pwsh -NoProfile -File .\update.ps1 -Agents all -Scope project -ProjectPath "D:\Mods\MyMod"
~~~

Linux:

~~~bash
./update.sh --agents all
./update.sh --agents all --scope project --project /home/me/DayZ/MyMod
~~~

Оновлення запускає безпечний інсталятор із `--force`, зберігає записаний режим link/copy (якщо не передано `--mode`) і замінює лише власні шляхи.

## Видалення

Windows:

~~~powershell
pwsh -NoProfile -File .\uninstall.ps1
pwsh -NoProfile -File .\uninstall.ps1 -Agents codex -Scope project -ProjectPath "D:\Mods\MyMod"
pwsh -NoProfile -File .\uninstall.ps1 -DryRun
~~~

Linux:

~~~bash
./uninstall.sh
./uninstall.sh --agents codex --scope project --project /home/me/DayZ/MyMod
./uninstall.sh --dry-run
~~~

Типовий scope — усі записи маніфесту. `-ProjectPath` обмежує видалення встановленнями цього проєкту. Відмовлені шляхи лишаються в маніфесті, а скрипт повертає код 1.

## Чого набір не робить

- Не вигадує CLI для зупинки сервера, перегляду/валідації P3D, експорту GLB, перегляду збірок чи редагування GUI. У CLI 2.3.7 їх немає.
- Не публікує у Steam Workshop і не розгортає на продакшн-сервер без явного дозволу.
- Не друкує SSH-паролі, токени, приватні ключі чи Steam-дані.
- Не видаляє джерела мода й не перезаписує приватні ключі.
- Не називає сервер "готовим" лише за запуском процесу, а мод — "робочим" лише за успішною збіркою.
- Не стверджує, що локальна перевірка готовності доводить геймплей.

## Сумісність

| Область | Стан |
|---|---|
| DayZ Mod Studio | Аудит 2.3.7; контракт CLI 2.3.x |
| ОС для застосунку/бекенду | Windows 10/11 x64 |
| Хости агентів | Codex, OpenCode, Claude Code, Hermes Agent; інші — ручним копіюванням |
| Інсталятори | PowerShell 7+ у Windows; Bash + Python 3 на Linux |
| Експорт моделей/P3D-валідація | Лише GUI/внутрішні команди; CLI немає |
| Функціональна перевірка в грі | Вручну; набір її не автоматизує |

## Джерело й тести

- Upstream: <https://github.com/Deagles12/dayz-mod-studio>
- Аудитований коміт: `556523f88d17ad14f1377e27ba9f7c16f7fb058a`
- Детальний контракт команд/JSON: [dayz-mod-studio/references/cli-contract.md](dayz-mod-studio/references/cli-contract.md)
- Історія версій: [CHANGELOG.md](CHANGELOG.md)
- Тести й зафіксовані обмеження: [tests/README.md](tests/README.md)

Набір створено на основі аудиту коду та офлайн-тестів. Тести, що потребують реальних DayZ Tools, DayZ Server/клієнта, Steam, Blender або Linux SSH-хоста, позначені як невиконані, де цих компонентів не було; див. [tests/README.md](tests/README.md).
