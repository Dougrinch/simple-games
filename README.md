# Балда

Мобильная веб-игра для двух заранее разрешённых пользователей. Проект использует
React, strict TypeScript, Vite, Firebase Authentication, Firebase Realtime
Database и GitHub Pages.

Сейчас завершён этап 1: воспроизводимое локальное окружение, безопасный базовый
контур Security Rules, стартовые данные, тестовый каркас и CI/CD. Игровые
транзакции и интерфейс будут реализованы на следующих этапах.

## Быстрый локальный запуск

Требуются Node.js 24 LTS, npm 11+, Java 21 и Git. `.nvmrc` фиксирует единую
версию Node.js для локальной разработки и CI.

```bash
# Homebrew на macOS:
export PATH="/opt/homebrew/opt/node@24/bin:$PATH"

# Либо при установленном nvm:
nvm use

npm ci
cp .env.emulator.example .env.local
```

Запустите три процесса:

```bash
# Терминал 1: Auth, Realtime Database и Emulator UI
npm run emulators

# Терминал 2: импорт schemaVersion и 147 стартовых слов
npm run emulators:seed

# Терминал 3: приложение
npm run dev
```

- приложение: <http://localhost:5173>
- Firebase Emulator UI: <http://localhost:4000>
- Auth Emulator: `127.0.0.1:9099`
- Realtime Database Emulator: `127.0.0.1:9000`

После запуска приложение автоматически создаёт разрешённого тестового
пользователя только в Auth Emulator и читает
`dictionaries/balda/startWords/count`. Успешная проверка отображается на странице
как `Соединение с базой есть. Слов в базе: 147`. Если приложение было открыто до
импорта данных, перезагрузите страницу после `npm run emulators:seed`.

`.env.local` уже создан в текущем рабочем каталоге и исключён из Git. Команда
копирования нужна для новых клонов.

## Проверки

```bash
npm run lint          # статический анализ
npm run typecheck     # strict TypeScript
npm test              # модульные и компонентные тесты
npm run test:rules    # интеграционные тесты правил через RTDB Emulator
npm run test:coverage # отчёт о покрытии
npm run build         # проверка env, типов и production-сборка
npm run check         # полный локальный набор проверок
```

Первый запуск `npm run test:rules` загружает бинарник эмулятора Realtime
Database в пользовательский кеш Firebase CLI.

## Конфигурация

- `.env.example` — полный шаблон production-переменных без значений.
- `.env.emulator.example` — безопасная локальная конфигурация для проекта
  `demo-simple-games`; проект с префиксом `demo-` не обращается к production.
- `.env.local` — локальные значения, не попадают в Git.
- `firebase.json` — порты эмуляторов и путь к Security Rules.
- `.firebaserc` — безопасный локальный проект `demo-simple-games`.
- `firebase-data/seed.json` — версия схемы и 147 уникальных стартовых слов.

Проверка переменных вызывается production-сборкой. `VITE_BASE_PATH` должен иметь
начальный и конечный слеш: `/` локально и `/simple-games/` на GitHub Pages.

## Структура

```text
src/app/                 корневое React-приложение
src/platform/firebase/   инициализация Firebase и подключение эмуляторов
src/test/                общая настройка компонентных тестов
tests/rules/             интеграционные тесты Security Rules
firebase-data/           стартовые данные
scripts/                 проверка env и импорт данных в эмулятор
.github/workflows/       проверки и публикация GitHub Pages
```

Текущие `database.rules.json` уже закрывают базу от посторонних, дают двум
разрешённым email чтение системных данных и словаря, а также ограничивают запись
профиля. Игровые записи намеренно запрещены до реализации и тестирования полных
правил транзакций.

## Firebase и GitHub Pages

Пошаговая настройка сторонних сервисов находится в
[docs/external-services.md](docs/external-services.md).

Будущий production URL: <https://dougrinch.github.io/simple-games/>.

## Модель доверия

Firebase Security Rules защищают данные от посторонних, но без доверенного
серверного кода не могут полностью доказать геометрию слова или честность
случайного выбора. В первой версии оба разрешённых игрока считаются доверенными
и используют опубликованный клиент. Подтверждённое состояние Firebase остаётся
единственным источником истины; локальный снимок предназначен только для чтения.
