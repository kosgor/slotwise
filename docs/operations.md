# Эксплуатация: окружения, мониторинг, бэкапы, откат миграций

Что нужно, чтобы продакшен можно было запустить, наблюдать и чинить. Часть пунктов требует деплоя —
они помечены **после деплоя**.

## Окружения

| Окружение  | Где                           | База Supabase                  | Stripe    | Inngest                      | Sentry `environment` |
| ---------- | ----------------------------- | ------------------------------ | --------- | ---------------------------- | -------------------- |
| local      | `npm run dev`                 | dev-проект (облако)            | test mode | Dev Server (`INNGEST_DEV=1`) | выключен (нет DSN)   |
| staging    | Vercel Preview (каждая ветка) | dev-проект (тот же, что local) | test mode | облако, branch env           | `staging`            |
| production | Vercel Production (`main`)    | `slotwise-prod`                | test mode | облако, production           | `production`         |

Решения для демо (2026-10-27): адрес — бесплатный `*.vercel.app`; staging — нынешний dev-проект
Supabase (на Free два активных проекта: dev и prod); Stripe и в продакшене в **test mode** — это
портфолио, посетители платят тестовой картой, активация бизнеса в Stripe не нужна.

Правила:

- **Ключи раздельные.** У каждого окружения свои `SUPABASE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`
  (отдельный endpoint на каждый адрес), `TOOL_APPROVAL_SECRET`. `STRIPE_SECRET_KEY` у всех один —
  тестовый ключ одного аккаунта. Stripe шлёт события всего аккаунта на все endpoint-ы, поэтому
  оплата со staging придёт и на прод-вебхук; там её отсекает метка базы `slotwise_db` в metadata
  (результат `foreign`, ответ 200) — ADR 0009, «Один аккаунт Stripe на все окружения».
  Продакшен-ключи — только в Vercel (Production scope), никогда в `.env.local`.
- **Письма без своего домена.** Resend отправляет с `onboarding@resend.dev` и только на email
  владельца аккаунта. В демо `EMAIL_DEV_TO` = твой email: все письма приходят тебе, настоящий
  получатель — в теме. Посетители писем не получают.
- **Миграции идут снизу вверх:** локально (PGlite-тесты) → staging (`supabase db push` на staging) →
  проверка → production. Прямых правок схемы в продакшене через Dashboard нет.
- `NEXT_PUBLIC_APP_ENV` (`development` / `staging` / `production`) подписывает события Sentry.
- **После деплоя:** создать проект `slotwise-prod`, привязать Vercel, завести переменные по
  [.env.example](../.env.example), включить облачный Inngest, указать вебхук Stripe на прод-домен,
  включить хук роли: он описан в `supabase/config.toml` (`[auth.hook.custom_access_token]`), так что
  `supabase config diff` → `supabase config push` на прод-проекте (dev включён 2026-10-28). Без него
  админ не уходит в `/admin` с других страниц (ADR 0007). После включения — выйти и войти заново:
  старый токен роли не содержит.

## Мониторинг и логи

- **Sentry** (`@sentry/nextjs`): клиент — `instrumentation-client.ts`, сервер и edge —
  `sentry.server.config.ts` / `sentry.edge.config.ts`, ошибки рендера, Route Handlers, Server Actions и
  `proxy.ts` — `onRequestError` в `instrumentation.ts`, падение корневого layout — `app/global-error.tsx`.
  Без `NEXT_PUBLIC_SENTRY_DSN` SDK выключен. Не отправляем: имена, email, cookies, тексты AI-чата
  (`dataCollection`). Session Replay не подключён: записывает экран и весит ~50 КБ.
  Source maps уходят в Sentry только при `SENTRY_AUTH_TOKEN` (CI).
- **Структурные логи** (`lib/log.ts`): одна JSON-строка на событие — `level`, `event`, `time` и id
  (`bookingId`, `eventId`, `conversationId`). Тексты сообщений, карты и ключи не логируются.
  `log.error` дополнительно отправляет исключение в Sentry с тегом `event`.

  ```json
  {
    "level": "error",
    "event": "booking.refund_failed",
    "time": "2026-10-25T10:00:00.000Z",
    "bookingId": "…",
    "error": "Stripe timeout"
  }
  ```

- **Расходы на AI** — `/admin/dashboard` (из `ai_usage`).
- **Фоновые задачи** — дашборд Inngest: упавшие запуски, повторы.

## Бэкап и восстановление

**Что есть на Free-тарифе Supabase:** ежедневные бэкапы, хранятся 7 дней, без восстановления на момент
времени (PITR) и без скачивания. Поэтому свой логический бэкап:

```bash
npm run db:backup   # backups/<время>/roles.sql, schema.sql, data.sql (папка в .gitignore)
```

Скрипт вызывает `supabase db dump --linked` трижды: роли, схема, данные (`COPY`). Нужен Docker —
CLI запускает `pg_dump` в контейнере. **На этой машине Docker нет, поэтому бэкап ещё не делался.**

Восстановление в **пустой** проект (staging или новый prod):

```bash
psql "$TARGET_DB_URL" -f backups/<время>/roles.sql
psql "$TARGET_DB_URL" -f backups/<время>/schema.sql
psql "$TARGET_DB_URL" -c "set session_replication_role = replica" -f backups/<время>/data.sql
```

`session_replication_role = replica` отключает триггеры на время загрузки: иначе
`on_auth_user_created` создал бы профили второй раз, а лимиты (`services_plan_limit`) мешали бы
вставке. Файлы Storage (`provider-documents`) в дамп не входят — их выгружать отдельно
(`supabase storage cp -r ss:///provider-documents ./backups/<время>/storage`).

### Своя копия вне Supabase (после деплоя)

Каждую ночь в 03:00 UTC [.github/workflows/backup.yml](../.github/workflows/backup.yml) делает дамп,
шифрует его и кладёт в Cloudflare R2. Шифрование — [age](https://age-encryption.org): у GitHub
только публичный ключ, им можно запереть архив, но не открыть. Приватный ключ — только у владельца,
вне репозитория и вне облака, где лежат копии.

Настройка, один раз:

1. **Ключ шифрования.** `age-keygen -o slotwise-backup.key` (Windows: `winget install FiloSottile.age`).
   Файл целиком — в менеджер паролей, с диска удалить. Строка `# public key: age1…` из него — в секрет
   `BACKUP_AGE_RECIPIENT`. Потерять приватный ключ = потерять все копии.
2. **Хранилище.** Cloudflare → R2 → бакет `slotwise-backups`. В его настройках — правило жизненного
   цикла: удалять объекты старше 30 дней. API-токен с правом _Object Read & Write_ только на этот
   бакет → секреты `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`.
3. **Доступ к базе.** Supabase → Connect → **Session pooler** (прямое подключение только по IPv6,
   у раннеров GitHub его нет) → строка с паролем базы → секрет `SUPABASE_DB_URL`. Спецсимволы в
   пароле — в percent-encoding.
4. **Первый запуск.** GitHub → Actions → Database backup → Run workflow. Проверить, что в R2 появился
   `db/<время>.tar.gz.age`, и сразу сделать тренажёр восстановления (ниже). Если ночной запуск
   упадёт, GitHub пришлёт письмо.

Открыть копию:

```bash
age -d -i slotwise-backup.key 2026-11-01T03-00-12.tar.gz.age | tar -xz   # → папка с тремя .sql
```

Дальше — те же три команды `psql`, что выше. Файлы Storage (`provider-documents`) робот пока не
копирует: специалист может загрузить документ заново, а в базе остаётся его список.

**Тренажёр «Восстановление» (после деплоя):** на staging сделать бэкап → `drop table public.reviews
cascade` → восстановить в новый проект → проверить число строк и вход демо-пользователей. Результат —
в [failure-drills.md](failure-drills.md).

## План отката миграции

Миграции только вперёд: файл в `supabase/migrations` после применения не правится. Откат — **новая**
миграция, поэтому каждую опасную миграцию пишем так, чтобы её можно было откатить без потери данных.

1. **Expand → backfill → contract.** Новая обязательная колонка: добавить nullable → заполнить →
   `set not null` отдельным шагом (лучше отдельным деплоем). Наивный `add column … not null` на
   таблице с данными падает — проверено в `tests/rls/migration-drill.test.ts`.
2. **Удаление — последним.** Колонку или таблицу удаляем через деплой после того, как код перестал её
   читать. До этого откат кода безопасен.
3. **Функции (`create or replace`)** откатываются новой миграцией с предыдущим телом функции — его
   берём из старого файла миграции. Пример: `review_provider()` из `20261025000000_admin_audit.sql`
   откатывается телом из `20261021000000_provider_review.sql`.
4. **Перед прод-миграцией:** бэкап (`npm run db:backup`), `supabase db push --dry-run` — убедиться,
   что уходят только ожидаемые файлы, прогон на staging.
5. **Если миграция упала посередине:** `supabase db push` применяет файл в транзакции — упавший файл
   не применён вовсе; исправить и выпустить новым файлом.
6. **Если ошибку нашли после применения:** откатить код (Vercel → Instant Rollback), затем
   корректирующая миграция. Данные, записанные новой версией, переносятся этой же миграцией.

| Миграция                          | Как откатить                                                                                                                                                    |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `20261023000000_ai_concierge.sql` | Новые таблицы — `drop table` (после выключения AI в коде); расширение `vector` можно оставить                                                                   |
| `20261025000000_admin_audit.sql`  | `review_provider()` — тело из `20261021…`; `audit_log` оставить (это история); колонки `reviews.hidden_reason`, `moderated_at` — nullable, код без них работает |
