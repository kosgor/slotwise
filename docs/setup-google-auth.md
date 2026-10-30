# Вход через Google: настройка

Код входа через Google готов (`signInWithGoogle` в `lib/auth/actions.ts`, обратный адрес
`/auth/callback`). Кнопка скрыта, пока не настроен OAuth-клиент: неработающая кнопка хуже, чем никакой.

## Шаги

1. **Google Cloud Console** → создать проект (или выбрать существующий) → APIs & Services →
   **OAuth consent screen**: тип External, название «Slotwise (dev)», свой email как контакт.
   Пока приложение в режиме Testing, войти смогут только добавленные тестовые пользователи — добавь себя.
2. APIs & Services → **Credentials** → Create credentials → **OAuth client ID** → Web application.
   - Authorized JavaScript origins: `http://localhost:3000`
   - Authorized redirect URIs: `https://irsxxnounoipcyiezgsb.supabase.co/auth/v1/callback`
     (адрес Supabase, не нашего сайта: Google возвращает пользователя в Supabase, а Supabase — к нам на
     `/auth/callback`).
3. Скопировать **Client ID** и **Client secret**.
4. **Supabase** → Authentication → Sign In / Providers → **Google** → включить, вставить Client ID и
   Client secret, сохранить. Секрет вводится только в панели Supabase — не в код и не в `.env`.
5. В `.env.local`: `NEXT_PUBLIC_AUTH_GOOGLE_ENABLED=true`, перезапустить `npm run dev`.
6. Проверить: `/login` → «Continue with Google» → выбрать аккаунт → вернуться в `/account`.

## Что происходит при входе

Кнопка → Server Action `signInWithGoogle` → Supabase возвращает адрес Google → пользователь
подтверждает → Google → Supabase (`/auth/v1/callback`) → наш `/auth/callback?code=…` → обмен кода на
сессию → редирект на `next`. При первом входе триггер `on_auth_user_created` создаёт профиль с ролью
`client` и именем из Google.
