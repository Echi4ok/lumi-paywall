# Луми · маленькие открытия

Мобильный paywall вымышленной детской игры на **Nuxt 4 + TypeScript**. Два тарифа, тестовая покупка, восстановление доступа. Настоящих платежей и автопродления нет.

**[Открыть приложение](https://lumi-paywall.vercel.app)** · **[Макет в Figma](https://www.figma.com/design/UXGo2MuLLvDZEtRs3Giisd?node-id=2-2)** · **[GitHub](https://github.com/Echi4ok/lumi-paywall)**

[![Quality checks](https://github.com/Echi4ok/lumi-paywall/actions/workflows/ci.yml/badge.svg)](https://github.com/Echi4ok/lumi-paywall/actions/workflows/ci.yml)

## Локальный запуск

Node **22.23.3** (`.nvmrc`), npm. Без аккаунтов и ключей:

```sh
npm ci
npm run dev
```

Откройте `http://127.0.0.1:3000`. Локальная PostgreSQL-совместимая **PGlite** автоматически создаёт БД в `.data/lumi`. Для Neon задайте `DATABASE_URL` в `.env` по `.env.example` и выполните `npm run db:migrate` перед запуском. Production требует внешнюю БД и не переключается на временное хранилище.

## Где что находится

| Путь                                    | Ответственность                                             |
| --------------------------------------- | ----------------------------------------------------------- |
| `app/features/paywall/`                 | Vue-компоненты, состояние экрана, HTTP-клиент               |
| `app/ui/`, `app/assets/css/`            | UI-примитивы, токены и базовые стили                        |
| `shared/contracts/`                     | Типизированный контракт клиента и сервера                   |
| `server/api/`, `server/http/`           | Маршруты, валидация, cookie и HTTP-ошибки                   |
| `server/application/`, `server/domain/` | Сценарии покупки/восстановления, правила и порт репозитория |
| `server/infrastructure/`, `migrations/` | SQL, драйверы и схема БД                                    |

**Vercel + Neon PostgreSQL**: Vercel исполняет server routes, Neon сохраняет покупки между деплоями. Цена определяется сервером; уникальный ключ попытки защищает от дубликатов после потери ответа. Восстановление привязано к анонимному профилю браузера: IndexedDB согласует первые вкладки, HttpOnly cookie используется API. После очистки данных сайта и на другом устройстве без аккаунта восстановление невозможно. Production также требует `RATE_LIMIT_SECRET`; миграции и выпуск описаны в [runbook](docs/OPERATIONS.md).

## Проверка и AI

`npm run check` — форматирование, ESLint, TypeScript, модульные, SQL-интеграционные и Vue component-тесты. CI также запускает собранный Nitro с PostgreSQL 16, HTTP smoke, Chromium/WebKit и восстановление тестового дампа. `npm run smoke -- https://lumi-paywall.vercel.app` проверяет опубликованный API, 12 конкурентных запросов, повтор и restore; создаёт одну тестовую покупку.

Использован **OpenAI Codex**: разработка, Figma, отдельные агенты для архитектуры и ревью. Проверки выполнялись инструментами и браузером, без заявления о ручном тестировании человеком. Конкретные результаты и ограничения — в [проверке](docs/VERIFICATION.md), решения — в [архитектуре](docs/ARCHITECTURE.md).

**Следующие 2 часа:** реальные WKWebView/Android WebView и проверка рендера на устройствах. Для настоящего биллинга нужны проверка store receipts и модель подписок. По просьбе заказчика добавлены повторное ревью и защитные проверки сверх двухчасового ориентира ТЗ; результат не выдаётся за двухчасовую работу.
