# Fireboard

Приватная realtime-доска дедлайнов для двух человек с отдельным личным пространством. На desktop это тёмная неоновая DOM-доска с pan/zoom и перетаскиваемыми карточками; на мобильных устройствах — простой отсортированный список без drag-and-drop.

## Стек

- Vite, React, TypeScript
- Tailwind CSS
- Supabase Auth, Postgres, Realtime
- Zustand
- date-fns
- lucide-react

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

1. Создай проект Supabase.
2. В Authentication включи Email provider.
3. Создай двух пользователей вручную или пригласи их.
4. Открой SQL Editor.
5. Выполни `supabase/migrations/0001_initial_schema.sql`.
6. В Database -> Replication проверь, что Realtime включён для `public.cards`. Миграция также пытается добавить `public.cards` в `supabase_realtime`.

Если проект уже был создан до появления личных задач, выполни миграцию повторно: она добавит `board_scope` и обновит RLS policies.

## Деплой на Vercel

- Framework Preset: `Vite`.
- Build Command: `npm run build`.
- Output Directory: `dist`.
- Environment Variables:
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`

В проекте есть `vercel.json` с rewrite на `index.html`, чтобы React Router нормально открывал `/login` и другие routes при refresh.

## Уже реализовано

- Вход и выход через Supabase email/password.
- Защищённый route приложения с восстановлением сессии.
- Миграция таблицы `cards` с индексами, `updated_at` trigger, RLS policies и настройкой Realtime publication.
- CRUD карточек: создать, редактировать, отметить готово/в работу, удалить.
- Две области: командная доска `shared` и личная доска `personal`, где карточки видит только владелец.
- Desktop-доска от `1024px`: pan, zoom, draggable DOM-карточки, mini map, sidebar-фильтры.
- Mobile-список ниже `1024px`: сортировка по дедлайну, chips-фильтры, floating create button, без drag-and-drop.
- Динамическая deadline color utility с floating `daysLeft`, HSL-нагревом, urgency label, glow, progress и pulse только для горячих карточек.
- Один глобальный countdown timer через Zustand.
- Состояния загрузки, пустой доски, отсутствующего env, ошибки загрузки, ошибки сохранения и realtime status.

## Потом

- Multi-workspace модель, если продукт вырастет за пределы одной общей доски.
- Фирменный modal для опасных действий вместо `window.confirm`.
- Автотесты для deadline color/countdown utilities и поведения card store.

## Проверки

```bash
npm run typecheck
npm run lint
npm run build
```
