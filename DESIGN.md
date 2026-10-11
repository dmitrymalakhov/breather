---
name: Breather
description: Спокойный рабочий интерфейс рядом с очным разговором
colors:
  brand: "#c64d35"
  pinned-background: "#f0f3e8"
  accent: "#244f40"
  accent-light: "#e7ece4"
  accent-hover: "#183c30"
  text: "#233e35"
  muted: "#636c60"
  background: "#f6f4ee"
  paper: "#fffef9"
  line: "#dedfd4"
  nav-text: "#636c60"
  nav-hover: "#eeefe7"
  nav-selected: "#e7ece4"
  nav-selected-text: "#244f40"
  field-text: "#2f4439"
  field-line: "#d7dacd"
  field-focus: "#cfddc5"
  field-placeholder: "#697363"
  secondary-text: "#455c4c"
  secondary-line: "#dce0d3"
  secondary-hover: "#eeefe7"
  stop-background: "#eeece4"
  stop-text: "#57604f"
  stop-hover: "#e1e0d4"
  icon-text: "#7b8b91"
  icon-hover: "#eaf0ed"
  hint-line: "#dedfd4"
  pinned-line: "#bbc8aa"
  transcript-text: "#354b3e"
  hint-text: "#455849"
  demo-background: "#eaeedf"
  demo-text: "#526147"
  error-background: "#fff3ee"
  error-text: "#823b28"
typography:
  display:
    fontFamily: "'Onest Variable', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "clamp(46px, 4.7vw, 68px)"
    fontWeight: 570
    lineHeight: 1.06
    letterSpacing: "-0.04em"
  wordmark:
    fontFamily: "'Onest Variable', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "27px"
    fontWeight: 680
    lineHeight: 1.1
    letterSpacing: "-0.035em"
  headline:
    fontFamily: "'Onest Variable', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "27px"
    fontWeight: 580
    lineHeight: 1.25
    letterSpacing: "-0.035em"
  title:
    fontFamily: "'Onest Variable', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "17px"
    fontWeight: 580
    lineHeight: 1.4
    letterSpacing: "-0.025em"
  section-title:
    fontFamily: "'Onest Variable', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "16px"
    fontWeight: 580
    letterSpacing: "-0.015em"
  panel-title:
    fontFamily: "'Onest Variable', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "14px"
    fontWeight: 580
  body:
    fontFamily: "'Onest Variable', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "14px"
    lineHeight: 1.75
  hint-body:
    fontFamily: "'Onest Variable', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "13px"
    lineHeight: 1.8
  input:
    fontFamily: "'Onest Variable', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "13px"
  button:
    fontFamily: "'Onest Variable', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "12px"
    fontWeight: 550
  field-label:
    fontFamily: "'Onest Variable', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "12px"
  label:
    fontFamily: "'Onest Variable', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "11px"
  metadata:
    fontFamily: "'Onest Variable', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "10px"
    lineHeight: 1.5
rounded:
  tag: "4px"
  icon: "6px"
  field: "7px"
  button: "8px"
  avatar: "9px"
  brand: "10px"
  panel: "14px"
  capsule: "20px"
spacing:
  xs: "4px"
  inline: "8px"
  row: "12px"
  hint-gap: "14px"
  field-gap: "16px"
  content: "20px"
  column-gap: "22px"
  section: "24px"
  page-compact: "28px"
  page: "38px"
  page-wide: "48px"
  launch-gap: "72px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.paper}"
    typography: "{typography.button}"
    rounded: "{rounded.button}"
    padding: "10px 14px"
  button-primary-hover:
    backgroundColor: "{colors.accent-hover}"
  button-secondary:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.secondary-text}"
    typography: "{typography.button}"
    rounded: "{rounded.button}"
    padding: "10px 14px"
  button-secondary-hover:
    backgroundColor: "{colors.secondary-hover}"
  button-stop:
    backgroundColor: "{colors.stop-background}"
    textColor: "{colors.stop-text}"
    typography: "{typography.button}"
    rounded: "{rounded.button}"
    padding: "10px 14px"
  button-stop-hover:
    backgroundColor: "{colors.stop-hover}"
  button-text:
    textColor: "{colors.accent}"
    padding: "0"
  icon-button:
    textColor: "{colors.icon-text}"
    rounded: "{rounded.icon}"
    padding: "5px"
  icon-button-hover:
    backgroundColor: "{colors.icon-hover}"
    textColor: "{colors.accent}"
  input-field:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.field-text}"
    typography: "{typography.input}"
    rounded: "{rounded.field}"
    padding: "10px 12px"
  nav-item:
    textColor: "{colors.nav-text}"
    rounded: "{rounded.field}"
    padding: "11px 15px"
  nav-item-hover:
    backgroundColor: "{colors.nav-hover}"
  nav-item-selected:
    backgroundColor: "{colors.nav-selected}"
    textColor: "{colors.nav-selected-text}"
  status-badge:
    backgroundColor: "{colors.paper}"
    rounded: "{rounded.capsule}"
    typography: "{typography.label}"
    padding: "7px 11px"
  status-badge-live:
    backgroundColor: "{colors.accent-light}"
  hint-card:
    backgroundColor: "{colors.paper}"
    rounded: "{rounded.panel}"
    padding: "20px 22px"
  transcript-panel:
    backgroundColor: "{colors.paper}"
    rounded: "{rounded.panel}"
---

# Design System: Breather

## Overview

**Creative North Star: "Рядом с разговором"**

Breather сопровождает очный разговор: тёплая бумага, тёмные зелёные чернила и компактные рабочие элементы помогают читать короткими взглядами. Вермилионовый знак — две встречные речевые ленты, образующие знак диалога, — связывает продукт с разговором. Основные действия сохраняют спокойный зелёный цвет.

Система зафиксирована по `src/style.css`, `src/main.tsx` и `index.html`. Знак хранится в `public/brand/breather-symbol.png`, используется в шапке, на экране запуска и как favicon/apple-touch-icon. Композиция встречи и её режим записаны отдельно в `.impeccable/meeting.surface.md`; обновление идентичности сохраняет рабочую структуру встречи. Имена токенов frontmatter — извлечённые роли, а не обязательные названия CSS custom properties.

**Key Characteristics:**
- Тёплые светлые плоскости, тонкие границы и отсутствие теней.
- Зелёный акцент для действий и состояния; вермилион для знака и точки заголовка запуска.
- Локальный Onest Variable, читаемая кириллица и SVG-иконки Phosphor.
- Крупная типографика запуска, компактная типографика рабочего разговора.

## Colors

Основной акцент — глубокий зелёный; нейтральные поверхности имеют тёплый бумажный оттенок. Нормативные значения находятся в frontmatter; CSS использует `--accent`, `--accent-light`, `--accent-hover`, `--ink`, `--brand`, `--muted`, `--line`, `--paper` и `--field`.

### Primary
- **Глубокий зелёный (`accent`)**: основное действие, ссылки, активные точки состояния, закрепление и управление источниками.
- **Светлый зелёный (`accent-light`)**: подложки живого состояния и отметки «вы».
- **Глубокий зелёный (`accent-hover`)**: наведение на основную кнопку.
- **Выбранный раздел (`accent-light`, `accent`)**: светлая подложка и акцентный текст в верхней навигации.

### Secondary
- **Вермилион (`brand`)**: речевой знак и точка крупного заголовка запуска.

### Neutral
- **Тёплая бумага (`background`)**: рабочая область и прозрачная верхняя навигация.
- **Светлая бумага (`paper`)**: поля, лента разговора, подсказки и спокойные вторичные действия.
- **Зелёные чернила (`text`)**: главный текст и заголовки. `transcript-text` и `hint-text` задают более мягкое чтение длинного текста.
- **Сдержанный серый (`muted`)**: вспомогательный текст. Последние CSS-правила возвращают к этому токену метаданные, подсказки полей, подписи источников и времени; устаревшие более бледные объявления выше в файле не являются итоговым стилем.
- **Тонкая граница (`line`)**: разделители и панели; `field-line`, `secondary-line`, `hint-line` обслуживают соответствующие элементы.

Ошибки имеют тёплый фон `error-background` и текст `error-text`; демонстрация — светлый оливковый `demo-background` и `demo-text`. Это семантика состояния, а не дополнительные декоративные акценты.

**The State With Words Rule.** Цвет сопровождается текстом состояния: «Предварительно», «Дополнено по источникам», «На паузе», «Демонстрация»; точка не заменяет подпись.

## Typography

**Body Font:** Onest Variable с системным sans-serif fallback из frontmatter. Шрифт импортирован через `@fontsource-variable/onest` и включён в локальную сборку. Display использует то же семейство; отдельного моноширинного семейства нет. Время и раскрываемые метрики используют `font-variant-numeric: tabular-nums`.

Ровный UI-шрифт связывает кириллицу, английские термины и небольшие служебные подписи. Крупная типографика обслуживает название текущей задачи; встреча не превращается в рекламную страницу.

### Hierarchy
- **Display**: заголовок запуска, `clamp(46px, 4.7vw, 68px)`, weight 570, line-height 1.06; до 900 px — 54 px, до 680 px — 46 px/1.08, до 440 px — 43 px.
- **Wordmark**: строчное «breather», 27 px/1.1, weight 680; до 680 px — 24 px. Подпись «рядом с разговором» — 10 px, на мобильном 9 px.
- **Headline**: название страницы; роль `headline`, на ширине до 1100 px уменьшается до (24 px).
- **Title**: заголовок подсказки; роль `title`. Заголовки разделов настроек используют `section-title`, заголовки панелей — `panel-title`.
- **Body**: реплика; роль `body`, ограничение строки (70 ch), `overflow-wrap: anywhere`. До 850 px размер реплики становится (13 px). Текст просмотрщика документа сохраняет (14 px), line-height (1.8), предел (75 ch).
- **Hint Body**: текст подсказки; роль `hint-body`, переносы строк сохраняются через `white-space: pre-wrap`.
- **Field / Button / Label**: точные роли заданы в frontmatter. В мобильной кнопке размер уменьшается до (11 px).
- **Metadata**: этап подсказки, время и краткие технические сведения. Мелкий текст остаётся вторичным; основной ответ не переносится в эту роль.

**The Progressive Detail Rule.** Основная мысль видна сразу; источники, прежние подсказки и метрики раскрываются по действию пользователя.

## Layout

Система использует верхнюю навигацию и гибкий основной контейнер с ограничением 1440 px. Экран запуска ограничен 1120 px, настройки — 720 px. До старта показаны основное действие, микрофон и свёрнутые необязательные вводные; после старта — лента и подсказки. Дочерние области имеют `min-width: 0`, длинный текст переносится.

Запуск соединяет текст и действия в сетке `1.35fr / 1fr`, gap 72 px; блок действий отделён вертикальной линией 1 px и отступом слева 44 px. До 900 px gap уменьшается до 35 px, отступ — до 28 px. До 680 px запуск ограничен 460 px, колонки складываются, gap 28 px; разделитель становится верхней линией, отступ сверху 26 px. Верхний отступ запуска — `clamp(56px, 12vh, 128px)` на desktop, 66 px до 900 px, 32 px до 680 px и 26 px до 440 px.

Формы по умолчанию строятся в две колонки; секции настроек последовательные, контейнер настроек ограничен 720 px. Остальные вспомогательные страницы — 1050 px. Ритм не является единой 8-пиксельной сеткой: токены сохраняют наблюдаемые промежутки интерфейса.

Адаптация подтверждена CSS и снимком шириной (390 px):
- От 1500 px боковые отступы `main` становятся (48 px).
- До 1100 px `main` получает (28 px 24 px), управляющая строка допускает перенос.
- До 850 px лента и подсказки уплотняются, настройки сохраняют последовательное расположение. Навигация остаётся с текстовыми подписями.
- До 680 px `main` получает (25 px 16 px), лента располагается над подсказками. Микрофон и действия занимают отдельные строки; лента имеет высоту 380 px. До 440 px кнопки верхней навигации переходят в отдельную строку.

Особая двухколоночная композиция разговора и подсказок относится к поверхности встречи и описана в её brief.

## Elevation & Depth

Тени и размытие не используются. Глубину передают соседство тёплого фона и светлой бумажной плоскости, тонкая граница, отступ и локальная тональная заливка выбранного или закреплённого элемента. Закрепление меняет границу подсказки на `pinned-line`, а не поднимает карточку.

**The Flat Surface Rule.** Рабочие панели сохраняют плоскую геометрию; состояние показывается границей, фоном, иконкой и подписью.

## Shapes

Нормативные радиусы находятся в `rounded`: мягкая панель, более компактная кнопка, небольшое поле и точная иконная кнопка. Основные границы имеют толщину (1 px). Капсула применяется к статусу и возврату к новым репликам; круглые точки состояния используют (50%). Аватары голосов — маленькие скруглённые квадраты с первой буквой имени, а не фотографии.

Phosphor используется как настоящая SVG-библиотека: обычные контурные иконки, заполненный Play и заполненный PushPin для закреплённого состояния; бренд использует прозрачный растровый речевой знак, а waveform остаётся функциональной иконкой аудио. Размер следует функции элемента, обычно (14–24 px), в пустой ленте waveform крупнее. Буква участника в аватаре — текстовая метка, не замена SVG-иконке.

## Components

### Buttons

Основная кнопка — спокойное, ясно читаемое действие. Её цвет, типографика, радиус и padding заданы в `button-primary`; минимальная высота (39 px). Вторичная кнопка белая с тонкой границей `secondary-line`; завершение активной встречи использует серый `button-stop`. В состоянии паузы завершение отображается вторичной кнопкой.

Наведение меняет фон; нажатие сдвигает доступную кнопку вниз на (1 px). Переходы `background` и `transform` занимают (150 ms, ease). `:focus-visible` кнопок и ссылок имеет outline (2 px) в `accent`, с outline-offset (4 px). Disabled уменьшает opacity до (0.45), отменяет hover/active-эффект и не даёт выполнить действие. Текстовая кнопка не имеет заливки; иконная — компактный фон только при наведении, accessible name и видимый фокус.

### Chips / Status

Статус — не фильтр и не интерактивный chip. Компактная капсула соединяет точку и слова; `role="status"` обновляет состояние соединения. Активное состояние получает светлый акцент. Счётчик подсказок — небольшая прямоугольная метка. Закрепление является кнопкой с `aria-pressed`, иконкой fill и отдельным цветом.

### Cards / Containers

Светлые бумажные контейнеры используют роль `panel` (14 px); карточка подсказки получает padding 20 px 22 px, на мобильном 18 px. Закреплённая карточка использует `pinned-background` и `pinned-line`. Лента объединяет заголовок, самостоятельную прокрутку и нижнюю подпись; карточка подсказки содержит тип, действие закрепления, заголовок, основной текст, стадию и раскрываемые источники. Блоки источников отделены тонкой верхней линией, а не дополнительной вложенной карточкой.

Новая подсказка появляется за (200 ms) через opacity (0.8 → 1) и translateY (4 px → 0), easing `cubic-bezier(.2,.7,.3,1)`. Архивные карточки не анимируются. Индикатор потока — узкий мигающий курсор, загрузка — вращение CircleNotch. `prefers-reduced-motion: reduce` отключает все animations/transitions и возвращает обычную прокрутку.

### Inputs / Fields

Белое поле с ролью `input-field` и границей `field-line`; видимый label сохраняется вне поля. Фокус — граница `accent` и outline `field-focus` (2 px, offset 1 px). Placeholder служит примером; его итоговый цвет — `field-placeholder`. Парольные ключи не показывают сохранённое значение, а только подпись наличия. Ошибка действия выводится отдельным тёплым сообщением с `role="alert"`; специфического красного состояния поля в этой реализации нет.

Нативные select, checkbox, `details` и `summary` сохраняют клавиатурную семантику. Зона загрузки использует настоящий file input, допускает фокус и имеет собственный `:focus-within`. Редактирование имени открывает поле с `autoFocus`; Enter отправляет форму, отдельная кнопка отменяет редактирование. Неподтверждённые горячие клавиши или Escape-поведение не подразумеваются.

### Navigation

Шапка соединяет речевой знак размером 48 px и строчный wordmark с подписью «рядом с разговором». На мобильном знак — 42 px. Кнопки разделов соединяют Phosphor и видимый текст; выбранный раздел имеет `aria-current="page"`. Hover использует `nav-hover`, выбор — `nav-item-selected`. Кнопки имеют radius 7 px, padding 11 px 15 px, gap 8 px; до 680 px — padding 10 px 8 px, иконки 14 px. До 440 px навигация занимает отдельную строку.

### Launch identity

Речевой знак — 110 px перед заголовком запуска, 76 px на мобильном; прозрачный фон сохраняется. Вермилионовая точка завершает крупный заголовок. Блок действий содержит заголовок, выбор микрофона на бумажной подложке, зелёную кнопку высотой не менее 50 px, демонстрацию и краткое пояснение. Появление запуска занимает 550 ms, `cubic-bezier(.16,1,.3,1)`: translateY 8 px → 0, opacity .75 → 1 и clip-path inset 6 px → 0. Reduced motion отключает эффект.

### Transcript and Hints

Промежуточная реплика меняется на месте и помечена «уточняется»; у окончательной реплики сохраняются имя и время. Пропуск распознавания — самостоятельное текстовое сообщение. Имена пользователь редактирует вручную, отметка «вы» дополняет имя. Скролл вверх останавливает слежение; отдельная кнопка возвращает к новым репликам.

Три вида подсказок имеют смысловые подписи «Опора для ответа», «Понятие в разговоре», «Возможный вопрос». Ответ сначала «Предварительно», затем может стать «Дополнено по источникам»; старый контекст явно подписан. Источники раскрывают название, местоположение и использованный фрагмент, затем дают действие открытия. Видимые демонстрационные данные и метрики помечены как пример; значения скорости облачных API не превращаются в обещание интерфейса.

### Working mode variants

Рабочий режим встречи уплотняет существующие компоненты: шапка имеет минимальную высоту (56 px), знак (30 px), wordmark (22 px), подпись скрыта. До (680 px) шапка занимает минимум (52 px), знак (26 px), wordmark (18 px); навигация сохраняет доступные названия, показывает иконки (18 px) без видимого текста. Эти варианты относятся только к встрече; запуск и настройки используют обычные размеры системы.

Название встречи, текст состояния, микрофон, время и действия объединены в рабочей полосе. Название сокращается многоточием с полной подписью в `title`; рабочие кнопки имеют минимум (36 px), padding (8 px 12 px). Меню микрофона — нативный `details` с видимым уровнем и доступным названием; выбор устройства раскрывается на бумажной плоскости и доступен на паузе. Hover и открытое состояние используют `accent-light`; фокус сохраняет outline в `accent`.

Контекст — необязательная боковая панель с существующими `paper`, `line` и `panel`, открываемая кнопкой с `aria-expanded`. До (1000 px) она становится фиксированной плоскостью поверх рабочей области. Только перекрывающие поверхности используют структурную тень: контекст (0 12px 32px #233e3520), меню микрофона (0 8px 20px #233e3518). Лента и карточки ответов остаются плоскими.

### Mini answers

Мини-режим сохраняет бумажный фон, Onest и речевой знак; окно запрашивается размером (420 × 560 px). Внутри — компактная шапка, статус со временем и паузой/продолжением, самостоятельная прокрутка текущих ответов и нижняя подпись режима. Демонстрация и ошибки сохраняют явные текстовые метки. Основная вкладка остаётся владельцем встречи; мини-поверхность показывает те же ответы, закрепления и источники.

Карточка использует существующие цвет, границу и радиус подсказки, padding (14 px), заголовок (16 px), основной ответ (14 px / 1.7); метаданные и стадия сохраняют вторичные размеры. Внешние отступы мини-панели — (14 px), её высота следует `100dvh`; список получает `min-height: 0` и отдельную прокрутку. Возврат — иконная кнопка с доступным названием и обычным фокусом системы. Закрытие мини-окна не завершает встречу.

Окно Document Picture-in-Picture показывает подпись «Ответы поверх других окон»; обычное окно явно сообщает ограничение закрепления. Основная вкладка должна оставаться открытой. Возможность закрепления определяется API браузера, а не собственным визуальным состоянием приложения.

## Do's and Don'ts

### Do:
- **Do** Используйте токены существующей палитры и локальный Onest Variable для новых рабочих элементов.
- **Do** Сохраняйте видимые подписи состояния вместе с цветом и иконкой.
- **Do** Оставляйте основную мысль на уровне body; источники и метрики раскрывайте отдельно.
- **Do** Проверяйте новые элементы с клавиатуры и при `prefers-reduced-motion: reduce`.
- **Do** Переносите длинный русский текст, model ID и URL внутри гибких контейнеров.
- **Do** Сохраняйте явные метки демонстрации, предварительного ответа и прогноза.

### Don't:
- **Don't** Представляйте неподтверждённую подсказку или возможный вопрос как установленный факт разговора.
- **Don't** Подменяйте названия действий одной точкой состояния или SVG без accessible name.
- **Don't** Автоматически прокручивайте ленту, когда пользователь читает старые реплики.
- **Don't** Превращайте маленькие метаданные в основной текст ответа или добавляйте тени к плоским рабочим панелям.
- **Don't** Переносите демонстрационные p50/p95 в обещание скорости живой встречи.

## Localization — October 11, 2026

The wordmark is lowercase `breather`. Preserve the existing conversation symbol and palette. A compact English / Русский selector is always available in the header. On mobile, it wraps without widening the viewport; in the workspace, navigation uses labeled icon buttons. Language changes preserve form input and update mini-window labels and document language. English and Russian copy use the same hierarchy and responsive layout.
