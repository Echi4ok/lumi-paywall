# Повторное независимое ревью

13 октября 2026 года. Исправления проверяли отдельные агенты frontend, backend, UI и system design. Итоговая проверка охватывает весь небольшой проект, а не только изменённые строки.

| Критерий             | Что проверено / исправлено                                                                      | Доказательство                                                      |
| -------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Соответствие ТЗ      | Два server-loaded тарифа, purchase/restore, состояния, mobile 360–430, Nuxt 4, deployed DB      | HTTP smoke и браузерные сценарии                                    |
| Frontend / состояние | Корреляция receipt с точной попыткой; истёкший replay не показывает успех; restore без каталога | Client regression + реальные PGlite recovery paths                  |
| Вкладки / сессия     | Один bootstrap UUID через атомарную IDB-транзакцию; cookie приоритетна; bounded cancellation    | 12 параллельных IDB-вызовов, HTTP integration, E2E с поздней cookie |
| UI / доступность     | UI-примитивы, scoped feature CSS, контраст, native radio, focus, disabled/loading               | Настоящие Vue mount-тесты, Chromium/WebKit                          |
| Backend / данные     | Серверная цена и активность, SQL-ограничения, idempotency и конфликты                           | Repository/service/HTTP tests; 12 concurrent requests               |
| System design        | Application зависит от domain port, composition root связывает SQL; UI не знает persistence     | Независимый просмотр импортов и ответственности модулей             |
| Abuse / privacy      | Distributed global→IP→device limits; bounded cleanup; HMAC identifiers; безопасные diagnostics  | SQL concurrency/rotation tests, HTTP429, secret-redaction tests     |
| Миграции / schema    | Ledger, checksum, ordering, transaction/advisory lock, readiness                                | Upgrade/replay/drift tests и db:check                               |
| Delivery / recovery  | Built server + PostgreSQL16, browser tests, dump/restore, отдельный public smoke                | GitHub workflows и OPERATIONS.md                                    |
| Макет / evidence     | Убрано некорректное приравнивание RGB MAE к 99% Pixel Perfect; сравнение PNG воспроизводимо     | compare:design, исходные PNG, design/README.md                      |

## Замечания повторного прохода

1. Потерянный ответ → восстановление → истечение срока оставляли старый requestId и повторно показывали успех. Теперь квитанция несёт requestId, подтверждается только совпадающая попытка, активность вычисляет сервер. Следующая покупка требует отдельного нажатия и нового ключа.
2. Два первых ответа могли по очереди устанавливать разные cookie и терять связь с покупкой. Bootstrap согласован IndexedDB-транзакцией; сервер не генерирует запасную случайную сессию при отсутствии header/cookie.
3. У вторичного текста на выбранной карточке и границ radio не хватало контраста. Цвета изменены на #726580 и #9385A5: соответственно 4.58:1 и 3.42:1 в проверенных сочетаниях.
4. Не было mounted-component/browser проверок, migration ledger, distributed limiter и полезного диагностического контекста. Эти механизмы добавлены с целевыми тестами.
5. Ревью самих исправлений выявило отсутствовавший CI env, неправильную методику задержки cookie в E2E и активную кнопку retry во время restore. Все три исправлены; тест задерживает реальный Set-Cookie, используя Node fetch вне browser cookie jar.
6. Readiness первоначально повторяла полный аудит схемы на каждый запрос. Проверка ограничена коротким кешем и singleflight; окно устаревания явно описано в runbook.

Исправления первого ревью также сохранены: срок cookie продлевается при покупке/restore, попытки разделены по тарифам, транспорт имеет общий deadline, SESSION_REQUIRED объясняется пользователю, повторная загрузка сохраняет выбранный тариф.

## Границы вывода

Это качественно проверяемое учебное демо. Внешний мониторинг, production backup/PITR и RPO/RTO не считаются настроенными только потому, что написан runbook. Реальный WebView на физических устройствах не проверен. Анонимная browser identity не заменяет аккаунт или платёжную авторизацию. Состояние сравнения с Figma и upstream npm advisories указано отдельно в VERIFICATION.md; эти ограничения не спрятаны за формулировкой production-ready.
