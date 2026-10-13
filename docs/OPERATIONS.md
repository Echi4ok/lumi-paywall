# Запуск и эксплуатация

## Окружение

Локальная разработка запускается через `npm run dev` без секретов: PGlite сохраняет данные в `.data/lumi`. Для собранного приложения нужна внешняя PostgreSQL-совместимая БД.

| Переменная              | Назначение                                                                         |
| ----------------------- | ---------------------------------------------------------------------------------- |
| `DATABASE_URL`          | Подключение приложения к БД; обязательно в production                              |
| `DATABASE_URL_UNPOOLED` | Прямое подключение для миграций, если требуется; должно вести в ту же БД           |
| `DATABASE_DRIVER`       | `neon` по умолчанию; `postgres` для TCP PostgreSQL                                 |
| `RATE_LIMIT_SECRET`     | Общий для инстансов случайный секрет, минимум 16 символов; обязателен в production |
| `APP_ORIGIN`            | Необязательный разрешённый origin при размещении за прокси                         |

Production-значения задаются в Vercel. Для CLI миграций можно использовать игнорируемый `.env`; образец — `.env.example`.

## Проверка

Создайте **отдельную тестовую БД** PostgreSQL 16 или Neon. В игнорируемом `.env.test` задайте её `DATABASE_URL`, соответствующий драйвер и тестовый `RATE_LIMIT_SECRET`. Если указан `DATABASE_URL_UNPOOLED`, он должен вести в эту же тестовую БД. `APP_ORIGIN` оставьте незаданным для локальных проверок. Переменные, уже установленные в оболочке, имеют приоритет над env-файлом — production-настройки должны быть отключены.

```sh
npm ci
npm run check
npm run build
node --env-file=.env.test --experimental-strip-types scripts/migrate.ts
node --env-file=.env.test --experimental-strip-types scripts/migrate.ts --check
node --env-file=.env.test scripts/check-runtime.mjs
npx playwright install chromium webkit
node --env-file=.env.test node_modules/@playwright/test/cli.js test
```

Последняя команда загружает окружение и для Playwright, и для запускаемого им Nitro на порту 4173. Runtime smoke использует порт 4181. Оба создают тестовые покупки. На Linux для установки системных библиотек браузеров используйте `npx playwright install --with-deps chromium webkit`, как в [CI](../.github/workflows/ci.yml).

CI поднимает PostgreSQL 16, выполняет `npm run check`, сборку, миграции, runtime smoke и Chromium/WebKit E2E. После этого восстанавливает дамп в другую тестовую БД и сравнивает ненулевое число покупок. Скриншоты и traces ошибок доступны в artifacts workflow.

## Выпуск

1. Дождитесь успешного CI для нужного commit; сохраните адрес текущего deployment для отката.
2. С production-окружением выполните `npm run db:migrate`, затем `npm run db:check`. Применённые SQL-файлы не редактируются: следующая миграция получает номер `003_...sql` и запись в `REQUIRED_MIGRATIONS`.
3. Выполните `vercel deploy --prod --skip-domain`. Проверьте `/api/health` и purchase/replay/restore на полученном адресе с разрешённым доступом к Deployment Protection.
4. Выполните `vercel promote <deployment-url>` и запустите workflow **Verify public deployment**. Публичный smoke создаёт одну новую учебную покупку.
5. При регрессии: `vercel rollback <previous-url>`. Откат приложения не отменяет миграции; изменения схемы должны сохранять совместимость с предыдущей сборкой.

## Диагностика

- `/api/health`: `200` — проверка пройдена, `503` — проверить env, доступ к БД и `db:check`. На каждом инстансе успешный результат кешируется до 5 секунд, ошибка — на 1 секунду; аудит схемы повторяется через 30 секунд при следующем запросе.
- `X-Request-Id` связывает ответ с Vercel Runtime Logs: операция, статус и безопасный код ошибки. SQL, cookie и строки подключения не логируются.
- `429` содержит `Retry-After`. Лимиты в минуту (общий / IP / устройство): offers 1200 / 180 / 120, purchase 600 / 120 / 30, restore 1200 / 180 / 60. На границе минут возможен двойной burst.

Для восстановления production сначала проверьте retention/PITR своего Neon-плана. Восстанавливайте в новую БД, выполняйте `db:check` и проверяйте purchase/restore на изолированном deployment перед переключением. Исходную БД сохраняйте для возврата; дампы храните вне Git и CI artifacts. Текущие границы проверки — в [ARCHITECTURE.md](ARCHITECTURE.md#ограничения).
