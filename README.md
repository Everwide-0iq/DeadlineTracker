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
- Card CRUD: create, edit, mark done/reopen, transfer active ownership, bulk delete, resize from content, attach one compressed image/screenshot, and connect board objects with visual arrows.
- To-do blocks with an optional deadline, reorderable tasks, per-task title/description/compressed image, active ownership, completion attribution, progress, and a compact first-10-items view.
- Active work clearly shows the teammate's nickname and avatar; completed cards and To-do tasks store an exact server actor/timestamp and display it in each viewer's local time zone. Legacy completion dates remain explicitly unknown.
- Desktop context menu for creating a card, To-do block, or text layer exactly where you right-click the empty canvas.
- RU/ENG interface switcher on the login page, environment setup page, desktop app, and mobile app. User-created card/project text is not translated.
- Friendly loading, empty, error, missing-env, confirmation, sync, and offline states.

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
6. Make sure Realtime is enabled for `public.cards`, `public.todo_blocks`, `public.todo_items`, `public.projects`, `public.card_links`, `public.board_texts`, and `public.profiles`. The migration also creates private `card-images`, `todo-images`, and `avatars` Storage buckets and attempts to add the relevant tables to `supabase_realtime`.

If the project already existed, run the migration again after pulling updates. It is written to be idempotent and adds missing columns, indexes, constraints, atomic bulk-update functions, image-cleanup support, triggers, RLS policies, and realtime publications.

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
- CRUD карточек: создать, редактировать, отметить готово/вернуть в работу, передать статус «Активно», массово удалить, автоматически расширять под контент, прикреплять одно сжатое изображение/скриншот и связывать объекты доски визуальными стрелками.
- To-do блоки с необязательным дедлайном, изменяемым порядком задач, названием/описанием/сжатым изображением у каждой задачи, активным исполнителем, автором завершения, прогрессом и компактным показом первых 10 пунктов.
- Активная работа выразительно показывает никнейм и аватар участника; завершённые карточки и задачи To-do получают точного автора и серверное время и показывают его в локальном часовом поясе зрителя. Для старых карточек дата честно помечается неизвестной.
- Контекстное меню desktop-доски для создания карточки, To-do блока или текста точно в месте клика по пустому canvas.
- Переключатель RU/ENG на странице входа, экране настройки env, desktop-приложении и mobile-приложении. Пользовательский текст карточек и проектов не переводится.
- Красивые состояния загрузки, пустой доски, ошибок, отсутствующего env, подтверждений, синхронизации и offline.

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
6. Проверь, что Realtime включён для `public.cards`, `public.todo_blocks`, `public.todo_items`, `public.projects`, `public.card_links`, `public.board_texts` и `public.profiles`. Миграция также создаёт приватные Storage buckets `card-images`, `todo-images` и `avatars` и сама пытается добавить нужные таблицы в `supabase_realtime`.

Если проект уже был создан, после получения обновлений выполни миграцию повторно. Она идемпотентная и добавит недостающие колонки, индексы, ограничения, атомарные функции массового обновления, очистку изображений, triggers, RLS policies и realtime publications.

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
