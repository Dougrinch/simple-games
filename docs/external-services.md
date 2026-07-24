# Настройка Firebase и GitHub Pages

Ниже перечислены только действия, требующие доступа владельца к Firebase Console
или настройкам репозитория GitHub. Реальные значения конфигурации и ключи
сервисных аккаунтов в репозиторий добавлять не нужно.

## 1. Firebase

### Создать проект и Web App

1. Откройте [Firebase Console](https://console.firebase.google.com/) и создайте
   проект на тарифе Spark. Google Analytics для приложения не требуется.
2. Добавьте Web App с именем `simple-games`. Firebase Hosting включать не нужно:
   статическое приложение публикуется через GitHub Pages.
3. В `Project settings → General → Your apps → SDK setup and configuration`
   скопируйте значения объекта `firebaseConfig`. Поля `databaseURL` на этом
   этапе может не быть: оно относится к Realtime Database, которую нужно создать
   отдельно по инструкции ниже.
4. Создайте локальный `.env.local` на основе `.env.example` и сопоставьте поля:

| Значение Firebase | Переменная |
|---|---|
| `apiKey` | `VITE_FIREBASE_API_KEY` |
| `authDomain` | `VITE_FIREBASE_AUTH_DOMAIN` |
| URL из `Build → Realtime Database` | `VITE_FIREBASE_DATABASE_URL` |
| `projectId` | `VITE_FIREBASE_PROJECT_ID` |
| `storageBucket` | `VITE_FIREBASE_STORAGE_BUCKET` |
| `messagingSenderId` | `VITE_FIREBASE_MESSAGING_SENDER_ID` |
| `appId` | `VITE_FIREBASE_APP_ID` |

Для локального запуска с настоящим Firebase, без эмуляторов, в `.env.local`
оставьте:

```dotenv
VITE_BASE_PATH=/
VITE_USE_FIREBASE_EMULATORS=false
```

Для публикации через GitHub Pages значение `VITE_BASE_PATH=/simple-games/`
добавляется отдельно как Repository Variable по инструкции в разделе GitHub
ниже. `VITE_USE_FIREBASE_EMULATORS=false` уже задано в workflow, поэтому
создавать для него Repository Variable не нужно.

Firebase Web API key и остальные поля Web App видны в клиентском bundle и не
являются серверными секретами. Защиту обеспечивает Authentication вместе с
Security Rules. JSON-ключ сервисного аккаунта этому приложению не нужен.

### Включить Google Authentication

1. Откройте `Build → Authentication → Get started`.
2. В `Sign-in method` включите провайдер Google.
3. Выберите email поддержки проекта и сохраните настройку.
4. Убедитесь, что в `Authentication → Settings → Authorized domains` есть:
   - `localhost`;
   - `dougrinch.github.io`.

Добавляется только домен, без протокола и без пути `/simple-games/`. Домен
`firebaseapp.com` проекта Firebase обычно добавлен автоматически.

### Создать Realtime Database

1. Откройте `Build → Realtime Database → Create Database`.
2. До создания выберите регион с учётом того, что перенести готовую базу в другой
   регион нельзя.
3. Выберите locked mode, не test mode.
4. На вкладке `Data` скопируйте URL из верхней части страницы (например,
   `https://<PROJECT_ID>-default-rtdb.firebaseio.com`) в
   `VITE_FIREBASE_DATABASE_URL`. После создания базы этот URL также может
   появиться как `databaseURL` в объекте `firebaseConfig`.

### Войти через локальный Firebase CLI

CLI установлен в проект и запускается через `npx`; глобальная установка не
требуется.

```bash
npm ci
npx firebase login
npx firebase projects:list
```

Во всех production-командах ниже передавайте явный Firebase Project ID, чтобы
случайно не заменить безопасный локальный alias `demo-simple-games`:

```bash
npx firebase deploy --only database --project <FIREBASE_PROJECT_ID>
```

Текущие правила намеренно дают двум разрешённым email полный доступ ко всей
Realtime Database и запрещают любой доступ всем остальным. Оба игрока считаются
доверенными. Деплой через CLI перезаписывает правила из Firebase Console,
поэтому источником истины должен оставаться файл из репозитория.

### Импортировать стартовые данные

Узнайте имя инстанса:

```bash
npx firebase database:instances:list --project <FIREBASE_PROJECT_ID>
```

Затем загрузите корень `firebase-data/seed.json`:

```bash
npx firebase database:set / firebase-data/seed.json \
  --project <FIREBASE_PROJECT_ID> \
  --instance <DATABASE_INSTANCE_NAME> \
  --force
```

Команда заменяет данные в корне базы. Для уже используемой базы сначала
проверьте экспорт: повторный импорт поверх активных партий недопустим.

Альтернатива для пустой базы: `Realtime Database → Data → ⋮ → Import JSON` и
выбрать `firebase-data/seed.json`.

## 2. GitHub

Репозиторий: <https://github.com/Dougrinch/simple-games>.

### Добавить Actions Repository Variables

Откройте `Settings → Secrets and variables → Actions → Variables` и добавьте:

- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_DATABASE_URL`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`
- `VITE_BASE_PATH` со значением `/simple-games/`

Это именно Repository Variables, не Secrets. Workflow прервёт сборку с понятной
ошибкой, если хотя бы одно значение отсутствует.

### Включить Pages

1. Откройте `Settings → Pages`.
2. В `Build and deployment → Source` выберите `GitHub Actions`.
3. Запушьте изменения в `main` или вручную запустите workflow
   `Checks and GitHub Pages deployment` на вкладке Actions.
4. Дождитесь успешных jobs `Checks and build` и `Deploy`.

Workflow устанавливает зависимости через lock-файл, проверяет стиль и типы,
запускает тесты приложения и Firebase Security Rules, собирает Vite и публикует
только каталог `dist`. Он не развёртывает `database.rules.json`: после изменения
правил владелец отдельно выполняет `npx firebase deploy --only database
--project <FIREBASE_PROJECT_ID>`.

Ожидаемый URL:

<https://dougrinch.github.io/simple-games/>

## 3. Проверка готовности сторонних сервисов

- Google provider включён.
- `localhost` и `dougrinch.github.io` находятся в Authorized domains.
- Realtime Database создана не в test mode.
- Rules развёрнуты из `database.rules.json`.
- `meta/schemaVersion` равен `1`.
- `dictionaries/balda/startWords/count` равен `1554`.
- В GitHub заданы все восемь Repository Variables.
- Pages использует GitHub Actions.
- Workflow на `main` проходит полностью.

Полезные официальные документы:

- [Firebase Google Sign-In](https://firebase.google.com/docs/auth/web/google-signin)
- [Firebase CLI](https://firebase.google.com/docs/cli)
- [Firebase Local Emulator Suite](https://firebase.google.com/docs/emulator-suite)
- [GitHub Pages custom workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)
