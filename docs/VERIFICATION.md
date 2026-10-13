# Проверка результата

13 октября 2026 года. Проверки выполняет Codex через CLI, независимых агентов и браузер; ручное тестирование человеком не заявляется.

## Воспроизводимые проверки

- `npm run check`: Prettier, ESLint без предупреждений, strict TypeScript, модульные, SQL-интеграционные и mounted Vue component-тесты.
- `npm run build`: полноценная production-сборка Nuxt/Nitro, не статический export.
- `npm run db:migrate` и `npm run db:check`: порядок, checksum и фактическая схема Neon. Две миграции применены и проверены 13 октября.
- Quality checks в GitHub использует настоящий PostgreSQL16, собранный Nitro, HTTP smoke, Chromium и WebKit. Проверяет restore после reload, потерю ответа после commit, конкурентные первые вкладки с поздней cookie, restore при недоступном каталоге, клавиатуру и ширины360/390/430.
- CI сохраняет скриншоты и при ошибке traces. После браузерных тестов делает backup/restore в отдельную тестовую БД и сравнивает данные. Это не равнозначно проверке production backups.
- Verify public deployment — отдельный workflow после публикации. Он не имеет Vercel secrets и проверяет фиксированный публичный адрес.

Последние фактические результаты доступны в [Quality checks](https://github.com/Echi4ok/lumi-paywall/actions/workflows/ci.yml) и [проверке демо](https://github.com/Echi4ok/lumi-paywall/actions/workflows/verify-deployment.yml). Наличие сценария в исходниках само по себе не означает его успешный прогон; status конкретного workflow — источник результата.

## HTTP и хранение

Smoke использует настоящие routes и БД: каталог, bootstrap, пустой restore, 12 одновременных запросов с одним ключом, повтор, restore той же квитанции, конфликт тарифа, неверный payload, изоляция профилей и readiness. Серверные интеграционные тесты проверяют 30 успешных покупок и последующие429, отсутствие размножения buckets после global limit, истечение по серверным часам и недоступную схему.

Независимое [ревью](REVIEW.md) разделяет исправленные дефекты и эксплуатационные ограничения. [Архитектура](ARCHITECTURE.md) описывает границы слоёв, [runbook](OPERATIONS.md) — выпуск, откат и восстановление.

## Визуальная проверка

Редактируемая [Figma](https://www.figma.com/design/UXGo2MuLLvDZEtRs3Giisd?node-id=2-2) содержит main/loading/error/success, доступ Anyone can view был проверен. Текущий статус экспортов находится в [design/README.md](../design/README.md).

`npm run compare:design -- <figma.png> <browser.png>` сравнивает PNG одинакового размера без сдвига, масштабирования и масок. Выводит долю отличающихся пикселей по pixelmatch (threshold0.1, anti-alias exclusions), точное RGB-совпадение и MAE отдельно, пишет diff в test-results/design. Сглаживание шрифта зависит от движка/ОС. Нормированное среднее RGB-отклонение больше не выдаётся за доказательство требования «99% Pixel Perfect».

## Остаточные ограничения

- Физические WKWebView/Android WebView не проверены: desktop WebKit и mobile viewport не заменяют устройство.
- Browser identity — анонимная связь. Очистка данных сайта и другое устройство теряют доступ; старый профиль до IDB-bootstrap может потерять связь и после удаления одной cookie.
- Нет настоящих платежей, автопродления, аккаунтов, SLA, внешних alerting/uptime и проверенного production restore. Это не требовалось для учебного paywall.
- `npm audit`: 0 critical, 11 high через две исходные advisory в tooling (`braces`, `node-forge`). Их нет в dependency manifest собранного Nitro. Принудительный downgrade Nuxt не применяется; upstream-обновления нужно отслеживать перед дальнейшим расширением. Это не заявление об отсутствии всех production-уязвимостей.
