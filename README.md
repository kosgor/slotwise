# Slotwise

Платформа бронирования для независимых специалистов: репетиторов, тренеров, коучей, массажистов.
Пет-проект для портфолио. План: [docs/PLAN.md](docs/PLAN.md). Решения: [docs/decisions/](docs/decisions/).
Шпаргалка: [docs/cheatsheet.md](docs/cheatsheet.md). Все файлы этапа 1: [docs/stage-1-files.md](docs/stage-1-files.md).
Тренажёр сбоев: [docs/failure-drills.md](docs/failure-drills.md). Stripe, Inngest, Resend: [docs/setup-stripe.md](docs/setup-stripe.md).

> Статус: этапы 4–5 (AI-консьерж, админка, продакшен-качество). Работает локально с облачной dev-базой Supabase, Stripe в тестовом режиме и Gemini (бесплатный тариф); деплой — позже.
>
> Деплой по шагам: [docs/deploy.md](docs/deploy.md). Эксплуатация (окружения, Sentry, логи, бэкап, откат миграций): [docs/operations.md](docs/operations.md). Доступность: [docs/accessibility.md](docs/accessibility.md).

## Что есть

- **Каталог и профили** — `/pros`, `/pros/[slug]`; данные из Supabase, кэш Next.js.
- **Запись и оплата** — `/pros/[slug]/book`: услуга → день → время в поясе посетителя → оплата в
  Stripe Checkout. Слот удерживается 15 минут (можно продлить); бронь подтверждает вебхук Stripe.
  Без входа — переход на вход и возврат к выбранному времени.
- **Вход** — email и пароль, подтверждение email, сброс пароля; Google — после настройки
  ([docs/setup-google-auth.md](docs/setup-google-auth.md)).
- **Кабинет клиента** — `/account`: предстоящие, прошедшие, отменённые; отмена с полным возвратом
  за 24 часа. Статус оплаты — `/account/bookings/[id]`.
- **Письма** — подтверждение, новая запись (специалисту), напоминание за 24 часа, отмена, возврат;
  фоновые задачи Inngest.
- **Кабинет специалиста** — `/dashboard`: записи (список и неделя), расписание и выходные, услуги, профиль,
  подписка Free/Pro (`/dashboard/billing`, Customer Portal, лимит 3 услуги на Free).
  Заявка «стать специалистом» — `/account/become-provider`.
- **AI-консьерж** — на странице специалиста и в `/account/assistant`: ищет специалистов, показывает
  свободное время, готовит запись (подтверждает человек кнопкой) и отменяет её после одобрения в чате;
  на вопросы о правилах специалиста отвечает по его документам со ссылкой на источник или говорит «не
  знаю». Стриминг, «Стоп», «Повторить», история в базе, лимиты (Free 30 / Pro 150 запросов в сутки).
- **Документы специалиста** — `/dashboard/documents`: `.txt`/`.md` → чанки → embeddings (pgvector).
  Ещё для специалиста: черновик профиля и недельная сводка (structured output).
- **Админка** — `/admin`: заявки специалистов — одобрить или отклонить с причиной, приостановить и
  вернуть профиль; `/admin/dashboard` — записи, выручка, подписки, расходы на AI; `/admin/reviews` —
  скрыть или вернуть отзыв; `/admin/audit` — журнал всех решений.
- **Дизайн-система** [`/design-system`](http://localhost:3000/design-system) — витрина для ревьюеров:
  не в навигации и закрыта от индексации.

## Демо-аккаунты (dev-проект)

| Роль                        | Email                       | Пароль             |
| --------------------------- | --------------------------- | ------------------ |
| Клиент                      | `demo-client@example.com`   | `SlotwiseDemo2026` |
| Специалист (Anna Whitfield) | `demo-provider@example.com` | `SlotwiseDemo2026` |
| Админ                       | `demo-admin@example.com`    | `SlotwiseDemo2026` |

Создаются скриптом `npm run db:demo-users` (Admin API, email сразу подтверждён, письма не отправляются).

## Запуск локально

```bash
npm install
cp .env.example .env.local   # Supabase URL, publishable key, secret key (только для скриптов и тестов)
npm run dev                  # http://localhost:3000
```

Оплата и письма (подробно — [docs/setup-stripe.md](docs/setup-stripe.md)), каждое в своём терминале:

```bash
npm run stripe:setup    # один раз: тариф Pro и Customer Portal в Stripe (test mode)
npm run stripe:listen   # вебхуки Stripe → localhost; печатает STRIPE_WEBHOOK_SECRET
npm run jobs:dev        # Inngest Dev Server, http://localhost:8288
npm run email:dev       # предпросмотр писем, http://localhost:3200
```

Тестовая карта: `4242 4242 4242 4242`, любая будущая дата, любой CVC.

AI-консьерж: ключ Gemini (aistudio.google.com) в `GOOGLE_GENERATIVE_AI_API_KEY`, секрет подписи
одобрений — `TOOL_APPROVAL_SECRET` (`openssl rand -base64 32`). Обработка документов идёт через
`npm run jobs:dev`. Ручная проверка качества ответов (нужен запущенный `npm run dev`):

```bash
npm run evals                       # все вопросы из evals/questions.json; аккаунт создаётся на прогон и удаляется
npm run evals -- rag-unknown-parking  # один вопрос
```

Первая настройка базы (один раз, нужен `npx supabase login`):

```bash
npx supabase link --project-ref <ref>
npx supabase db push --include-seed   # миграции и демо-каталог
npm run db:seed:remote                # применить seed повторно (проверяет, что CLI привязан к проекту из .env.local)
npm run db:demo-users                 # демо-аккаунты трёх ролей
```

## Проверки

```bash
npm run typecheck          # типы TypeScript
npm run lint               # ESLint
npm run format:check       # Prettier
npm test                   # Vitest: логика, токены, JSON-LD, вебхуки Stripe + RLS и SQL-функции в PGlite
npm run test:integration   # настоящий Supabase: одновременные брони, чужие данные (нужен secret key)
npm run test:e2e           # сборка + Playwright: сценарии, axe (WCAG 2.2 AA), без JS, 320px, аккаунты
npm run db:seed            # перегенерировать supabase/seed.sql из seed-data.ts
npm run db:types           # перегенерировать типы базы
npm run security:bundle    # после build: нет ли секретов в файлах для браузера
npm run db:backup          # дамп ролей, схемы и данных (нужен Docker)
```

Перед первым `test:e2e`: `npx playwright install chromium`. Тесты с аккаунтами без
`SUPABASE_SECRET_KEY` пропускаются.

## Ключевые решения

- [Next.js + Supabase без отдельного бэкенда](docs/decisions/0001-nextjs-supabase-no-separate-backend.md)
- [Cache Components: что получаем и чем платим](docs/decisions/0004-cache-components-tradeoffs.md)
- [Анимации: CSS для прокрутки, Framer Motion для состояния](docs/decisions/0005-animations-css-first.md)
- [Бронирование только через функции базы, доступ двумя слоями](docs/decisions/0006-writes-through-database-functions.md)
- [Авторизация: сессия в cookies, роли в базе](docs/decisions/0007-auth-and-sessions.md)
- [Часовые пояса](docs/decisions/0008-time-zones.md)
- [Оплата: удержание слота, вебхуки Stripe, ровно один эффект](docs/decisions/0009-payments-and-webhooks.md)
- [Фоновые задачи и письма](docs/decisions/0010-background-jobs-and-emails.md)
- [AI-консьерж: права, подтверждения, RAG и лимиты](docs/decisions/0011-ai-concierge.md)
- [Админка, журнал действий и наблюдаемость](docs/decisions/0012-admin-audit-observability.md)
- [Сервис для Великобритании: фунты, en-GB, британский каталог](docs/decisions/0013-uk-market.md)
- [Перенос брони на другое время](docs/decisions/0014-reschedule.md)

## Как я использовал AI и как проверял

Код писался вместе с AI-ассистентом. Правила работы — в [.cursor/rules/project.mdc](.cursor/rules/project.mdc):
сначала план, маленькие изменения, никаких выдуманных API (документация библиотек читается из
`node_modules`), всё про права, платежи и миграции — построчно.

Проверка не на доверии:

- **Тест должен падать при поломке.** Для ключевых тестов код ломался намеренно (снятие проверки
  `stripe_events`, автоодобрение отмены в чате, приём «ответа ассистента» из браузера, порог rate limit
  6 → 60, подложенный ключ в бандле) — тесты падали.
- **Права проверяются в базе**, тесты RLS гоняют настоящие миграции в PGlite.
- **Ошибки AI, которые поймал, записаны** в [docs/ai-catches.md](docs/ai-catches.md).
- **Тренажёр сбоев** с фактическими результатами — [docs/failure-drills.md](docs/failure-drills.md).
