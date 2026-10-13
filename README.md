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
| `shared/contracts/`                     | Типизированный контракт клиента и сервера                   |
| `server/api/`, `server/http/`           | Маршруты, валидация, cookie и HTTP-ошибки                   |
| `server/application/`, `server/domain/` | Сценарии покупки/восстановления, правила и порт репозитория |
| `server/infrastructure/`, `migrations/` | SQL, драйверы и схема БД                                    |

**Vercel + Neon PostgreSQL**: Vercel исполняет Nuxt server routes, Neon сохраняет данные между вызовами и деплоями. Один репозиторий, один SQL-репозиторий, без отдельного сервиса авторизации. Цена определяется сервером; уникальный ключ попытки защищает от дубликатов после потери ответа. Восстановление работает в том же браузере/webview по HttpOnly cookie; после очистки cookie и на другом устройстве восстановление без аккаунта невозможно.

## Проверка и AI

`npm run check` — форматирование, ESLint, TypeScript и **53 теста**, включая интеграцию с PostgreSQL-движком PGlite. `npm run build` — production-сборка. `npm run smoke -- https://lumi-paywall.vercel.app` проверяет реальные HTTP-маршруты, запись, 12 конкурентных запросов, повтор и восстановление; создаёт одну тестовую покупку.

Использован **OpenAI Codex**: разработка, Figma, отдельные агенты для архитектуры и ревью. Проверки выполнялись инструментами и браузером, без заявления о ручном тестировании человеком. Конкретные результаты и ограничения — в [проверке](docs/VERIFICATION.md), решения — в [архитектуре](docs/ARCHITECTURE.md).

**Следующие 2 часа:** тест на реальных WKWebView/Android WebView, сравнение рендера с Figma на устройствах, ограничение частоты запросов перед широкой публичной демонстрацией. Это учебный сценарий; реальный биллинг потребовал бы server-side проверки store receipts и модели подписок.
