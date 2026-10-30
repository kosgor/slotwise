# Деплой: прод на Vercel + Supabase

Порядок первого запуска продакшена. Окружения и правила — [operations.md](operations.md), Stripe и
Inngest подробно — [setup-stripe.md](setup-stripe.md).

Все команды запускает владелец репозитория. Ключи — только в `.env.prod` на своей машине и в
переменных Vercel, никогда в git и в чате.

## 1. Прод-база Supabase

1. Создать проект `slotwise-prod`, регион **London (eu-west-2)**. Сохранить пароль базы.
2. Скопировать `.env.example` в `.env.prod` и заполнить из нового проекта (Project Settings → API
   Keys): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`,
   `SUPABASE_SECRET_KEY`.
   - Имя важно: `.env.production.local` Next.js подхватил бы в локальной сборке, и e2e пошли бы в
     прод. `.env.prod` он не читает, а `.gitignore` его исключает.
3. Схема, каталог, демо-аккаунты:

   ```powershell
   npx supabase link --project-ref <prod-ref>
   npx supabase db push
   npm run db:seed:remote -- --env .env.prod
   npm run db:demo-users -- --env .env.prod
   npx supabase link --project-ref <dev-ref>   # сразу вернуть привязку к dev
   ```

   `db:seed:remote` сверяет привязку CLI с проектом из env-файла и останавливается, если они
   разные. `db:demo-users` пишет в проект из env-файла и печатает его до начала работы.

4. Dashboard прод-проекта → Authentication:
   - **Hooks** → Custom Access Token → включить, функция `public.custom_access_token_hook`. Без него
     админ не попадает в `/admin` с других страниц (ADR 0007).
   - **URL Configuration** → Site URL `https://<домен>`, Redirect URLs `https://<домен>/**`.
   - `supabase config push` не использовать: в `config.toml` адреса `localhost`, они затрут прод.

## 2. Vercel

1. Add New → Project → импорт `kosgor/slotwise`. Framework — Next.js (определится сам).
2. Settings → Functions → регион **London (lhr1)**, рядом с базой.
3. Settings → Environment Variables:

   | Переменная                                                                    | Production                                           | Preview (staging) |
   | ----------------------------------------------------------------------------- | ---------------------------------------------------- | ----------------- |
   | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`            | прод-проект                                          | dev-проект        |
   | `SUPABASE_SECRET_KEY`                                                         | прод-проект                                          | dev-проект        |
   | `NEXT_PUBLIC_SITE_URL`                                                        | `https://<домен>`                                    | адрес превью      |
   | `STRIPE_SECRET_KEY`                                                           | тестовый `sk_test_…`                                 | тот же            |
   | `STRIPE_WEBHOOK_SECRET`                                                       | из шага 3                                            | свой endpoint     |
   | `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY`                                    | из шага 4                                            | branch env        |
   | `RESEND_API_KEY`                                                              | ключ Resend                                          | тот же            |
   | `EMAIL_FROM`                                                                  | `Slotwise <onboarding@resend.dev>`                   | то же             |
   | `EMAIL_DEV_TO`                                                                | свой email (без домена Resend шлёт только владельцу) | то же             |
   | `GOOGLE_GENERATIVE_AI_API_KEY`                                                | ключ Gemini                                          | тот же            |
   | `TOOL_APPROVAL_SECRET`                                                        | новый: `openssl rand -base64 32`                     | свой              |
   | `NEXT_PUBLIC_APP_ENV`                                                         | `production`                                         | `staging`         |
   | `NEXT_PUBLIC_AUTH_GOOGLE_ENABLED`                                             | `false`                                              | `false`           |
   | `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` | по желанию                                           | по желанию        |

   `INNGEST_DEV` в Vercel не задавать.

4. Deploy. После первого деплоя вписать настоящий домен в `NEXT_PUBLIC_SITE_URL` и в Supabase
   (шаг 1.4) и сделать Redeploy.

## 3. Stripe (test mode)

1. Developers → Webhooks → Add endpoint: `https://<домен>/api/webhooks/stripe`.
2. События: `checkout.session.completed`, `checkout.session.async_payment_succeeded`,
   `checkout.session.expired`, `charge.refunded`, `customer.subscription.created`,
   `customer.subscription.updated`, `customer.subscription.deleted`,
   `customer.subscription.paused`, `customer.subscription.resumed`, `invoice.paid`,
   `invoice.payment_failed`.
3. Signing secret → `STRIPE_WEBHOOK_SECRET` в Vercel → Redeploy.

Цены Pro в GBP уже есть (`npm run stripe:setup`). Аккаунт Stripe один на все окружения: события
staging приходят и на прод-endpoint, их отсекает метка базы `slotwise_db` (ADR 0009).

## 4. Inngest

1. app.inngest.com → создать приложение → Sync → URL `https://<домен>/api/inngest`.
2. Event key и signing key → Vercel → Redeploy. В дашборде Inngest должны появиться функции.

## 5. Проверка

- [ ] Вход под `demo-client`, `demo-provider`, `demo-admin` (пароль — README).
- [ ] Бронь и оплата картой `4242 4242 4242 4242`: бронь подтверждена, письмо пришло на
      `EMAIL_DEV_TO`, в Inngest видны запуски.
- [ ] Отмена с возвратом: деньги вернулись, статус обновился.
- [ ] `/admin` и `/admin/dashboard` открываются у админа.
- [ ] В Stripe → Webhooks у endpoint-а нет ошибок доставки.
- [ ] Lighthouse на прод-адресе — в [performance.md](performance.md).
- [ ] По желанию: ночной бэкап в R2 — [operations.md](operations.md#своя-копия-вне-supabase-после-деплоя).
