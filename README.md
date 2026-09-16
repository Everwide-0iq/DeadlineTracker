# Fireboard

Fireboard is a private realtime deadline board for small teams, projects, and personal tasks. On desktop it behaves like a cinematic neon canvas with zoom, draggable cards, board text layers, minimap, card links, project spaces, and presence. On mobile it becomes a focused, sorted task list without drag-and-drop.

## Stack

- Vite, React, TypeScript
- Tailwind CSS
- Supabase Auth, Postgres, Realtime
- Zustand
- date-fns
- lucide-react

## Features

- Supabase email/password sign in and sign out.
- Protected app route with session restore.
- Realtime user profiles with nickname, compressed avatar, personal active-card color, interface preferences, and password change.
- Shared team board plus one private personal board per user.
- Team projects with custom names, colors, manual ordering, nearest-deadline summaries, realtime sync, and cascade deletion.
- Desktop canvas from `1024px`: pan, zoom, draggable DOM cards and To-do blocks, desktop-only text layers, live minimap navigation, alignment snapping, universal visual links, heat horizon, presence cursors, and sidebar filters.
- Mobile list below `1024px`: deadline sorting, filter chips, a compact Add menu, full To-do interaction, and no canvas drag-and-drop.
- Card CRUD: create with an optional deadline, edit, mark done/reopen, transfer active ownership, bulk delete, resize from content, attach one compressed image/screenshot, and connect board objects with visual arrows.
- To-do blocks with an optional deadline, reorderable tasks, per-task title/description/compressed image, active ownership, completion attribution, progress, and a compact first-10-items view.
- Active work clearly shows the teammate's nickname and avatar; completed cards and To-do tasks store an exact server actor/timestamp and display it in each viewer's local time zone. Legacy completion dates remain explicitly unknown.
- Desktop context menu for creating a card, To-do block, or text layer exactly where you right-click the empty canvas.
- RU/ENG interface switcher on the login page, environment setup page, desktop app, and mobile app. User-created card/project text is not translated.
- Friendly loading, empty, error, missing-env, confirmation, sync, and offline states.

## Arcade

The desktop **Arcade** button starts a local game layer directly on the project board, without a separate window. It never writes task geometry or restores an old board over teammates' changes. Phaser loads only on launch. Card appearances come from the current board plus a bounded, RLS-protected request for other accessible shared cards (titles only, no images or descriptions).

- **Neon Snake:** collect cards with WASD/arrows; each pickup accelerates the game.
- **Deadline Blaster:** WASD/arrows move, mouse aims, hold click/Space to fire; chained kills increase the score multiplier.
- **Scope Creep:** survival waves with automatic fire, Shift dash, boss waves, and three upgrades after every 12 eliminations. Choose with 1/2/3 or click.
- **Sprint Runner:** card platforms, double jump (Space/W/up), checkpoints, hazards, and timed sprints. A/D/arrows move; the green portal starts the next sprint.

P pauses; Esc exits. Losing focus pauses automatically. Sound can be muted; Performance mode and reduced-motion preferences reduce particles and disable flashes/shake. Each mode has a separate leaderboard. Reapply the Arcade SQL section to enable the two new modes on an existing installation; earlier scores are preserved.

Desktop layout: drag the sidebar's right edge to resize its width, or the divider under projects to resize the project area. Arrow keys also work on focused dividers; double-click resets a divider. Preferences stay in the current browser. Project names wrap without truncation. Desktop editors can be resized from their bottom-right corner, within viewport bounds. Enlarged cards scale their entire content together while keeping resize handles independently usable. Current browsers supporting CSS `zoom` are recommended.

Team leaderboards show nicknames, avatars, personal placement, and the next score to beat. Apply the `Fireboard Arcade` section at the end of `supabase/migrations/0001_initial_schema.sql` (or rerun the complete migration). Rankings refresh on opening, changing games, submitting a completed run, or manual refresh, without polling during gameplay. Only finished runs are submitted. Personal bests remain local to this browser/account, including when the leaderboard is unavailable; local scores are not retroactively uploaded.

The database checks membership, run ownership/expiry, plausible score bounds, and duplicate submissions. It stores only one best score and one current run per member/game/team, not board content. Ties favor the earlier record. This is a **casual team leaderboard, not cheat-proof competition**: gameplay is client-side and is not replay-validated on the server. Do not attach prizes, payments, or permissions to scores.

Run `npm run test:arcade-sql` for isolated PostgreSQL security/idempotence checks via PGlite. This command never connects to Supabase.

## Local Development

```bash
npm install
cp .env.example .env
npm run dev
```

Fill `.env`:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

If the variables are missing, the app shows a setup screen instead of a blank error.

## Supabase Setup

1. Create a Supabase project.
2. Enable the Email provider in Authentication.
3. Create users manually in Authentication, or invite them.
4. Open SQL Editor.
5. Run `supabase/migrations/0001_initial_schema.sql`.
6. Make sure Realtime is enabled for `public.cards`, `public.todo_blocks`, `public.todo_items`, `public.projects`, `public.card_links`, `public.board_texts`, `public.profiles`, `public.teams`, `public.team_members`, and `public.project_members`. The migration also creates private `card-images`, `todo-images`, and `avatars` Storage buckets and attempts to add the relevant tables to `supabase_realtime`.

If the project already exists, run `0001_initial_schema.sql` again after pulling updates. The migration is idempotent and adds missing columns, indexes, constraints, atomic bulk-update functions, image-cleanup support, triggers, RLS policies, and realtime publications.

## Team Access

- The first existing account becomes the owner of the initial Fireboard team. Open **Team center** from the shared-board sidebar to invite people and manage their access.
- `Owner` and `Administrator` manage members and all projects. `Editor` can create projects. `Member` and `Viewer` only access Center plus projects explicitly assigned to them; viewers are read-only.
- Invitations are tied to one email, expire after 72 hours, and are invalidated on first use. The invited person must already have a Fireboard/Supabase account with that same email.
- Removing a member revokes access immediately but preserves their existing shared content.
- For private presence channels, keep Realtime Authorization enabled in Supabase and disable public Realtime access. The app already joins those channels with `private: true`.

## Owner Console

An optional console is available inside **Profile settings**, only to one explicitly configured account. Team owners/admins do not gain this privilege. It includes filtered audit events, user/project summaries, read-only personal/project board contents, pending-invitation revocation, page exports, and manual cleanup of up to 5,000 audit events older than 90 days.

After running the migration, copy your exact account UUID from **Supabase > Authentication > Users** and execute the following in **SQL Editor only**, replacing both placeholders:

```sql
select private.configure_owner_console('YOUR_ACCOUNT_UUID'::uuid, 'YOUR_NUMERIC_PIN');
```

Reload Fireboard, open profile settings, then **Owner console**. The PIN accepts 4-12 digits and is stored as a bcrypt hash. It is secondary protection, **not MFA**; choose an unpredictable PIN. Five failed attempts block PIN entry for 15 minutes. An unlock lasts 10 minutes and is bound to the authenticated Supabase session. Closing or hiding the console requests a server lock and clears local contents. Offline locking cannot be guaranteed; the server lease still expires. Re-run the configuration function to change the owner/PIN and invalidate all console unlocks. Never put a service-role key or the real PIN in frontend code.

Personal boards are hidden from teammates, **not from the configured service owner**. Inform users before enabling this access; profile settings display this policy. Board reads and administrative actions are audited. Images are downloaded on demand without a reusable signed URL in the console; already downloaded/exported data cannot be remotely revoked. Normal board RLS and team privileges remain unchanged.

Audit begins when this migration is applied; earlier events cannot be reconstructed. It records successful database changes and one app-session observation per authenticated session, not all authentication attempts or Vercel/Supabase server logs. Geometry-only changes, description/content snapshots, passwords, tokens, and invitation hashes are not retained. Actor IDs and short task titles are retained in the private audit table. Task-image bytes are metadata totals, **not total Supabase usage or billing**; check provider dashboards for actual quotas. Old events are not automatically deleted. Exports contain the current page (up to 50 records), not the entire database, and may contain personal data.

Run `npm run test:owner-sql` for isolated PostgreSQL authorization, PIN, expiry, audit and read-only checks. No production database is contacted.

## Vercel Deployment

- Framework Preset: `Vite`
- Build Command: `npm run build`
- Output Directory: `dist`
- Environment Variables:
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`

The project includes `vercel.json` with a rewrite to `index.html`, so React Router routes keep working after refresh.

## Checks

```bash
npm run typecheck
npm run lint
npm run test
npm run check
```

---

# Fireboard

Fireboard - приватная realtime-доска дедлайнов для маленькой команды, проектов и личных задач. На desktop это кинематографичный неоновый canvas с zoom, перетаскиваемыми карточками, текстовыми слоями, миникартой, связями между карточками, проектами и presence. На телефоне интерфейс превращается в сфокусированный отсортированный список без drag-and-drop.

## Стек

- Vite, React, TypeScript
- Tailwind CSS
- Supabase Auth, Postgres, Realtime
- Zustand
- date-fns
- lucide-react

## Возможности

- Вход и выход через Supabase email/password.
- Защищённый route приложения с восстановлением сессии.
- Realtime-профили с никнеймом, сжатым аватаром, личным цветом активных карточек, настройками интерфейса и сменой пароля.
- Общая командная доска и отдельная приватная личная доска для каждого пользователя.
- Командные проекты с названием, цветом, ручным порядком, ближайшим дедлайном, realtime-синхронизацией и удалением вместе с карточками.
- Desktop-доска от `1024px`: pan, zoom, draggable DOM-карточки и To-do блоки, desktop-only текстовые слои, живая миникарта, snapping, универсальные стрелочные связи, heat horizon, курсоры участников и фильтры в sidebar.
- Mobile-список ниже `1024px`: сортировка по дедлайну, filter chips, компактное меню «Добавить», полноценная работа с To-do и без canvas drag-and-drop.
- CRUD карточек: создать с дедлайном или без срока, редактировать, отметить готово/вернуть в работу, передать статус «Активно», массово удалить, автоматически расширять под контент, прикреплять одно сжатое изображение/скриншот и связывать объекты доски визуальными стрелками.
- To-do блоки с необязательным дедлайном, изменяемым порядком задач, названием/описанием/сжатым изображением у каждой задачи, активным исполнителем, автором завершения, прогрессом и компактным показом первых 10 пунктов.
- Активная работа выразительно показывает никнейм и аватар участника; завершённые карточки и задачи To-do получают точного автора и серверное время и показывают его в локальном часовом поясе зрителя. Для старых карточек дата честно помечается неизвестной.
- Контекстное меню desktop-доски для создания карточки, To-do блока или текста точно в месте клика по пустому canvas.
- Переключатель RU/ENG на странице входа, экране настройки env, desktop-приложении и mobile-приложении. Пользовательский текст карточек и проектов не переводится.
- Красивые состояния загрузки, пустой доски, ошибок, отсутствующего env, подтверждений, синхронизации и offline.

## Arcade

Кнопка **Arcade** запускает локальный игровой слой прямо на доске проекта, без отдельного окна. Игра не записывает геометрию задач и не восстанавливает старую доску поверх изменений коллег. Phaser загружается только при запуске. Образы карточек берутся с текущей доски и ограниченным запросом из других доступных общих проектов: только названия, без картинок и описаний, с проверкой RLS.

- **Neon Snake:** сбор карточек на WASD/стрелках с постепенным ускорением.
- **Deadline Blaster:** WASD/стрелки, прицел мышью, огонь зажатой ЛКМ/пробелом. Серии попаданий повышают множитель очков.
- **Scope Creep:** выживание с автоматическим огнём, рывком на Shift, волнами с боссами и выбором одного из трёх улучшений после каждых 12 устранений. Выбор кнопками 1/2/3 или мышью.
- **Sprint Runner:** карточки-платформы, двойной прыжок на пробел/W/вверх, контрольные точки, препятствия и ограничение времени. A/D/стрелки для движения; зелёный портал начинает следующий спринт.

P ставит паузу, Esc завершает игру. Потеря фокуса автоматически ставит паузу. Звук отключается; Performance mode и уменьшение движения сокращают частицы и отключают вспышки и тряску. У каждой игры свой рейтинг. Для двух новых режимов повторно примените секцию Arcade в SQL: прежние рекорды сохраняются.

На desktop можно тянуть правый край боковой панели и разделитель под проектами. Сфокусированные разделители поддерживают стрелки клавиатуры, двойной клик сбрасывает размер. Настройки сохраняются в текущем браузере. Названия проектов переносятся без обрезания. Окна редакторов растягиваются за правый нижний угол в пределах экрана. В больших карточках содержимое масштабируется целиком, а области захвата краёв остаются независимыми. Рекомендуется современный браузер с поддержкой CSS `zoom`.

Командный лидерборд показывает никнеймы, аватарки, место и ближайший рекорд для обгона. Примените блок `Fireboard Arcade` в конце `supabase/migrations/0001_initial_schema.sql` или повторите всю миграцию. Рейтинг обновляется при открытии, переключении игр, отправке завершённой партии и вручную, без опроса сервера во время игры. Отправляются только завершённые партии. Личные рекорды сохраняются отдельно для аккаунта в текущем браузере, в том числе без доступного лидерборда; задним числом они не загружаются.

База проверяет членство, владельца/срок игровой сессии, допустимые пределы результата и повторные отправки. Хранятся один лучший результат и одна текущая сессия на участника/игру/команду, без содержимого досок. При равных очках выше более ранний рекорд. Это **дружеский рейтинг, не полноценный античит**: игра работает на клиенте, сервер не перепроверяет запись партии. Не привязывайте к очкам призы, деньги или права доступа.

Команда `npm run test:arcade-sql` проверяет права доступа и повторное применение SQL в изолированном PostgreSQL через PGlite, без подключения к Supabase.

## Локальный запуск

```bash
npm install
cp .env.example .env
npm run dev
```

Заполни `.env`:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

Если переменные не заполнены, приложение покажет понятный экран настройки вместо пустой ошибки.

## Настройка Supabase

1. Создай Supabase project.
2. В Authentication включи Email provider.
3. Создай пользователей вручную в Authentication или пригласи их.
4. Открой SQL Editor.
5. Выполни `supabase/migrations/0001_initial_schema.sql`.
6. Проверь, что Realtime включён для `public.cards`, `public.todo_blocks`, `public.todo_items`, `public.projects`, `public.card_links`, `public.board_texts`, `public.profiles`, `public.teams`, `public.team_members` и `public.project_members`. Миграция также создаёт приватные Storage buckets `card-images`, `todo-images` и `avatars` и сама пытается добавить нужные таблицы в `supabase_realtime`.

Если проект уже был создан, после получения обновлений снова выполни `0001_initial_schema.sql`. Миграция идемпотентна и добавит недостающие колонки, индексы, ограничения, атомарные функции массового обновления, очистку изображений, triggers, RLS policies и realtime publications.

## Доступ к команде

- Первый существующий аккаунт становится владельцем начальной команды Fireboard. Открой «Центр команды» в sidebar общей доски, чтобы приглашать людей и настраивать их доступ.
- `Владелец` и `Администратор` управляют участниками и всеми проектами. `Редактор` может создавать проекты. `Участник` и `Наблюдатель` видят только Центр и явно выданные проекты; наблюдатель ничего не меняет.
- Ссылка приглашения привязана к одному email, действует 72 часа и перестаёт работать после первого использования. У приглашённого уже должен быть аккаунт Fireboard/Supabase с тем же email.
- Удаление участника сразу отзывает доступ, но его уже созданный общий контент остаётся на досках.
- Для приватных presence-каналов оставь Realtime Authorization включённой в Supabase и отключи public Realtime access. Приложение уже подключается к ним с `private: true`.

## Панель владельца

Необязательная панель находится в **настройках профиля** и доступна только одному явно назначенному аккаунту. Владельцы и администраторы команд этих прав не получают. В панели есть журнал с фильтрами, обзор пользователей и проектов, чтение личных и проектных досок, отзыв приглашений, экспорт текущей страницы и ручная очистка до 5000 событий старше 90 дней.

После выполнения миграции скопируй UUID своего аккаунта из **Supabase > Authentication > Users** и выполни **только в SQL Editor**, заменив оба значения:

```sql
select private.configure_owner_console('UUID_ТВОЕГО_АККАУНТА'::uuid, 'ТВОЙ_ЦИФРОВОЙ_PIN');
```

Перезагрузи Fireboard, открой настройки профиля и **Панель владельца**. PIN состоит из 4-12 цифр и хранится как bcrypt-хеш. Это дополнительная защита, **не MFA**; лучше использовать непредсказуемый PIN. Пять ошибок блокируют ввод на 15 минут. Разблокировка действует 10 минут и привязана к авторизованной сессии Supabase. Закрытие панели или скрытие вкладки очищает её содержимое и запрашивает серверную блокировку. Без сети немедленная блокировка не гарантируется, но серверный срок доступа всё равно истечёт. Повторное выполнение функции настройки меняет владельца/PIN и отзывает все разблокировки. Реальный PIN и service-role ключ нельзя добавлять в клиентский код.

Личные доски скрыты от участников команды, **но не от назначенного владельца сервиса**. Предупреди пользователей перед включением доступа; в настройках профиля есть соответствующее уведомление. Просмотры досок и административные действия записываются в журнал. Картинки загружаются по нажатию без многоразовых подписанных ссылок в панели; уже скачанные или экспортированные данные отозвать невозможно. Обычные RLS-политики досок и права команды не расширяются.

Журнал начинает работать после применения миграции: старые события восстановить нельзя. Он записывает успешные изменения БД и одно обнаружение сессии приложения, а не все попытки авторизации или серверные логи Vercel/Supabase. Перемещения и изменение размеров, копии описаний/текстов, пароли, токены и хеши приглашений не сохраняются. В приватной таблице журнала остаются ID участников и короткие заголовки задач. Объём картинок считается по метаданным задач: это **не полное использование Supabase и не расчёт тарифа**; реальные лимиты смотри в кабинетах провайдеров. Старые события автоматически не удаляются. Экспорт содержит текущую страницу (до 50 записей), а не всю БД, и может содержать личные данные.

`npm run test:owner-sql` проверяет права, PIN, срок сессии, аудит и запрет редактирования в изолированном PostgreSQL. Подключений к рабочей БД нет.

## Деплой на Vercel

- Framework Preset: `Vite`
- Build Command: `npm run build`
- Output Directory: `dist`
- Environment Variables:
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`

В проекте есть `vercel.json` с rewrite на `index.html`, чтобы React Router нормально открывал routes после refresh.

## Проверки

```bash
npm run typecheck
npm run lint
npm run test
npm run check
```
