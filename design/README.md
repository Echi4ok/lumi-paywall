# Луми · макет и реализация

[Открыть редактируемый макет в Figma](https://www.figma.com/design/UXGo2MuLLvDZEtRs3Giisd?node-id=2-2)

| Состояние             | Figma                                                                      | Эталонный PNG                                  | Размер    |
| --------------------- | -------------------------------------------------------------------------- | ---------------------------------------------- | --------- |
| Выбор тарифа          | [2:2](https://www.figma.com/design/UXGo2MuLLvDZEtRs3Giisd?node-id=2-2)     | [figma-390.png](figma-390.png)                 | 390 × 838 |
| Подтверждение покупки | [6:2](https://www.figma.com/design/UXGo2MuLLvDZEtRs3Giisd?node-id=6-2)     | [figma-loading-390.png](figma-loading-390.png) | 390 × 838 |
| Ошибка с повтором     | [6:88](https://www.figma.com/design/UXGo2MuLLvDZEtRs3Giisd?node-id=6-88)   | [figma-error-390.png](figma-error-390.png)     | 390 × 931 |
| Успех                 | [6:176](https://www.figma.com/design/UXGo2MuLLvDZEtRs3Giisd?node-id=6-176) | [figma-success-390.png](figma-success-390.png) | 390 × 838 |

`figma-*.png` — экспорты фреймов для сравнения с реализацией, `browser-*.png` — снимки браузера. Основной экран и успех сняты в локальном Chromium; 360/430/error — в Chromium Linux из [CI](https://github.com/Echi4ok/lumi-paywall/actions/runs/38437050577). Исходник иллюстрации — [lumi-world.svg](lumi-world.svg).

**Параметры:** локальный Nunito и OFL-лицензия в [public/fonts](../public/fonts); горизонтальные отступы 24 px; заголовок 29/33, описание 14/21; тарифы 88 и 76 px с промежутком 10 px; основная кнопка 56 px; восстановление 44 px. [Цветовые токены](../app/assets/css/tokens.css): фон `#F8F6FF`, текст `#33264B`, вторичный текст `#726580`, акцент `#7655B8`, выделение `#F0E9FF`, коралловый `#F58B76`, граница невыбранного radio `#9385A5`.

На ширинах 360–430 px карточки заполняют доступную ширину; на большом экране контейнер ограничен 390 px. Safe-area добавляется к верхнему и нижнему отступам. Страница прокручивается целиком. Нативные radio поддерживают клавиатуру, состояние успеха переводит фокус на заголовок, `prefers-reduced-motion` отключает анимации.

Сравнить основной экран: `npm run compare:design`. Для другой пары: `npm run compare:design -- <figma.png> <browser.png>`. PNG должны иметь одинаковый размер; diff сохраняется в `test-results/design/diff.png`.

Для сохранённой пары `figma-390.png` / `browser-390.png` pixelmatch отмечает **4010 отличающихся пикселей (1,227%)** при `threshold: 0.1`, `includeAA: false`. [Ограничения сравнения и проекта](../docs/ARCHITECTURE.md#ограничения).
