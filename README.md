# Fireboard

Fireboard is a private realtime deadline board for small teams, projects, and personal tasks. On desktop it behaves like a cinematic neon canvas with pan, zoom, draggable cards, minimap, card links, project spaces, presence, and an activity log. On mobile it becomes a focused, sorted task list without drag-and-drop.

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
- Shared team board plus one private personal board per user.
- Team projects with custom names, colors, manual ordering, nearest-deadline summaries, realtime sync, and cascade deletion.
- Desktop canvas from `1024px`: pan, zoom, draggable DOM cards, minimap navigation, alignment snapping, card links, heat horizon, presence cursors, and sidebar filters.
- Mobile list below `1024px`: deadline sorting, filter chips, floating create button, and no drag-and-drop.
- Card CRUD: create, edit, mark done/reopen, delete, resize from content, and connect cards with visual arrows.
- Activity log for meaningful actions such as creating, completing, deleting, project changes, and link changes. Card movement is intentionally not logged.
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
6. Make sure Realtime is enabled for `public.cards`, `public.projects`, `public.card_links`, and `public.activity_events`. The migration also attempts to add these tables to `supabase_realtime`.

If the project existed before personal boards, projects, card links, or activity events were added, run the migration again. It is written to be idempotent and will add the missing columns, indexes, triggers, functions, RLS policies, and realtime publications.

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
npm run build
```

---

# Fireboard

Fireboard - приватная realtime-доска дедлайнов для маленькой команды, проектов и личных задач. На desktop это кинематографичный неоновый canvas с pan, zoom, перетаскиваемыми карточками, миникартой, связями между карточками, проектами, presence и журналом активности. На телефоне интерфейс превращается в сфокусированный отсортированный список без drag-and-drop.

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
- Общая командная доска и отдельная приватная личная доска для каждого пользователя.
- Командные проекты с названием, цветом, ручным порядком, ближайшим дедлайном, realtime-синхронизацией и удалением вместе с карточками.
- Desktop-доска от `1024px`: pan, zoom, draggable DOM-карточки, навигация по миникарте, snapping, стрелочные связи между карточками, heat horizon, курсоры участников и фильтры в sidebar.
- Mobile-список ниже `1024px`: сортировка по дедлайну, filter chips, floating-кнопка создания и без drag-and-drop.
- CRUD карточек: создать, редактировать, отметить готово/вернуть в работу, удалить, автоматически расширять под контент и связывать карточки визуальными стрелками.
- Журнал активности для значимых действий: создание, завершение, удаление, изменения проектов и связей. Перемещение карточек специально не логируется.
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
6. Проверь, что Realtime включён для `public.cards`, `public.projects`, `public.card_links` и `public.activity_events`. Миграция также сама пытается добавить эти таблицы в `supabase_realtime`.

Если проект был создан до появления личных досок, проектов, связей между карточками или журнала активности, выполни миграцию повторно. Она идемпотентная и добавит недостающие колонки, индексы, triggers, functions, RLS policies и realtime publications.

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
npm run build
```
