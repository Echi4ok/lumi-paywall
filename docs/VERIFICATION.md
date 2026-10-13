# Проверка результата

13 октября 2026 года. Проверки выполняет Codex через CLI, независимых агентов и браузер; ручное тестирование человеком не заявляется.

## Результат выпуска

Функциональный commit `94b3a59`: [Quality checks — success](https://github.com/Echi4ok/lumi-paywall/actions/runs/38437937782), **117 тестов и 14 E2E-сценариев**, production build, PostgreSQL16, migration/check, runtime HTTP и dump/restore. [Проверка публичного deployment — success](https://github.com/Echi4ok/lumi-paywall/actions/runs/38438538765). Deployment `dpl_E2cyi7UYqhDymoAdEmXXMxyBb847` сначала проверен в staging (health/purchase/replay/restore), затем продвинут на `lumi-paywall.vercel.app`. Документация и PNG обновляются отдельным последующим commit без изменения runtime.

Публичный HTTP smoke после promotion: 12 конкурентных запросов вернули одну квитанцию `0e3faffe-db86-4a4e-8804-52d77b756679`, повтор и restore совпали. Живой браузер подтвердил ширину390 без overflow, новый токен контраста и отсутствие console warning/error при открытии.

Состав исходников deployment проверен отдельно: `.env` отсутствует, `.data`, `.nuxt`, `.output` и test artifacts не содержат загруженных файлов. Для CLI добавлен `.vercelignore`; одного `.gitignore` оказалось недостаточно.

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

Для актуальных main PNG390×838: pixelmatch отмечает **4010 пикселей (1.227%)** как различающиеся; точное RGB-совпадение —92.165%, MAE—2.585/255. Геометрия, токены и иконки сверены и исправлены, оставшаяся видимая разница преимущественно в растеризации текста. Строгий численный порог99% этим сравнением **не подтверждён**; округление или изменение tolerance ради прохождения не применяется.

## Остаточные ограничения

- Физические WKWebView/Android WebView не проверены: desktop WebKit и mobile viewport не заменяют устройство.
- Browser identity — анонимная связь. Очистка данных сайта и другое устройство теряют доступ; старый профиль до IDB-bootstrap может потерять связь и после удаления одной cookie.
- Нет настоящих платежей, автопродления, аккаунтов, SLA, внешних alerting/uptime и проверенного production restore. Это не требовалось для учебного paywall.
- `npm audit`: 0 critical, 11 high через две исходные advisory в tooling ([braces](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm), [node-forge](https://github.com/advisories/GHSA-86w9-cpqp-85rv)); patched versions пока не указаны. Их нет в dependency manifest собранного Nitro. Принудительный downgrade Nuxt не применяется; upstream-обновления нужно отслеживать перед дальнейшим расширением. Это не заявление об отсутствии всех production-уязвимостей.
