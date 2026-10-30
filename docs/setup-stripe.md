# Настройка Stripe, Resend и Inngest локально

Всё в тестовом режиме: деньги не списываются, карты тестовые.

## 1. Stripe (5 минут)

1. Зарегистрируйся на [dashboard.stripe.com](https://dashboard.stripe.com). Активировать аккаунт
   (данные компании, банк) **не нужно** — тестовый режим работает сразу.
2. Убедись, что включён **Test mode** (переключатель вверху).
3. **Developers → API keys** → скопируй **Secret key** (`sk_test_…`) в `.env.local`:
   ```
   STRIPE_SECRET_KEY=sk_test_...
   ```
   Publishable key не нужен: оплата идёт на странице Stripe Checkout.
4. Создай тариф Pro и настройку Customer Portal одной командой:
   ```bash
   npm run stripe:setup
   ```

## 2. Stripe CLI — вебхуки на localhost

Stripe не может достучаться до `localhost`. CLI получает события и пересылает их тебе.

1. Установи: `winget install Stripe.StripeCli` (или скачай с
   [github.com/stripe/stripe-cli/releases](https://github.com/stripe/stripe-cli/releases)).
2. `stripe login` **не нужен**: `npm run stripe:listen` передаёт CLI ключ из `.env.local`
   (`scripts/stripe-listen.mts`). Если `stripe` не находится в новом терминале — путь к `stripe.exe`
   можно указать в переменной `STRIPE_CLI`.
3. В отдельном терминале:
   ```bash
   npm run stripe:listen            # пересылка на localhost:3000
   PORT=3100 npm run stripe:listen  # на продакшен-сборку e2e
   ```
   CLI напечатает `Your webhook signing secret is whsec_…` — скопируй в `.env.local`:
   ```
   STRIPE_WEBHOOK_SECRET=whsec_...
   ```
   Секрет постоянный для твоего CLI, его достаточно скопировать один раз. После изменения
   `.env.local` перезапусти `npm run dev`.

Пересылаются только события, которые обрабатывает приложение (список — в `scripts/stripe-listen.mts`;
CLI 1.5x без списка не запускается).

Полезно для тренажёра сбоев:

```bash
stripe events resend evt_...           # повторить событие (идемпотентность)
stripe trigger checkout.session.completed   # тестовое событие (не привязано к брони → ignored)
```

**Версия API аккаунта.** Старые аккаунты закреплены на старой версии API (у этого — 2019-02-19), и
события приходят в её формате. Приложению это не мешает: обработчик берёт из события только id и
перечитывает объект через SDK (ADR 0009).

## e2e с настоящим Stripe

Тесты, которые платят на настоящей странице Checkout и проверяют подписку с неудачным продлением
(test clock), включаются явно и идут против dev-сервера, на который смотрит `stripe:listen`:

```bash
npm run dev                       # терминал 1
npm run stripe:listen             # терминал 2
npm run jobs:dev                  # терминал 3 (письма и задачи)
E2E_PORT=3000 E2E_REAL_STRIPE=1 npx playwright test tests/e2e/accounts.spec.ts --project=desktop
```

Без `E2E_REAL_STRIPE` они пропускаются; остальные тесты оплаты работают с ключом и без `stripe listen`.

## 3. Inngest — фоновые задачи

Аккаунт не нужен. В отдельном терминале:

```bash
npm run jobs:dev
```

Интерфейс: http://localhost:8288 — видно каждый запуск, шаги, повторы, спящие напоминания.
В `.env.local` должно быть `INNGEST_DEV=1`.

## 4. Resend — письма (необязательно)

Без ключа письма пишутся в консоль `npm run dev`.

1. Зарегистрируйся на [resend.com](https://resend.com) → **API Keys** → Create → `re_…` в `.env.local`.
2. Без своего домена Resend отправляет только на email владельца аккаунта. Укажи его:
   ```
   RESEND_API_KEY=re_...
   EMAIL_DEV_TO=твой@email
   ```

## Итог: четыре терминала

```bash
npm run dev            # сайт, http://localhost:3000
npm run stripe:listen  # вебхуки Stripe
npm run jobs:dev       # фоновые задачи
npm run email:dev      # (по желанию) предпросмотр писем, http://localhost:3200
```

## Тестовые карты

| Карта                 | Результат                                                                  |
| --------------------- | -------------------------------------------------------------------------- |
| `4242 4242 4242 4242` | Успешная оплата                                                            |
| `4000 0000 0000 9995` | Отказ (недостаточно средств)                                               |
| `4000 0025 0000 3155` | Требует 3-D Secure                                                         |
| `4000 0000 0000 0341` | Карта привязывается, но списание падает — для проверки `past_due` подписки |

Срок — любая будущая дата, CVC — любые 3 цифры.
