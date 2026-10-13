# UI-компоненты

Общие элементы интерфейса. Выбор тарифа, квитанция, цены и состояние покупки находятся в `features/paywall`.

| Компонент   | Контракт                                                                                                                                                    |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `UiButton`  | `variant`: primary / secondary / ghost; `disabled`, `loading`; слоты default и trailing. Загрузка блокирует кнопку, задаёт `aria-busy` и скрывает trailing. |
| `UiSpinner` | Декоративный индикатор с `aria-hidden`, наследует цвет текста.                                                                                              |
| `UiMessage` | `tone`: info / error задаёт `role=status` / `role=alert`; `title` включает панель; слоты default и actions.                                                 |

[Токены](../assets/css/tokens.css) и [базовые стили](../assets/css/base.css) общие для приложения. Стили компонентов подключаются через scoped CSS; внешние отступы задаёт feature. Анимации отключаются при `prefers-reduced-motion`.

Компонентные тесты монтируют Vue в Happy DOM: [ui.test.ts](../../tests/components/ui.test.ts) проверяет примитивы, [paywall.test.ts](../../tests/components/paywall.test.ts) — экран со штатным `usePaywall` и подменой HTTP-порта. Они охватывают выбор тарифа, загрузку, ошибки, восстановление, истёкший повтор и фокус. Запуск: `npm test -- tests/components`.
