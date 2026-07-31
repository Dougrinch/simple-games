# Бесплатные push-уведомления через Cloudflare Worker

Минимальная версия без Cloud Functions, Blaze, service account, D1 и
дедупликации.

Используются только:

- существующие Firebase Authentication и Realtime Database на Spark;
- один Cloudflare Worker на бесплатном тарифе;
- стандартный Web Push;
- Service Worker в браузере.

## Статус реализации

Клиент, PWA-файлы и Worker уже находятся в репозитории:

```text
src/features/push/PushNotificationsControl.tsx
src/platform/push/pushClient.ts
public/manifest.webmanifest
public/sw.js
push-worker/
```

Автоматические проверки:

```bash
npm run shared:push:check
npm run production:push:types:check
npm run test:worker
```

Production VAPID public key хранится в `push-worker/wrangler.jsonc`, а private
key — только в Cloudflare Secret `VAPID_PRIVATE_KEY`. После изменения
конфигурации Worker нужно повторно опубликовать по разделу 12.

## 1. Схема

```text
Игрок A успешно записывает ход в Firebase
  ↓
приложение вызывает Cloudflare Worker с Firebase ID token
  ↓
Worker проверяет, что запрос сделал один из двух игроков
  ↓
Worker определяет второго игрока
  ↓
читает его push-подписки из Firebase
  ↓
отправляет фиксированное уведомление «Твой ход»
  ↓
телефон B показывает его при закрытом браузере
```

Worker не проверяет поле, слово, ревизию или последний ход. Это уже сделал
клиент перед успешной Firebase-транзакцией.

Дедупликации в первой версии нет. Если приложение дважды вызовет Worker, второй
игрок получит два push-сообщения.

## 2. Что безопасно хранить в Cloudflare

В `wrangler.jsonc` записываются публичные настройки:

```text
Firebase Web API key
Firebase Realtime Database URL
VAPID public key
URL приложения
разрешённые CORS origins
```

Firebase Web API key уже находится в браузерном bundle и не предоставляет
доступ к данным сам по себе. Доступ определяют Authentication и Security Rules.

Единственный секрет Worker:

```text
VAPID_PRIVATE_KEY
```

Он загружается через Cloudflare Secrets и не попадает в Git.

Worker не хранит Firebase ID token. Браузер передаёт короткоживущий токен при
каждом вызове, Worker проверяет его через Firebase и использует для чтения
Realtime Database с правами этого игрока.

Не нужны:

- Firebase Admin SDK;
- service account JSON;
- database secret;
- Google OAuth client secret;
- Firebase Cloud Messaging;
- Firebase Cloud Functions.

Официальные источники:

- [Firebase API keys](https://firebase.google.com/docs/projects/api-keys)
- [Firebase Auth REST API](https://firebase.google.com/docs/reference/rest/auth)
- [Firebase REST authentication](https://firebase.google.com/docs/database/rest/auth)

## 3. Где хранить push-подписки

Подписки хранятся в существующей Realtime Database:

```text
pushSubscriptions/
  grinch131/
    <deviceId>/
      endpoint: "https://..."
      expirationTime: null
      keys:
        p256dh: "..."
        auth: "..."
  hinhillaa/
    <deviceId>/
      ...
```

`deviceId` создаётся один раз через `crypto.randomUUID()` и сохраняется в
`localStorage`. Поэтому один игрок может включить уведомления на телефоне и
ноутбуке одновременно.

Текущие Realtime Database Rules уже разрешают обоим доверенным игрокам читать и
писать базу, поэтому для первой версии правила менять не требуется.

## 4. Cloudflare Worker

Worker реализован как npm workspace в `push-worker/`. Зависимости ставятся
общей командой `npm ci` из корня репозитория. Для первого production-деплоя
нужно авторизовать Wrangler:

```bash
npx wrangler login
```

Пакет `web-push` работает в Workers с флагом `nodejs_compat`. Это соответствует
[официальному примеру Cloudflare](https://developers.cloudflare.com/agents/communication-channels/webhooks/push-notifications/).

## 5. Создать VAPID-ключи

Один раз выполнить:

```bash
npx web-push generate-vapid-keys --json
```

Результат:

```json
{
  "publicKey": "B...",
  "privateKey": "..."
}
```

Public key можно хранить в конфигурации. Private key нельзя коммитить.

Не создавать новую пару при каждом деплое: после смены VAPID-ключей устройства
придётся подписать заново.

## 6. Настроить `wrangler.jsonc`

Файл разделён на безопасный top-level без рабочих bindings и два явных
окружения. Development использует только локальные эмуляторы, production —
опубликованные сервисы. Ниже показана сокращённая структура; источником истины
остаётся `push-worker/wrangler.jsonc`:

```jsonc
{
  "$schema": "../node_modules/wrangler/config-schema.json",
  "name": "simple-games-push-unconfigured",
  "main": "src/index.ts",
  "compatibility_date": "2026-07-27",
  "compatibility_flags": ["nodejs_compat"],
  "env": {
    "development": {
      "vars": {
        "APP_URL": "http://localhost:5173/",
        "FIREBASE_AUTH_BASE_URL": "http://127.0.0.1:9099/identitytoolkit.googleapis.com",
        "FIREBASE_DATABASE_URL": "http://127.0.0.1:9000/",
        "FIREBASE_DATABASE_NAMESPACE": "demo-simple-games-default-rtdb"
      }
    },
    "production": {
      "name": "simple-games-push",
      "vars": {
        "APP_URL": "https://dougrinch.com/simple-games/",
        "FIREBASE_AUTH_BASE_URL": "https://identitytoolkit.googleapis.com",
        "FIREBASE_DATABASE_URL": "<VITE_FIREBASE_DATABASE_URL>",
        "VAPID_PUBLIC_KEY": "<publicKey>"
      },
      "secrets": {
        "required": ["VAPID_PRIVATE_KEY"]
      }
    }
  }
}
```

После изменения bindings или переменных сгенерировать типы:

```bash
npm run production:wrangler:types:generate
```

Для локальной разработки создать игнорируемый файл
`push-worker/.dev.vars.development` из одноимённого example-файла:

```dotenv
VAPID_PUBLIC_KEY=<localPublicKey>
VAPID_PRIVATE_KEY=<privateKey>
```

Локальная пара должна отличаться от production-пары. Файл
`.dev.vars.development` находится в `push-worker/.gitignore`.

Загрузить production-секрет:

```bash
npx wrangler secret put VAPID_PRIVATE_KEY --env production --config push-worker/wrangler.jsonc
```

## 7. API Worker

Нужны два endpoints:

| Метод | Путь | Авторизация | Действие |
|---|---|---|---|
| `GET` | `/vapid-public-key` | нет | возвращает VAPID public key |
| `POST` | `/notifications/turn` | Firebase ID token | отправляет push второму игроку |

Авторизованный запрос:

```http
POST /notifications/turn
Authorization: Bearer <FIREBASE_ID_TOKEN>
Content-Type: application/json

{}
```

### Проверка игрока

Worker извлекает Bearer token и проверяет его официальным Firebase REST
endpoint:

```ts
const response = await fetch(
  `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${env.FIREBASE_API_KEY}`,
  {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ idToken }),
  },
)
```

Допускаются только:

```ts
const PLAYER_BY_EMAIL = {
  'grinch131@gmail.com': 'grinch131',
  'hinhillaa@gmail.com': 'hinhillaa',
} as const
```

Worker сам определяет получателя:

```ts
const recipientPlayerId =
  callerPlayerId === 'grinch131' ? 'hinhillaa' : 'grinch131'
```

Клиент не передаёт email, `playerId`, получателя или текст уведомления.

### Получение подписок

Worker читает подписки второго игрока с Firebase ID token отправителя:

```ts
const databaseUrl = env.FIREBASE_DATABASE_URL.replace(/\/$/u, '')
const subscriptionsUrl =
  `${databaseUrl}/pushSubscriptions/${recipientPlayerId}.json` +
  `?auth=${encodeURIComponent(idToken)}`

const response = await fetch(subscriptionsUrl)
```

Это работает с текущими правилами, потому что оба разрешённых аккаунта могут
читать всю Realtime Database.

### Отправка

Текст создаётся только внутри Worker:

```ts
const payload = JSON.stringify({
  title: 'Балда',
  body: 'Соперник сделал ход. Теперь твоя очередь.',
  data: { url: env.APP_URL },
})
```

VAPID:

```ts
import webpush from 'web-push'

await webpush.sendNotification(subscription, payload, {
  vapidDetails: {
    subject: env.VAPID_SUBJECT,
    publicKey: env.VAPID_PUBLIC_KEY,
    privateKey: env.VAPID_PRIVATE_KEY,
  },
  TTL: 60 * 60,
  urgency: 'high',
})
```

Worker запускает доставку через `ctx.waitUntil()`, поэтому API сразу отвечает
`202`, а отправка на все устройства получателя завершается в фоне.

В первой версии ответы `404` и `410` можно только записывать в структурированный
лог. Позже можно автоматически удалять устаревшие подписки.

## 8. CORS

Worker принимает браузерные запросы только от origins из `ALLOWED_ORIGINS`.

Ответы должны содержать:

```http
Access-Control-Allow-Origin: <проверенный Origin>
Vary: Origin
Access-Control-Allow-Headers: Authorization, Content-Type
Access-Control-Allow-Methods: GET, POST, OPTIONS
```

На `OPTIONS` отвечать `204`.

CORS не заменяет проверку Firebase ID token: запрос к публичному Worker можно
послать не только из браузера.

## 9. Добавить PWA-файлы

### Manifest

Создать `public/manifest.webmanifest`:

```json
{
  "name": "Балда",
  "short_name": "Балда",
  "id": "./",
  "start_url": "./",
  "scope": "./",
  "display": "standalone",
  "background_color": "#f5f1e8",
  "theme_color": "#243126",
  "icons": [
    {
      "src": "icons/icon-192.png",
      "sizes": "192x192",
      "type": "image/png"
    },
    {
      "src": "icons/icon-512.png",
      "sizes": "512x512",
      "type": "image/png"
    }
  ]
}
```

Иконки не нужны самому протоколу push, но нужны для нормальной установки
приложения. На iPhone при их отсутствии будет создана системная
иконка-монограмма.

В `index.html`:

```html
<link rel="manifest" href="%BASE_URL%manifest.webmanifest" />
<link rel="apple-touch-icon" href="%BASE_URL%icons/icon-192.png" />
<meta name="theme-color" content="#243126" />
```

### Service Worker

Создать `public/sw.js`:

```js
self.addEventListener('push', (event) => {
  if (!event.data) {
    return
  }

  const data = event.data.json()
  event.waitUntil(
    self.registration.showNotification(data.title ?? 'Балда', {
      body: data.body ?? '',
      data: data.data,
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  event.waitUntil(
    (async () => {
      const targetUrl =
        event.notification.data?.url ?? self.registration.scope
      const windows = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      })

      for (const client of windows) {
        if (client.url.startsWith(self.registration.scope)) {
          if ('navigate' in client) {
            await client.navigate(targetUrl)
          }
          return client.focus()
        }
      }

      return self.clients.openWindow(targetUrl)
    })(),
  )
})
```

Service Worker обязателен: именно его телефон запускает при закрытом
приложении.

Регистрировать с учётом GitHub Pages base path:

```ts
const registration = await navigator.serviceWorker.register(
  `${import.meta.env.BASE_URL}sw.js`,
  { scope: import.meta.env.BASE_URL },
)
```

## 10. Сохранить подписку из приложения

Добавить в `.env.example` и GitHub Actions Repository Variables:

```dotenv
VITE_PUSH_WORKER_URL=https://simple-games-push.<ACCOUNT>.workers.dev
```

Предлагаемый файл:

```text
src/platform/push/pushClient.ts
```

Основные imports:

```ts
import { ref, set } from 'firebase/database'

import type { PlayerId } from '../../games/balda/types'
import { getFirebaseServices } from '../firebase/client'
```

Преобразование VAPID public key:

```ts
function base64urlToUint8Array(value: string): Uint8Array {
  const padded = value + '='.repeat((4 - (value.length % 4)) % 4)
  const binary = atob(padded.replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}
```

Создание стабильного ID устройства:

```ts
const DEVICE_ID_KEY = 'balda-push-device-id'

function getDeviceId(): string {
  const existing = localStorage.getItem(DEVICE_ID_KEY)
  if (existing) {
    return existing
  }

  const created = crypto.randomUUID()
  localStorage.setItem(DEVICE_ID_KEY, created)
  return created
}
```

Включение уведомлений запускается только нажатием пользователя:

```ts
export async function enablePushNotifications(
  playerId: PlayerId,
): Promise<void> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    throw new Error('Push notifications are not supported.')
  }

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    throw new Error('Notification permission was not granted.')
  }

  const registration = await navigator.serviceWorker.register(
    `${import.meta.env.BASE_URL}sw.js`,
    { scope: import.meta.env.BASE_URL },
  )

  const keyResponse = await fetch(
    `${import.meta.env.VITE_PUSH_WORKER_URL}/vapid-public-key`,
  )
  const { publicKey } = (await keyResponse.json()) as { publicKey: string }

  const existing = await registration.pushManager.getSubscription()
  const subscription =
    existing ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64urlToUint8Array(publicKey),
    }))

  const { database } = getFirebaseServices()
  await set(
    ref(
      database,
      `pushSubscriptions/${playerId}/${getDeviceId()}`,
    ),
    subscription.toJSON(),
  )
}
```

`base64urlToUint8Array()` преобразует VAPID public key в `Uint8Array`, как в
[официальном примере Cloudflare](https://developers.cloudflare.com/agents/communication-channels/webhooks/push-notifications/).

На iPhone пользователь должен сначала добавить игру на главный экран, открыть
её с иконки и только затем нажать «Включить уведомления».

## 11. Вызвать Worker после хода

Авторизованный запрос:

```ts
import { getIdToken } from 'firebase/auth'

import { getFirebaseServices } from '../firebase/client'

export async function notifyOtherPlayer(): Promise<void> {
  const user = getFirebaseServices().auth.currentUser
  if (!user) {
    throw new Error('Firebase user is not signed in.')
  }

  const idToken = await getIdToken(user)
  const response = await fetch(
    `${import.meta.env.VITE_PUSH_WORKER_URL}/notifications/turn`,
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${idToken}`,
        'content-type': 'application/json',
      },
      body: '{}',
    },
  )

  if (!response.ok) {
    throw new Error(`Push API returned ${response.status}.`)
  }
}
```

В `AuthorizedGame.submitMove`:

```ts
const confirmedGame = await repository.submitMove(
  game.id,
  playerId,
  move,
)

setSession((current) =>
  current ? { ...current, game: confirmedGame } : current,
)

void notifyOtherPlayer().catch((error: unknown) => {
  console.error('Sending the turn notification failed.', error)
})
```

Важно:

- Worker вызывается только после успешного `repository.submitMove`;
- ошибка push не отменяет принятый ход;
- тело запроса пустое;
- повторный вызов отправит повторное уведомление.

## 12. Деплой и проверка

Локальный Worker:

```bash
npm run dev:push:start
```

Проверить public key:

```bash
curl http://localhost:8787/vapid-public-key
```

Деплой:

```bash
npm run check
npm run production:push:bundle
npm run production:push:deploy
```

`production:push:bundle` собирает готовый Worker в `push-worker/dist`, а
`production:push:deploy` публикует именно этот bundle с `--no-bundle`. После
изменения Worker, его dependencies или `wrangler.jsonc` bundle нужно создать
заново. В GitHub Actions эти команды разделены между build- и deploy-jobs через
неизменяемый workflow artifact.

Полученный URL записать в:

- `.env.production.local` как `VITE_PUSH_WORKER_URL`;
- GitHub Repository Variable `VITE_PUSH_WORKER_URL`;
- список обязательных production-переменных `scripts/check-env.mjs`.

Ручная проверка:

1. Войти обоими аккаунтами.
2. На обоих устройствах включить уведомления.
3. Проверить записи в `/pushSubscriptions`.
4. На устройстве B закрыть игру или заблокировать телефон.
5. На устройстве A сделать ход.
6. Проверить уведомление на B.
7. Нажать его и проверить открытие `/simple-games/`.

Production-логи:

```bash
npx wrangler tail --env production --config push-worker/wrangler.jsonc
```

Не логировать Firebase ID token, VAPID private key или полный push endpoint.

## 13. Ограничения первой версии

- Повторный вызов создаёт повторный push.
- Устаревшие подписки пока не удаляются автоматически.
- Если Firebase сохранил ход, но сеть оборвалась до вызова Worker, push не
  отправится.
- Получатель должен один раз включить уведомления на каждом устройстве.
- На iPhone требуется установленное на главный экран web-приложение.

Для двух доверенных игроков эти ограничения приемлемы. Дедупликацию, удаление
устаревших подписок и повторные попытки можно добавить после проверки базовой
доставки.
