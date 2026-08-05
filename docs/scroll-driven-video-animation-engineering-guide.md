# Scroll-Driven Video Animation: инженерный гайд

## 1. Назначение документа

Этот документ описывает, как спроектировать и реализовать кинематографический сайт, в котором прокрутка страницы управляет последовательностью кадров в hero-сцене. Тематика, сюжет, визуальный язык и тексты могут быть любыми. Неизменной остается инженерная модель:

```text
прокрутка пользователя
        ↓
ScrollTrigger / timeline
        ↓
требуемый номер кадра
        ↓
preloader и кэш изображений
        ↓
отрисовка кадра в canvas
        ↓
синхронные главы, текст и интерфейс
```

Документ можно использовать:

- как техническое задание для разработчика;
- как контекст для ИИ перед созданием нового проекта;
- как checklist для подготовки видео и кадров;
- как основу для code review, QA и оптимизации;
- как reference architecture для Astro, GSAP, Canvas и Lenis.

Примером служит проект `The Last Signal`, но его конкретные тексты, сюжет, цвета и изображения не являются обязательной частью системы.

### Быстрая навигация

- Концепция и storyboard: разделы 6-7.
- FFmpeg и генерация кадров: раздел 8.
- Manifest и компоненты: разделы 9-10.
- Preloader, canvas и runtime: разделы 11-14.
- GSAP, ScrollTrigger и Lenis: разделы 15-16.
- Responsive, визуальная обработка и post-hero: разделы 17-19.
- Accessibility, performance, QA и deployment: разделы 20-24.
- Ошибки и сравнительный анализ архитектур: разделы 25-26.
- Эталонная архитектура следующей версии: раздел 27.
- План нового проекта и готовое ТЗ для ИИ: разделы 28-31.

---

## 2. Что именно строится

Сайт состоит из двух крупных режимов.

### 2.1. Scroll-driven hero

Hero занимает много экранов по вертикали, но его видимая область закреплена на высоте viewport. Пока пользователь прокручивает длинную сцену:

- canvas остается закрепленным;
- номер отображаемого кадра меняется вперед или назад;
- текстовые главы появляются в заранее выбранных кадрах;
- глава может иметь паузу, даже если кадры в этот момент почти не меняются;
- после последнего кадра закрепление заканчивается;
- пользователь попадает в обычные HTML-секции.

### 2.2. Обычная страница после hero

После hero используются стандартные семантические секции. Они могут содержать:

- данные и телеметрию;
- карточки, табы и режимы просмотра;
- карты, схемы и canvas-инструменты;
- reveal-анимации;
- слабую параллакс-глубину;
- интерактивную финальную сцену;
- CTA и переход обратно к нужной главе hero.

Критическое правило: post-hero эффекты не должны менять механику hero и не должны конкурировать с основным scroll timeline.

---

## 3. Reference implementation: The Last Signal

Текущая реализация использует следующие параметры:

| Параметр | Значение |
| --- | --- |
| Исходные клипы | 4 ролика по 8 секунд |
| Master duration | 32 секунды |
| Исходная частота | 24 fps |
| Кадров до редакторских исправлений | 768 |
| Кадров после удаления дефектных стыков | 760 |
| Desktop variant | 1920 x 1080 WebP |
| Mobile variant | 1080 x 1350 WebP |
| Desktop transfer size | около 45.84 MB |
| Mobile transfer size | около 24.46 MB |
| Глав в hero | 5 |
| Высота scroll-stage | 1000svh desktop, 900svh mobile |
| Desktop/mobile breakpoint | 767 px |

Главы привязаны к монтажным точкам:

| Глава | Start | Focus | End |
| --- | ---: | ---: | ---: |
| opening | 1 | 53 | 129 |
| contact | 129 | 190 | 258 |
| threshold | 258 | 334 | 372 |
| origin | 372 | 494 | 562 |
| message | 562 | 692 | 760 |

Это пример, а не универсальные значения. В новом проекте точки выбираются после просмотра готовой последовательности кадров.

---

## 4. Технологический стек

### Основной стек

| Инструмент | Роль |
| --- | --- |
| Astro | статическая сборка, компоненты и HTML shell |
| TypeScript | типизация manifest и runtime-модулей |
| Canvas 2D | быстрая отрисовка текущего кадра |
| GSAP | построение монтажной timeline |
| GSAP ScrollTrigger | pin, scrub и связь timeline со скроллом |
| Lenis | сглаживание wheel-scroll и синхронизация со ScrollTrigger |
| FFmpeg | нормализация видео, монтаж, crop, scale и экспорт кадров |
| FFprobe | проверка codec, fps, размеров и длительности |
| WebP | формат кадров текущей реализации |
| Vercel | статический hosting и CDN |
| GitHub | version control и trigger автоматического deployment |

### Почему здесь нужен canvas

Набор кадров не следует рендерить как сотни тегов `<img>`. Canvas дает один стабильный визуальный слой и позволяет менять изображение без перестройки DOM.

Видео с ручным изменением `currentTime` выглядит проще, но часто дает:

- неточный seek между keyframes;
- задержки декодирования;
- рывки при обратном скролле;
- различия между браузерами;
- плохой контроль точного сюжетного кадра.

Image sequence тяжелее по количеству запросов, но дает детерминированный доступ к каждому кадру. Для narrative-scrollytelling это часто важнее.

### Минимальная установка

Точные версии следует фиксировать в lockfile. Базовый старт нового Astro-проекта:

```bash
npm create astro@latest
npm install gsap lenis
npm install -D @astrojs/check typescript
```

Если нужны локально размещенные шрифты:

```bash
npm install @fontsource-variable/space-grotesk @fontsource/ibm-plex-mono
```

FFmpeg и FFprobe должны быть доступны через `PATH`:

```powershell
winget install --id Gyan.FFmpeg --exact
ffmpeg -version
ffprobe -version
```

После установки FFmpeg на Windows обычно требуется перезапустить terminal.

Минимальные scripts в `package.json`:

```json
{
  "scripts": {
    "dev": "astro dev",
    "build": "astro build",
    "preview": "astro preview",
    "check": "astro check",
    "video:inspect": "node scripts/inspect-videos.mjs",
    "sequence:build": "node scripts/process-sequence.mjs",
    "sequence:validate": "node scripts/validate-sequence.mjs",
    "sequence:all": "npm run video:inspect && npm run sequence:build && npm run sequence:validate"
  }
}
```

---

## 5. Структура проекта

Рекомендуемая структура:

```text
project/
├─ docs/
│  ├─ sequence-manifest.md
│  ├─ video-processing-report.md
│  └─ visual-qa.md
├─ public/
│  └─ sequences/<sequence-id>/
│     ├─ desktop/frame-0001.webp
│     ├─ mobile/frame-0001.webp
│     ├─ posters/poster-desktop.webp
│     ├─ posters/poster-mobile.webp
│     └─ manifest.json
├─ scripts/
│  ├─ inspect-videos.mjs
│  ├─ process-sequence.mjs
│  ├─ validate-sequence.mjs
│  └─ lib/
├─ source-assets/
│  ├─ video/
│  └─ keyframes/
├─ src/
│  ├─ components/sequence/
│  ├─ components/sections/
│  ├─ scripts/sequence/
│  ├─ scripts/sections/
│  ├─ styles/
│  └─ pages/
└─ output/                 # временные отчеты и QA, gitignored
```

Не смешивать исходные видео, сгенерированные кадры и runtime-код. У этих слоев разные циклы обновления и разные причины ошибок.

---

## 6. Этап 1: идея, сюжет и storyboard

До разработки необходимо определить, что пользователь увидит во время прокрутки.

### 6.1. Сформулировать сюжет одной строкой

Пример структуры:

```text
Пользователь движется из точки A через B и C, обнаруживает D и получает финальный вывод E.
```

Хорошая scroll-driven сцена имеет направление и развитие. Просто красивое видео без событий быстро превращается в длинный декоративный фон.

### 6.2. Разделить сюжет на главы

Для каждой главы определить:

- `id`;
- название;
- короткий eyebrow;
- основной headline;
- поясняющий текст;
- визуальный момент, на котором текст должен читаться;
- сторону размещения текста;
- начало появления;
- focus frame;
- конец главы.

Рабочая таблица:

| id | Событие | Визуальный focus | Текст | Выравнивание |
| --- | --- | --- | --- | --- |
| opening | знакомство с миром | широкий establishing shot | название проекта | left |
| chapter-1 | первое событие | главный объект справа | причина движения | left |
| chapter-2 | переход | объект слева | новая информация | right |
| finale | развязка | симметричная композиция | финальное сообщение | center |

### 6.3. Планировать negative space

При генерации или съемке видео заранее оставлять свободное пространство для текста. Текст нельзя размещать поверх самого важного объекта только потому, что кадр уже готов.

Для каждой главы отметить:

- безопасную левую зону;
- безопасную правую зону;
- мобильный crop;
- контраст фона;
- движущиеся объекты, которые могут пройти под текстом.

### 6.4. Ограничить продолжительность

Длинная исходная сцена быстро увеличивает transfer size.

Формула количества кадров:

```text
frameCount = durationSeconds x samplingFps
```

Примеры:

| Duration | FPS | Frames |
| ---: | ---: | ---: |
| 20 s | 24 | 480 |
| 30 s | 24 | 720 |
| 40 s | 24 | 960 |

Для большинства промо-историй разумный диапазон составляет 15-35 секунд исходного движения. Длина скролла не равна длительности видео: паузы и текстовый ритм добавляются timeline.

---

## 7. Этап 2: подготовка видео

### 7.1. Требования к исходным клипам

Желательно получить:

- одинаковое разрешение;
- одинаковый fps;
- constant frame rate;
- одинаковый pixel format;
- близкую экспозицию и цвет;
- совпадающее направление движения камеры;
- чистые первые и последние кадры каждого перехода;
- отсутствие резкого изменения масштаба на стыках.

### 7.2. Если видео сгенерировано ИИ

Проверять покадрово:

- деформацию архитектуры и лиц;
- плавающие мелкие детали;
- внезапное появление объектов;
- изменение геометрии дверей, окон, техники;
- реверс движения камеры на 1-3 кадра;
- скачок света или цветовой температуры;
- несовпадение последнего кадра одного клипа с первым кадром следующего.

Лучший способ скрыть артефакт не CSS-фильтр, а редакторское решение:

1. Удалить поврежденные кадры.
2. Перегенерировать короткий переход.
3. Изменить crop, если дефект находится у края.
4. Ускорить проблемный микроучасток.
5. Поставить текст или интерфейс только там, где это композиционно оправданно.
6. Использовать очень слабое статичное зерно для визуального объединения кадров.

Не применять глобальное затемнение, grayscale, blur или aggressive contrast без A/B-проверки. Такие фильтры часто ухудшают хорошую часть изображения, но не скрывают геометрические AI-артефакты.

### 7.3. Сделать contact sheets

До экспорта сотен кадров создать контактные листы с 1 кадром в секунду. Они помогают быстро проверить:

- сюжетную последовательность;
- стыки;
- композицию;
- mobile-safe область;
- пригодность сцен для текста.

В reference project это делает `npm run video:inspect`.

---

## 8. Этап 3: media pipeline через FFmpeg

### 8.1. Нормализация

Каждый ролик приводится к единому стандарту:

```bash
ffmpeg -i input.mp4 \
  -map 0:v:0 -an \
  -vf "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,fps=24" \
  -c:v libx264 -preset slow -crf 15 -pix_fmt yuv420p \
  normalized.mp4
```

Параметры необходимо адаптировать под проект. Главное, чтобы все сегменты после нормализации имели одинаковые свойства.

### 8.2. Сборка master

Нормализованные файлы объединяются в master-video. Если codec-параметры совпадают, можно использовать concat без повторного кодирования.

### 8.3. Экспорт desktop sequence

Пример:

```bash
ffmpeg -i master.mp4 \
  -vf "fps=24,scale=1920:1080:flags=lanczos" \
  -c:v libwebp -quality 38 -compression_level 6 \
  -start_number 1 frame-%04d.webp
```

### 8.4. Экспорт mobile sequence

Mobile нельзя считать простым уменьшенным desktop. Нужен отдельный crop:

```bash
ffmpeg -i master.mp4 \
  -vf "fps=24,crop=864:1080:x=528:y=0,scale=1080:1350:flags=lanczos" \
  -c:v libwebp -quality 18 -compression_level 6 \
  -start_number 1 frame-%04d.webp
```

Crop может двигаться по времени, если главный объект меняет положение. В reference project crop переключается перед четвертым переходом, чтобы сохранить важный объект в кадре.

### 8.5. Редакторское удаление дефектных кадров

Если после concatenation появились плохие кадры:

1. Зафиксировать номера или time windows.
2. Удалить одинаковые кадры в desktop и mobile.
3. Перенумеровать оставшиеся файлы без разрывов.
4. Пересчитать manifest и главы.
5. Повторно прогнать полную валидацию.

Нельзя удалить кадры только в одном variant. Это нарушит синхронизацию desktop/mobile.

### 8.6. Постеры

Нужны отдельные poster-файлы для desktop и mobile. Они используются:

- до появления первого canvas-кадра;
- при отключенной анимации;
- при Save-Data;
- на слабом устройстве;
- если manifest или кадры недоступны;
- как Open Graph preview, если это подходит композиционно.

---

## 9. Manifest как контракт системы

Manifest связывает media pipeline, DOM и runtime.

```json
{
  "version": 1,
  "frameCount": 760,
  "samplingFps": 24,
  "desktop": {
    "path": "/sequences/project/desktop/frame-{frame}.webp",
    "width": 1920,
    "height": 1080
  },
  "mobile": {
    "path": "/sequences/project/mobile/frame-{frame}.webp",
    "width": 1080,
    "height": 1350
  },
  "poster": {
    "desktop": "/sequences/project/posters/poster-desktop.webp",
    "mobile": "/sequences/project/posters/poster-mobile.webp"
  },
  "chapters": [
    {
      "id": "opening",
      "frameStart": 1,
      "frameFocus": 48,
      "frameEnd": 120,
      "eyebrow": "Chapter label",
      "title": "Project title",
      "body": "Short supporting sentence.",
      "align": "left"
    }
  ]
}
```

### Инварианты manifest

- номера кадров начинаются с 1;
- имена имеют одинаковое количество цифр;
- `frameCount` совпадает с количеством файлов в обоих variants;
- `frameStart <= frameFocus <= frameEnd`;
- все точки находятся в диапазоне `1..frameCount`;
- порядок глав соответствует сюжету;
- `id` совпадает с `data-chapter` в DOM;
- URL постеров и шаблоны кадров существуют;
- manifest генерируется скриптом, а не редактируется случайно вручную.

### Важное улучшение

В reference project текст глав присутствует и в runtime config, и в генераторе manifest. Это потенциальный drift. В следующем проекте должен быть один источник данных, например `src/content/sequence.json`, из которого одновременно строятся:

- Astro-компоненты;
- manifest;
- типы или validation schema;
- документация chapter map.

---

## 10. HTML и компонентная архитектура

Минимальный hero shell:

```astro
<section class="sequence-stage" data-sequence data-mode="booting">
  <div class="sequence-viewport" data-sequence-viewport>
    <canvas class="sequence-canvas" aria-hidden="true"></canvas>

    <picture class="sequence-fallback">
      <source media="(max-width: 767px)" srcset={mobilePoster} />
      <img src={desktopPoster} alt="Описание сцены" />
    </picture>

    <div class="sequence-treatment" aria-hidden="true"></div>

    <div class="sequence-chapters">
      <!-- semantic article for every chapter -->
    </div>

    <div data-sequence-loader>Loading sequence...</div>
  </div>
</section>
```

### Почему stage и viewport разделены

`sequence-stage` создает вертикальную дистанцию прокрутки. `sequence-viewport` является видимым экраном и pin-элементом.

```css
.sequence-stage {
  height: 1000svh;
}

.sequence-viewport {
  width: 100%;
  height: 100svh;
  overflow: hidden;
}
```

`pinSpacing: false` работает потому, что дистанцию уже создает stage. Изменять это без понимания нельзя: можно получить двойную высоту или преждевременное окончание hero.

---

## 11. Runtime initialization

Правильный порядок запуска:

1. Найти stage, viewport, canvas и loader.
2. Проверить capabilities.
3. Включить fallback, если full motion недоступен.
4. Загрузить manifest.
5. Выбрать desktop или mobile variant.
6. Создать preloader.
7. Создать canvas renderer.
8. Загрузить poster.
9. Подготовить backing store canvas с учетом DPR.
10. Предзагрузить первые кадры.
11. Переключить stage из `loading` в `active`.
12. Запустить Lenis.
13. Создать GSAP timeline.
14. Загрузить priority frames возле focus points.
15. В фоне продолжить загрузку остальных кадров.
16. Подписать resize, visibility и pagehide cleanup.

Не создавать ScrollTrigger до появления drawable poster или первых кадров. Иначе пользователь может увидеть пустой canvas.

---

## 12. Capability detection и fallback

Full sequence следует отключать, если:

- включен `prefers-reduced-motion: reduce`;
- браузер сообщает `Save-Data`;
- устройство имеет очень мало памяти;
- Canvas 2D недоступен;
- manifest не загрузился;
- критические кадры не декодируются.

Fallback не должен быть пустым hero. Он должен содержать:

- responsive poster;
- все смысловые главы обычными HTML-блоками;
- рабочий переход к следующим секциям;
- skip-link;
- доступные тексты без зависимости от canvas.

Пример состояния:

```html
<section data-mode="fallback" data-fallback-reason="reduced-motion">
```

Fallback является частью продукта, а не сообщением об ошибке.

---

## 13. Preloader

### 13.1. Приоритет загрузки

Не ждать все сотни кадров перед показом hero. Рекомендуемый порядок:

1. Poster.
2. Стартовый runway: первые 24-36 кадров, идущих строго подряд.
3. Окно вокруг текущей позиции с приоритетом в направлении скролла.
4. Следующий последовательный runway, например кадры 37-96.
5. `frameFocus - 2 .. frameFocus + 2` ближайшей следующей главы.
6. Focus-окна остальных глав.
7. Остальная последовательность с низким приоритетом.

Focus-кадры последних глав не должны вытеснять кадры, которые пользователь увидит в ближайшие секунды. Если после загрузки `1-18` очередь сразу переходит к кадрам `190`, `334`, `494` и `692`, обычный начальный скролл останется без кадров `19-80`.

При каждом новом запросе renderer должен передавать preloader:

- целевой кадр;
- предыдущий целевой кадр;
- направление движения;
- скорость изменения целевого кадра.

Пример окна для движения вперед:

```text
target = 94
urgent = 94
forward window = 95..142
backward safety = 93..74
```

При движении назад пропорции окна зеркально меняются. Размер окна адаптируется по viewport, памяти, типу соединения и средней величине кадра.

### 13.2. Ограничение concurrency

Использовать worker queue, например 6-8 параллельных запросов. Сотни одновременных запросов создают contention, ухудшают first render и могут перегрузить mobile browser.

### 13.3. Дедупликация

Для каждого номера хранить Promise активного запроса. Повторный запрос того же кадра не должен создавать второй network request.

### 13.4. Nearest-frame fallback

Если точный кадр еще не готов, renderer должен показать ближайший загруженный кадр. Это лучше, чем очищать canvas или показывать белую вспышку.

```text
requested 203 отсутствует
202 загружен -> рисуем 202
после загрузки 203 -> перерисовываем 203
```

Fallback требует различать два номера:

```text
requestedFrame = кадр, который требует timeline
displayedFrame = кадр, который действительно нарисован в canvas
```

Нельзя после отрисовки fallback-кадра записывать `displayedFrame = requestedFrame`. Иначе, когда точный кадр загрузится, renderer ошибочно решит, что он уже показан.

Правильный контракт:

```ts
const candidate = cache.getExact(requestedFrame)
  ?? cache.getNearest(requestedFrame)
  ?? poster;

draw(candidate.image);
displayedFrame = candidate.frameIndex;
```

Если `displayedFrame !== requestedFrame`, завершение загрузки точного кадра обязано поставить новый render request, даже когда scroll уже остановился.

### 13.5. Ограничение текущей реализации

Reference preloader сохраняет все загруженные `HTMLImageElement` в памяти. Теоретический decoded size одного 1920 x 1080 RGBA-кадра составляет около 7.9 MB. Браузер может управлять декодированными ресурсами самостоятельно, но постоянный кэш 760 элементов создает риск высокого memory pressure.

Для следующей версии рекомендуется:

- LRU cache;
- постоянное хранение только poster, focus frames и окна вокруг текущего кадра;
- окно примерно `currentFrame +/- 24..60` кадров;
- удаление дальних кадров из JS cache;
- предварительная загрузка в направлении текущего скролла;
- меньший window на слабых устройствах;
- retry с ограниченным exponential backoff для failed frames.

Недостаточно удалить кадр только из основного `cache`. Если `requests` хранит завершенные `Promise<HTMLImageElement>`, такой Promise продолжает удерживать изображение. Для реального освобождения памяти необходимо:

- удалять завершенный Promise из `requests` после переноса результата в cache;
- либо хранить в `requests` только активные операции;
- при использовании `ImageBitmap` вызывать `bitmap.close()` во время eviction;
- не сохранять одновременно все decoded images и все resolved promises.

### 13.6. Единый scheduler вместо нескольких очередей

Несколько параллельных вызовов `loadMany()` легко нарушают общий лимит concurrency. Нужна одна очередь задач с уровнями приоритета:

```text
0 critical: exact requested frame
1 urgent: direction-aware window
2 runway: ближайшие последовательные кадры
3 chapter: focus frames
4 background: остальная sequence
```

Scheduler владеет общим `inFlight`, например `4-8`, дедуплицирует задачи и позволяет повысить приоритет уже поставленного кадра. Background worker не должен занимать все соединения, если пользователь запросил еще не загруженный кадр.

---

## 14. Canvas renderer

### 14.1. Backing store и DPR

CSS-размер canvas и его внутреннее разрешение различаются:

```ts
const dpr = Math.min(window.devicePixelRatio || 1, 2);
canvas.width = Math.round(canvas.clientWidth * dpr);
canvas.height = Math.round(canvas.clientHeight * dpr);
```

Ограничение DPR до 2 уменьшает нагрузку на GPU и память на экранах с очень высокой плотностью.

### 14.2. Cover-отрисовка

Canvas должен вести себя как `object-fit: cover`:

```ts
const scale = Math.max(canvasWidth / imageWidth, canvasHeight / imageHeight);
const width = imageWidth * scale;
const height = imageHeight * scale;
const x = (canvasWidth - width) / 2;
const y = (canvasHeight - height) / 2;
context.drawImage(image, x, y, width, height);
```

### 14.3. Один render на animation frame

Scroll может вызвать много updates за один browser frame. Renderer должен сохранить последний requested frame и выполнить максимум одну отрисовку через `requestAnimationFrame`.

Это предотвращает очередь устаревших draw calls.

Renderer должен coalesce запросы, но не путать желаемое и фактическое состояние:

```ts
type RenderState = {
  requestedFrame: number;
  displayedFrame: number;
  rafId: number;
};
```

Проверка `displayedFrame === requestedFrame` допустима только если canvas действительно содержит exact frame. Если был нарисован nearest fallback, `displayedFrame` остается номером fallback, и новый decoded exact frame должен пройти проверку.

Полезно возвращать из cache не только image, но и его identity:

```ts
type FrameCandidate = {
  frameIndex: number;
  image: CanvasImageSource;
  exact: boolean;
};
```

Сам `drawImage()` обычно не является причиной рывка. Чаще причина в том, что нужный drawable asset отсутствует, decoder занят или renderer неверно считает fallback уже отрисованным exact frame.

### 14.4. Resize

На resize:

- пересчитать backing store;
- сбросить marker последнего кадра;
- повторно запросить текущий кадр;
- не менять scroll progress;
- не создавать второй timeline.

---

## 15. GSAP timeline и режиссура скролла

### 15.1. Базовый ScrollTrigger

```ts
gsap.timeline({
  defaults: { ease: "none" },
  scrollTrigger: {
    trigger: stage,
    start: "top top",
    end: "bottom bottom",
    pin: viewport,
    pinSpacing: false,
    scrub: 0.55,
    anticipatePin: 1,
    invalidateOnRefresh: true,
  },
});
```

### 15.2. Duration в scrub timeline

В scrub timeline `duration` является относительным весом участка, а не реальным временем в секундах. ScrollTrigger растягивает сумму duration на общую scroll distance.

Если один tween имеет duration 4, а другой 1, первый получит примерно в четыре раза больше scroll distance.

### 15.3. Переход по кадрам

Reference implementation использует:

```ts
const travelFrames = chapter.frameFocus - previousFrame;
const duration = Math.max(1.4, travelFrames / samplingFps);

timeline.to(frameState, {
  current: chapter.frameFocus,
  duration,
  ease: "none",
  onUpdate: () => renderFrame(frameState.current),
});
```

Деление на `samplingFps` дает естественный относительный вес длинным переходам. Минимальная duration не позволяет коротким переходам пролетать слишком быстро.

### 15.4. Паузы для чтения

После появления главы можно добавить пустой tween:

```ts
timeline.to({}, { duration: 1.2 });
```

Кадр в этот момент остается почти статичным, но пользователь продолжает скроллить. Это создает время для чтения без изменения исходного видео.

### 15.5. Текстовые анимации

Безопасный cinematic reveal:

- контейнер: `autoAlpha` и `y`;
- eyebrow: короткий fade/translate;
- headline: небольшой vertical reveal через `clip-path`;
- body: запаздывание 0.1-0.15 timeline units;
- выход: fade и движение вверх;
- никаких изменений текста и layout coordinates во время scroll;
- общая длительность вложенных reveal не должна удлинять frame timeline случайно.

На mobile clip-path можно ослабить или отключить, чтобы не получить обрезание длинных слов.

### 15.6. Reverse scroll

Timeline обязана работать симметрично назад. Проверять:

- возвращается ли предыдущий кадр;
- восстанавливается ли `clip-path` заголовка;
- не остается ли скрытым body;
- не возникает ли пустая сцена между главами;
- соответствует ли текст тому же frameFocus при обратном движении.

---

## 16. Lenis и синхронизация

Lenis не заменяет ScrollTrigger. Он нормализует пользовательский ввод, а ScrollTrigger управляет timeline.

Интеграция:

```ts
const lenis = new Lenis({
  lerp: 0.08,
  smoothWheel: true,
  syncTouch: false,
  wheelMultiplier: 0.9,
});

lenis.on("scroll", ScrollTrigger.update);

const tick = (time: number) => lenis.raf(time * 1000);
gsap.ticker.add(tick);
gsap.ticker.lagSmoothing(0);
```

Рекомендации:

- не включать aggressive smooth touch;
- не создавать несколько Lenis instances;
- останавливать Lenis, когда document hidden;
- удалять ticker callback на pagehide;
- не смешивать CSS `scroll-behavior: smooth` с Lenis;
- после динамического изменения высоты вызывать `ScrollTrigger.refresh()`.

---

## 17. Responsive strategy

### 17.1. Отдельный mobile media variant

Desktop 16:9, обрезанный через cover на портретном экране, часто теряет главный объект. Поэтому нужен отдельный mobile crop.

Mobile variant должен проверяться на:

- 320 x 720;
- 360 x 800;
- 390 x 844;
- 430 x 932;
- landscape mobile, если он поддерживается.

### 17.2. Позиции текста

На desktop допустимы left/right/center композиции. На mobile надежнее привести главы к одному нижнему левому anchor:

```css
@media (max-width: 767px) {
  .sequence-chapter {
    left: var(--page-pad);
    right: var(--page-pad);
    top: auto;
    bottom: 7rem;
    width: auto;
    text-align: left;
  }
}
```

### 17.3. Breakpoint lifecycle

В reference project variant выбирается один раз при initialization. Если пользователь изменит ориентацию и пересечет breakpoint, canvas продолжит использовать первоначальный variant.

Для улучшенной версии:

- слушать `matchMedia(...).change`;
- сохранять текущий normalized progress;
- уничтожать старый preloader/renderer;
- переключать variant;
- загружать poster и ближайшее окно кадров;
- восстанавливать тот же сюжетный кадр;
- не создавать дублирующий ScrollTrigger.

Для вторичных desktop-only эффектов использовать `gsap.matchMedia()`, чтобы triggers автоматически создавались и удалялись.

---

## 18. Визуальная обработка hero

Визуальный treatment должен улучшать читаемость и единство кадров, но не скрывать исходное изображение.

Допустимые приемы:

- слабая статичная film grain texture;
- очень тонкие scanlines для технической эстетики;
- локальная gradient-подложка только под текстом;
- мягкая vignette;
- text-shadow вместо сильного затемнения всего кадра;
- цветовые акценты UI, не меняющие сам frame;
- маска или overlay, согласованные с тематикой.

Осторожно использовать:

- глобальный grayscale;
- saturation ниже исходной;
- blur;
- сильный contrast;
- animated noise на каждом кадре;
- mix-blend-mode поверх важных объектов;
- тяжелые CSS filters на полноэкранном canvas.

Порядок принятия решения:

1. Проверить исходные кадры без treatment.
2. Исправить дефекты монтажом или regeneration.
3. Добавить локальную читаемость текста.
4. Добавить слабый общий texture только после A/B.
5. Проверить светлые и темные главы отдельно.
6. Не оставлять эффект, если он делает хороший кадр хуже.

---

## 19. Секции после hero

Post-hero часть должна продолжать историю, а не выглядеть как случайный набор карточек.

### 19.1. Reveal

Использовать reveal на отдельных смысловых блоках, а не одновременно на всей секции:

```ts
gsap.fromTo(target,
  { autoAlpha: 0, y: 28 },
  {
    autoAlpha: 1,
    y: 0,
    duration: 0.9,
    ease: "power2.out",
    scrollTrigger: {
      trigger: target,
      start: "top 88%",
      once: true,
    },
  }
);
```

### 19.2. Параллакс-глубина

Применять только к крупному фоновому слою:

- карта с амплитудой 4-8 px;
- фоновое изображение final с амплитудой 12-20 px;
- очень слабый scale 1.00-1.05;
- без изменения размеров layout box;
- только через transform или CSS custom properties;
- отключать на mobile и reduced motion.

### 19.3. Интерактивные приборы

Canvas/ SVG-инструмент должен:

- обновляться только когда видим через IntersectionObserver;
- реагировать на ResizeObserver;
- ограничивать animation loop примерно 30 fps, если 60 fps не требуется;
- иметь статичное reduced-motion состояние;
- не быть единственным источником информации;
- иметь кнопки с `aria-pressed` или табы с корректным ARIA.

### 19.4. Hover и pointer depth

- hover только в `@media (hover: hover) and (pointer: fine)`;
- pointer depth не более нескольких пикселей;
- не изменять layout;
- использовать отдельные CSS variables, чтобы не перезаписывать GSAP transform;
- на pointerleave возвращать значения к нулю.

---

## 20. Accessibility

Минимальные требования:

- canvas имеет `aria-hidden="true"`;
- poster имеет содержательный alt;
- narrative copy существует в HTML;
- есть skip-link после длинной cinematic sequence;
- keyboard focus видим;
- интерактивные mode controls являются кнопками;
- tabs используют `aria-selected`, `aria-controls` и корректные panels;
- status changes используют `aria-live`, если они важны;
- reduced-motion пользователь получает полноценный fallback;
- декоративные SVG и overlays скрыты от accessibility tree;
- контраст текста проверен на каждом focus frame.

Не помещать смысловой текст внутрь canvas. Он станет недоступным для screen reader, поиска, перевода и адаптивной верстки.

---

## 21. Performance budget

Бюджет определять до экспорта кадров.

Рекомендуемые цели для cinematic microsite:

| Метрика | Желаемая цель |
| --- | --- |
| Initial critical images | 18-36 последовательных кадров + poster |
| Initial blocking transfer | не ждать всю sequence |
| Concurrent image requests | 6-8 |
| Canvas DPR | максимум 2 |
| Desktop full sequence | желательно до 40-60 MB |
| Mobile full sequence | желательно до 20-30 MB |
| Main-thread long tasks | избегать > 50 ms |
| Console errors | 0 |
| Horizontal overflow | 0 |

Это не абсолютные нормы. Если аудитория использует быстрые exhibition kiosks, budget может быть выше. Для массового mobile traffic он должен быть ниже.

### CDN и caching

Кадры должны раздаваться через CDN с длительным immutable cache только при версионированных URL. Если новая генерация перезаписывает `frame-0001.webp` по тому же адресу, годовой browser cache может оставить пользователю старые кадры.

Безопасные варианты:

```text
/sequences/project/v3/desktop/frame-0001.webp
/sequences/project/desktop/frame-0001.ab12cd34.webp
/sequences/project/desktop/frame-0001.webp?v=manifest-hash
```

Manifest и HTML могут иметь короткий cache/revalidation, а versioned media:

```http
Cache-Control: public, max-age=31536000, immutable
```

Для production важно проверить browser cache, а не только CDN HIT. Заголовок `max-age=0` заставляет браузер revalidate кадры при следующем посещении, даже если edge CDN уже прогрет.

Проверить:

- HTTP 200 для representative frames;
- корректный `Content-Type: image/webp`;
- cache headers;
- отсутствие HTML 404 page под видом image response;
- работу range/CDN не требуется для отдельных image files;
- отсутствие случайного попадания source videos в production bundle.

---

## 22. Валидация media

Автоматический validator должен проверять:

- manifest существует и читается;
- desktop/mobile frame count совпадает;
- последовательность имен непрерывна;
- нет zero-byte файлов;
- первый и последний кадры имеют нужный codec и dimensions;
- FFmpeg может декодировать всю последовательность;
- posters существуют;
- chapter fields целые и находятся в диапазоне;
- желательно `start <= focus <= end` и отсутствие обратного порядка глав;
- общий размер variants выводится в отчет.

Reference command:

```bash
npm run sequence:validate
```

Валидация файлов не заменяет visual QA. Она не заметит плавающую геометрию, неудачный crop или сюжетный jump.

---

## 23. QA matrix

### 23.1. Обязательные команды

```bash
npm run check
npm run build
npm run sequence:validate
git diff --check
```

### 23.2. Desktop browser QA

Проверить минимум на 1440 x 900:

- первый кадр;
- каждый chapter focus;
- последний кадр;
- прямой скролл;
- обратный скролл;
- быстрое перемещение scrollbar;
- медленный wheel scroll;
- окончание pin без скачка;
- переход в следующую секцию;
- loader и poster;
- console errors и warnings;
- network failures;
- horizontal overflow.

### 23.3. Mobile browser QA

Проверить минимум 390 x 844 и 320 x 720:

- правильный mobile crop;
- главный объект не потерян;
- заголовки помещаются;
- body не перекрывает нижний interface;
- нет горизонтального overflow;
- touch scroll не блокируется;
- sequence не меняет высоту скачком;
- post-hero controls доступны;
- final footer и counters не пересекаются.

### 23.4. Специальные сценарии

- `prefers-reduced-motion: reduce`;
- Save-Data;
- CPU throttling;
- медленная сеть;
- один отсутствующий frame;
- manifest 404;
- tab hidden/visible;
- resize через breakpoint;
- orientation change;
- повторный вход через browser back;
- deployment URL, а не только localhost.

---

## 24. Deployment

Для статического Astro-проекта:

1. `npm run build` создает `dist/`.
2. GitHub хранит source и generated public sequence.
3. Vercel подключается к repository.
4. Production branch обычно `main`.
5. Push в `main` запускает deployment.
6. После deployment проверить production URL и representative frame URLs.

Не коммитить:

- `node_modules/`;
- `dist/`;
- `.astro/`;
- временные contact sheets;
- локальные screenshots;
- секреты и токены;
- лишние style references;
- master intermediates, если они не нужны для воспроизводимости.

Большие sequence assets могут приблизить repository к ограничениям Git. Для более крупных проектов рассмотреть Git LFS, object storage или CDN upload pipeline.

---

## 25. Типовые ошибки

### Пустой canvas при старте

Причина: timeline запущена до загрузки poster/первых кадров.

Исправление: сначала drawable asset, затем active mode и timeline.

### Кадры дергаются при быстром скролле

Причина: нет nearest-frame fallback, request deduplication, RAF batching или demand-driven priority queue.

Исправление: держать requested frame, рисовать максимум один раз за animation frame, загружать окно вокруг текущего положения.

### Камера сначала стоит, затем телепортируется

Типичный сценарий холодного старта:

```text
загружены кадры 1..18
пользователь уже прокрутил hero
timeline запрашивает кадр 94
renderer показывает ближайший кадр 18
кадр 94 загружается позднее
canvas скачком переходит 18 -> 94
```

Возможные причины:

- страница разрешает далеко прокрутиться во время initial loading;
- после initial batch очередь уходит к дальним focus frames;
- exact requested frame не повышает приоритет загрузки;
- fallback ошибочно записывается как уже отрисованный requested frame;
- несколько background workers заняли весь concurrency.

Исправление:

1. Не менять scroll-to-frame mapping.
2. Исправить identity `requestedFrame` / `displayedFrame`.
3. Загружать exact target и direction window раньше background frames.
4. Делать initial runway последовательным.
5. Скрывать loader только после готовности стартового или актуального target-window.

Блокировка scroll на время loader допустима только как короткий измеренный fallback. Она скрывает слабость preloader и может создавать плохой UX на медленной сети, поэтому demand-driven loading предпочтительнее.

### Обратный скролл показывает неправильный текст

Причина: текст анимируется отдельными независимыми ScrollTriggers.

Исправление: главы hero должны находиться внутри той же scrub timeline, что и frameState.

### Hero внезапно становится в два раза длиннее

Причина: одновременно используется высокий stage и стандартный `pinSpacing: true`.

Исправление: выбрать одну модель scroll distance. В этой архитектуре stage задает высоту, поэтому `pinSpacing: false`.

### На mobile исчез главный объект

Причина: desktop sequence просто рисуется через cover.

Исправление: отдельный mobile crop и покадровая проверка focus points.

### Появляется белая вспышка

Причина: canvas очищается, но новый image еще не decoded.

Исправление: не очищать предыдущий кадр; использовать nearest loaded frame или poster.

### Loader никогда не заканчивается

Причина: ожидание всех кадров или необработанные failed requests.

Исправление: активировать сцену после initial batch; ошибки считать отдельно; остальное загружать в фоне.

### Сайт выглядит слишком темным и серым

Причина: глобальный CSS filter или слишком сильный overlay.

Исправление: вернуть исходный canvas, улучшать локальный контраст текста и проверять treatment по главам.

### Desktop эффекты остаются на mobile

Причина: `matchMedia().matches` проверен только один раз.

Исправление: использовать `gsap.matchMedia()` с cleanup или подписку на MediaQueryList change.

---

## 26. Сравнение reference-архитектур

Ни одна реализация не является лучшей по всем параметрам. Плавность зависит от четырех разных задач:

1. cold start и доступность ближайших кадров;
2. стоимость random access или video seek;
3. стабильность main thread и decoder;
4. соответствие displayed frame текущей scroll-позиции.

Сравнивать проекты только после полного прогрева cache неправильно: большинство пользовательских жалоб возникает на первом открытии и мобильной сети.

### 26.1. Сводная таблица

| Проект | Media model | Scroll engine | Сильная сторона | Основной риск |
| --- | --- | --- | --- | --- |
| The Last Signal | 760 WebP в четырех byte-identical frame packs на variant | Canvas 2D + GSAP + ScrollTrigger + Lenis | точный кадр, надежный reverse, общая timeline текста и media | высокий decoded memory, обязательный startup preload |
| WALLOW | 432 WebP 1600 x 900 | собственный RAF scrub + GSAP/Lenis для UI | простой weighted scrub, redraw только при смене index | preload почти всех кадров сразу, нет direction-aware scheduling |
| Tea Leaf Scroll World | пять MP4 1600 x 900 | Blob video + `currentTime` + RAF lerp | мало media elements, компактная сегментация | полная Blob-загрузка, decoder-dependent seek, crossfade |
| Scroll World | набор dive/connector MP4 | lazy Blob video + coalesced seek | наиболее зрелая mobile/video обработка | сложнее media pipeline, seek не так детерминирован, seam crossfade |

Reference links:

- [WALLOW live project](https://wallow-bath-body-63.aura.build/?via=Vpromotion)
- [WALLOW public frame assets](https://github.com/VanhDc/aura-assets/tree/wallow-v1/wallow/frames)
- [Tea Leaf Scroll World repository](https://github.com/amirmushichge/tea-leaf-scroll-world)
- [Scroll World repository](https://github.com/oso95/scroll-world)

У WALLOW не предоставлен отдельный repository приложения. Анализ относится к runtime-коду опубликованного live project и публичному frame repository.

### 26.2. WALLOW: preload-all image sequence

Основная механика WALLOW:

```text
432 WebP frames
fixed canvas 1600 x 900
scrollY / maxScroll -> target progress
current += (target - current) * 0.14
round(current * 431) -> frame index
```

Когда разница между target и current становится меньше порога, current snap-ится к target. После остановки scroll loop перестает менять index, а canvas не перерисовывается без необходимости.

Плюсы:

- очень простой deterministic renderer;
- независимые WebP не требуют video seek;
- понятный weighted feel;
- фиксированный backing canvas ограничивает стоимость draw;
- reduced-motion не запускает sequence;
- motion UI использует в основном opacity и transform.

Минусы:

- после первого кадра запускаются запросы почти ко всем остальным 431 frames;
- browser сам решает фактический network concurrency;
- нет приоритета текущего target;
- нет sliding window или eviction;
- потенциальный decoded memory для 432 кадров 1600 x 900 очень велик;
- smoothness после полного preload не доказывает хороший cold start.

Что стоит перенять:

- не рисовать повторно тот же фактический frame index;
- snap вычисляемого progress в покое;
- фиксировать разумный canvas backing size;
- использовать transform-only эффекты вокруг hero.

Что не стоит копировать:

- запуск сотен `new Image()` одновременно;
- ожидание, что CDN и browser cache сами решат prioritization;
- постоянное хранение всей decoded sequence.

### 26.3. Tea Leaf: Blob MP4 и управление currentTime

Tea Leaf делит историю на пять видео примерно по 8 секунд. Runtime делает `fetch()` каждого MP4, превращает ответ в Blob URL и присваивает его `<video>`. Scroll выбирает активный segment, RAF сглаживает local progress, затем меняет `video.currentTime`.

Проверенные параметры repository:

| Параметр | Значение |
| --- | --- |
| Clips | 5 |
| Общий video transfer | около 43.8 MB |
| Resolution | 1600 x 900 |
| FPS | 24 |
| Frames per clip | 193 |
| Keyframes per clip | 25 |
| Фактический GOP | около 8 |

Плюсы:

- пять media requests вместо сотен image requests;
- browser video decoder управляет compressed frames;
- сегменты ограничивают seek distance;
- `video.seeking` предотвращает часть конфликтующих seeks;
- posters дают fallback до готовности видео.

Минусы:

- `fetch().blob()` требует загрузить clip целиком до полноценного использования;
- все пять fetch запускаются вместе и конкурируют на cold start;
- точность `currentTime` и скорость seek отличаются между браузерами;
- opacity crossfade может скрыть seam, но не исправляет source continuity;
- desktop clips используются и на mobile;
- постоянный RAF проходит по всем video elements.

Комментарий о keyframe на каждом кадре означает all-intra encode:

```bash
ffmpeg -i input.mp4 -an -c:v libx264 -g 1 -keyint_min 1 -sc_threshold 0 \
  -pix_fmt yuv420p -movflags +faststart output-all-intra.mp4
```

`-g 1` делает каждый video frame точкой random access и может ускорить scrub-seek, но существенно увеличивает файл. В текущем Tea Leaf repository это не применено: GOP около 8.

Для image sequence этот совет неактуален. Каждый WebP уже является независимым кадром и не зависит от предыдущего keyframe.

### 26.4. Scroll World: сегментированный video runtime

Scroll World является наиболее полной video-based reference architecture. Он строит цепочку `dive -> connector -> dive`, загружает clips возле viewport и скрабит каждый Blob video.

Полезные решения:

- lazy load только в окне около `1.6 viewport` от segment;
- mobile-specific clips и posters;
- desktop encode с GOP 8, mobile encode с GOP 4;
- возможность перейти к GOP 2 или 1 после измерений;
- запрет нового `currentTime`, пока `video.seeking === true`;
- coalescing: после seek decoder получает последний target, а не очередь устаревших targets;
- poster остается видимым до первого реального `seeked` frame;
- первый touch выполняет muted `play -> pause` priming на iOS;
- resize от движения mobile URL bar не пересобирает scroll track;
- coarse-pointer devices отключают лишние particles.

Ограничения:

- Blob clip нельзя скрабить до окончания его fetch;
- video seek остается platform-dependent;
- crossfade сглаживает границы, но может создавать двойное изображение;
- генерация connector clips усложняет AI media pipeline;
- frame-accurate chapter focus сложнее гарантировать, чем в image sequence;
- при быстром переходе в еще не загруженный segment пользователь увидит poster motion, а не реальный camera frame.

Для image-sequence проекта стоит перенять его идеи mobile adaptation, coalescing, lazy neighborhood и first-real-frame reveal, но не обязательно переходить на MP4.

### 26.5. The Last Signal: точность выше, scheduler слабее

The Last Signal использует один из самых надежных способов точной синхронизации:

- 760 исходных WebP, упакованных без перекодирования;
- отдельные desktop и mobile compositions;
- единая GSAP timeline для frames и текста;
- Canvas 2D;
- fullscreen quality-first loader;
- четыре параллельных pack-запроса;
- exact-only renderer после startup.

Главная production-проблема была не в Canvas или GSAP, а в 760 отдельных HTTP-запросах. Frame-pack слой устраняет request latency, не меняя media bytes или renderer contract.

Преимущества The Last Signal, которые следует сохранить:

- frame points и тексты не зависят от video seek;
- forward/reverse используют одну timeline;
- hard continuity остается видимой и проверяемой;
- нет crossfade, который скрывает дефектные AI frames;
- renderer может мгновенно обратиться к любому уже decoded кадру.

### 26.6. Как выбрать media architecture

| Условие | Предпочтительная архитектура |
| --- | --- |
| Нужны точные chapter frames и надежный reverse | image sequence + canvas |
| Sequence короткая, до нескольких сотен кадров | preload-window image sequence |
| История естественно делится на независимые clips | segmented MP4 |
| Mobile traffic важнее frame-perfect sync | mobile MP4 с GOP 2-4 |
| Exhibition kiosk с заранее прогретым cache | preload-all допустим после memory test |
| Требуется максимальный browser coverage | Canvas/WebP или обычный `<video>` fallback |
| Нужен экспериментальный controlled decode | WebCodecs за feature flag |

WebCodecs не является автоматическим улучшением. Он требует demuxing, управления decode queue, освобождения `VideoFrame`, fallback для неподдерживаемых браузеров и отдельного QA. Его следует вводить только после измеримого выигрыша над оптимизированным Canvas/WebP.

### 26.7. Итог сравнительного анализа

Лучшее практическое решение для frame-accurate cinematic hero:

```text
The Last Signal media model
+ Scroll World neighborhood/mobile discipline
+ WALLOW quality-first preload and redraw discipline
+ bounded full-sequence network workers
+ browser-managed decoded image cache
+ versioned immutable delivery
```

Переход на MP4 только ради уменьшения числа requests не гарантирует плавность. Для текущего проекта безопаснее исправить loader и renderer, сохранив существующие frame points, timeline, scroll height и композицию.

---

## 27. Эталонная архитектура версии 2

### 27.1. Цели и ограничения

Версия 2 должна:

- показывать первый drawable frame быстро;
- не позволять background loading вытеснять текущий target;
- плавно работать при cold cache;
- сохранять точный scroll-to-frame mapping;
- одинаково поддерживать forward и reverse;
- ограничивать decoded memory;
- адаптировать workload к устройству и сети;
- не менять тексты, frame points, scrub, pin и scroll-stage без отдельного решения.

### 27.2. Поток данных

```text
white fullscreen loader
        |
        v
4 parallel immutable frame-pack requests
        |
        v
extract original WebP bytes and decode 760 Images
        |
        v
all frames ready -> exact-only canvas renderer
        ^                       |
        |                       v
ScrollTrigger timeline -> requestedFrame = displayedFrame
```

`requestedFrame` и `displayedFrame` являются разными наблюдаемыми состояниями. Это основной инвариант системы.

### 27.3. Quality-first preload

Для The Last Signal выбран тот же принцип, который фактически использует WALLOW: до interactive state загружается вся полноразмерная последовательность выбранного viewport-варианта. Loader показывает честный прогресс, а после его исчезновения renderer никогда не подменяет exact frame уменьшенным preview или соседним кадром.

Практические правила:

- desktop и mobile имеют отдельные последовательности;
- четыре pack-файла загружаются параллельно;
- каждый pack получает ограниченный retry;
- `HTMLImageElement` сохраняются до ухода со страницы;
- не следует принудительно создавать 760 `ImageBitmap`: их decoded RGBA memory слишком велика;
- loader закрывает сцену, пока `loaded === frameCount`;
- при окончательной ошибке загрузки включается semantic fallback, а не размытая sequence.

Three-tier схема `overview -> detail -> high` полезна для маленького framed canvas, но была отвергнута для полноэкранного hero: растяжение atlas-кадров делает AI-видео заметно пиксельным и мягким. Такой fallback нельзя показывать пользователю как финальное изображение.

### 27.4. Byte-identical frame packs

Pack-файл не является atlas и не меняет изображение. Он содержит небольшой binary header, таблицу `frameIndex -> offset/length` и последовательно записанные исходные WebP-байты. Build validator сравнивает каждый извлеченный диапазон с соответствующим `.webp` через byte equality.

```text
TLSFPK01 header
frame table: [offset, length] x N
original frame-0001.webp bytes
original frame-0002.webp bytes
...
```

Четыре pack-файла дают параллельную передачу и ограниченный retry, но сокращают число media requests с 760 до 4. В browser каждый диапазон становится `Blob(type: image/webp)`, загружается в `HTMLImageElement`, после чего temporary object URL освобождается.

### 27.5. Startup state machine

```text
BOOT
  -> POSTER_READY
  -> FULL_RES_SEQUENCE_LOADING
  -> ALL_FRAMES_READY
  -> EXACT_ONLY_INTERACTIVE
```

Правила:

- poster рисуется до инициализации visual timeline;
- loader является полноэкранным и временно блокирует scroll;
- loader исчезает только после готовности всех полноразмерных кадров;
- timeline, frame mapping и scroll stage не меняются;
- первый interactive render рисует точный текущий frame;
- повторный визит ускоряется immutable browser cache.

### 27.6. Renderer contract

Renderer принимает target, но рисует candidate:

```ts
request(frameIndex) {
  state.requestedFrame = frameIndex;
  scheduleRender();
}

render() {
  const candidate = fullSequence.exact(state.requestedFrame);
  if (!candidate) return;

  if (candidate.frameIndex === state.displayedFrame) return;
  drawCover(candidate.image);
  state.displayedFrame = candidate.frameIndex;
}
```

После startup exact target всегда доступен. Не следует анимировать opacity между соседними images: это создаёт ghosting и скрывает source defects.

### 27.7. LRU и decoded memory

Один decoded frame 1920 x 1080 RGBA теоретически занимает около 7.9 MB. 760 таких frames могут приблизиться к 6 GB. Compressed transfer size не отражает decoded memory.

WALLOW-style preload сознательно меняет memory efficiency на гарантированное качество. Сильные ссылки сохраняются на `HTMLImageElement`, а browser сам управляет decoded image cache. Обязателен реальный memory test на целевых устройствах. Если 760 кадров окажутся слишком тяжелыми, следующий безопасный вариант - сократить физическое разрешение исходной mobile sequence или перейти на segmented all-intra video; возвращать видимый low-res atlas не следует.

### 27.8. Network-aware profile

Можно учитывать:

- `navigator.connection.saveData`;
- `effectiveType`, если доступен;
- `navigator.deviceMemory`;
- mobile/coarse pointer;
- реальную среднюю latency первых кадров;
- средний encoded frame size из manifest.

Пример политики:

| Profile | Network requests | Startup | Режим |
| --- | ---: | ---: | --- |
| desktop | 4 packs | все 760 desktop WebP decoded | exact-only canvas |
| mobile | 4 packs | все 760 mobile WebP decoded | exact-only canvas |
| Save-Data / weak device | 0 | poster | semantic fallback |

Не следует определять качество только по User-Agent. Runtime measurements надежнее статического device label.

### 27.9. Versioned delivery

Sequence build должен создавать immutable version id:

```json
{
  "version": "2026-08-04-a1b2c3d4",
  "desktop": {
    "path": "/sequences/project/2026-08-04-a1b2c3d4/desktop/frame-{frame}.webp"
  }
}
```

Deployment pipeline:

1. строит новую version directory;
2. валидирует все frames;
3. публикует media с immutable cache;
4. последним публикует новый manifest;
5. не перезаписывает старые URL до истечения cache policy.

Service Worker добавляется только после сравнения с обычным HTTP cache. Неправильный Service Worker усложняет обновление sequence и может удерживать десятки мегабайт без контроля.

### 27.10. Optional video profile

Для нового проекта можно подготовить альтернативный segmented MP4 profile:

```bash
# Desktop baseline
ffmpeg -i master.mp4 -an -c:v libx264 -crf 20 -preset slow \
  -g 8 -keyint_min 8 -sc_threshold 0 -pix_fmt yuv420p \
  -movflags +faststart desktop.mp4

# Mobile seek-oriented variant
ffmpeg -i master.mp4 -an -vf "scale=-2:720" -c:v libx264 -crf 23 \
  -g 4 -keyint_min 4 -sc_threshold 0 -pix_fmt yuv420p \
  -movflags +faststart mobile.mp4
```

Сравнивать GOP 8, 4, 2 и 1 нужно по:

- cold-start transfer;
- median seek latency;
- p95 seek latency;
- dropped visual updates;
- reverse-scroll behavior;
- iOS и Android;
- размеру файла.

All-intra `-g 1` не должен становиться default без A/B: он улучшает random access, но увеличивает transfer и cache footprint.

### 27.11. Порядок внедрения

#### P0: устранить телепортации

1. Исправить `requestedFrame` / `displayedFrame`.
2. Перерисовывать exact frame после его decode.
3. Ввести exact-target priority.
4. Загружать последовательный initial runway.
5. Проверить cold start при scroll во время loader.

#### P1: scheduler и память

1. Единая priority queue.
2. Direction-aware sliding window.
3. LRU cache.
4. Cleanup active requests и decoded resources.
5. Network-aware concurrency.

#### P2: delivery

1. Versioned frame URLs.
2. Immutable browser cache.
3. Production URL smoke test.
4. Resource timing instrumentation без персональных данных.

#### P3: media quality

1. SSIM/VMAF sampling для выбора encode quality.
2. AVIF/WebP A/B по decode time, а не только file size.
3. Art-directed mobile crops.
4. Проверка резких межкадровых различий.
5. Color normalization до export.

#### P4: authoring и эксперименты

1. Dev overlay: requested, displayed, loaded, queue, cache size.
2. Режим установки focus points.
3. Contact sheets и seam QA.
4. WebCodecs или segmented video за feature flag.
5. Server-selected variants только после измерений.

### 27.12. Обязательные cold-start тесты

Проверки должны выполняться с отключенным browser cache:

- не скроллить до ready;
- начать медленный scroll сразу после первого paint;
- выполнить быстрый wheel до frame 80-120 во время loader;
- остановиться на отсутствующем exact frame и дождаться его загрузки;
- резко изменить направление;
- перейти в background и вернуться;
- повторить на throttled network;
- повторить на реальном mobile device.

В debug-режиме логировать:

```text
requestedFrame
displayedFrame
exactAvailable
queueDepth by priority
inFlight
decodedCacheSize
frameLoadLatency
```

Success criterion: после загрузки exact target canvas обновляется без дополнительного scroll event, displayed sequence не совершает крупный скачок из-за ошибочной очереди, а memory остается в заданном budget.

---

## 28. Пошаговый план нового проекта

### Фаза A. Концепция

- определить тему и аудиторию;
- написать сюжет одной строкой;
- создать 4-7 глав;
- определить финальный CTA;
- выбрать визуальный язык;
- зафиксировать performance budget.

### Фаза B. Media

- подготовить storyboard;
- создать keyframes;
- сгенерировать или снять переходы;
- проверить continuity;
- нормализовать исходники;
- собрать master;
- удалить дефектные окна;
- экспортировать desktop/mobile sequences;
- создать posters;
- сгенерировать manifest.

### Фаза C. Core runtime

- реализовать types;
- capability detection;
- единый priority scheduler;
- последовательный initial runway;
- exact-target и direction-aware preload;
- LRU decoded cache;
- canvas renderer с отдельными requested/displayed states;
- resize;
- chapter DOM;
- GSAP timeline;
- Lenis integration;
- cleanup;
- fallback.

### Фаза D. Art direction

- выбрать typography;
- настроить text-safe gradients;
- проверить focus frames;
- добавить restrained cinematic reveal;
- настроить mobile layout;
- не добавлять декоративные эффекты до стабильной механики.

### Фаза E. Post-hero

- построить смысловое продолжение сюжета;
- добавить semantic sections;
- reveal и слабую depth-анимацию;
- реализовать controls и их ARIA;
- добавить финальный narrative payoff.

### Фаза F. QA и deployment

- media validation;
- typecheck;
- production build;
- desktop/mobile visual QA;
- reverse scroll;
- fallback/reduced motion;
- cold-cache scroll во время loader;
- throttled-network и exact-frame catch-up;
- memory/cache budget;
- network and console check;
- Git commit;
- push production branch;
- production smoke test.

---

## 29. Входные данные, которые нужно дать ИИ

Перед началом новой реализации заполнить этот блок:

```md
# Project brief

Project name:
Theme:
Audience:
One-sentence story:
Desired emotion:
Visual references:
Color direction:
Typography direction:

## Hero media

Source clips:
Duration:
Source resolution:
Source FPS:
Desktop target:
Mobile target:
Frame format:
Transfer budget:
Preferred runtime: image sequence / segmented video / compare both
Decoded memory budget:
Cold-start target:
Cache versioning strategy:

## Chapters

1. id / event / copy / visual focus / alignment
2. ...

## Post-hero sections

Section 05:
Section 06:
Section 07:
Final:

## Constraints

- Preserve exact copy:
- Preserve exact frame synchronization:
- Required browsers:
- Accessibility level:
- Deployment target:
- Existing repository conventions:
```

Если исходные видео еще не готовы, ИИ должен сначала помочь со storyboard и media specification, а не придумывать frame numbers.

---

## 30. Готовый master prompt для ИИ

Ниже находится шаблон, который можно передать ИИ вместе с этим документом.

```text
Создай production-ready cinematic Scroll-Driven Video Animation website.

Сначала изучи предоставленный project brief, исходные видео, структуру repository и этот engineering guide. Не начинай визуальную полировку, пока не будет стабильна базовая механика кадров.

Архитектура hero:
- статический Astro shell;
- responsive desktop/mobile image sequences;
- Canvas 2D renderer;
- GSAP timeline и ScrollTrigger для pin/scrub;
- Lenis, корректно синхронизированный с GSAP ticker;
- manifest как контракт кадров и глав;
- staged preloading: poster, sequential initial runway, exact target, direction-aware sliding window, nearby focus frames, background fill;
- единый priority scheduler с общим concurrency limit;
- nearest-frame fallback с раздельными `requestedFrame` и `displayedFrame`;
- LRU decoded cache и cleanup завершенных request records;
- versioned media URLs и immutable browser cache;
- полноценный reduced-motion/Save-Data fallback;
- semantic HTML copy поверх canvas;
- обязательный cleanup listeners, RAF, observers и timelines.

Критические ограничения:
- не менять тексты, frame points, сюжет и композицию без согласования;
- не использовать глобальные темные или серые filters по умолчанию;
- не скрывать проблемы видео тяжелыми overlays;
- не рендерить сотни img в DOM;
- не ждать загрузки всей sequence до первого показа;
- не ставить дальние focus frames раньше ближайшего последовательного runway;
- не считать fallback frame уже отрисованным exact requested frame;
- не запускать несколько независимых preload queues без общего concurrency scheduler;
- не создавать независимые scroll timelines для кадров и hero-текста;
- не использовать desktop crop на mobile без art-direction QA;
- не считать задачу завершенной без reverse-scroll, mobile, fallback, console и production build checks.

Порядок работы:
1. Проведи media inventory и составь report.
2. Предложи chapter map и frame-focus methodology.
3. Реализуй deterministic processing pipeline.
4. Реализуй manifest validation.
5. Реализуй hero runtime.
6. Проверь базовую механику.
7. Добавь art direction и cinematic text reveal.
8. Реализуй post-hero sections.
9. Выполни полный QA matrix.
10. Представь точный список изменений, измерений и оставшихся рисков.

Используй параметры из project brief вместо параметров The Last Signal. Если информации недостаточно для решения, сначала исследуй repository и media. Не выдумывай коммерческие факты, тексты или frame points.
```

---

## 31. Definition of Done

Проект готов только когда выполнены все пункты:

### Media

- исходники задокументированы;
- desktop/mobile sequences имеют одинаковый frame count;
- manifest валиден;
- frame names непрерывны;
- posters существуют;
- focus frames проверены визуально;
- проблемные AI-кадры исправлены редакторски или приняты осознанно.

### Runtime

- первый кадр появляется без blank flash;
- cold-start scroll не приводит к длительной статике и крупному catch-up jump;
- exact frame перерисовывается после decode без дополнительного scroll event;
- `requestedFrame` и фактически `displayedFrame` различаются корректно;
- scroll вперед и назад детерминирован;
- текст совпадает с focus frames;
- pin начинается и заканчивается без скачка;
- resize не ломает canvas;
- нет дублирующих listeners/timelines;
- fallback содержит весь смысл;
- reduced motion соблюдается.
- direction-aware queue повышает приоритет текущего target;
- decoded cache остается в установленном memory budget;

### UI

- desktop и mobile композиции проверены;
- нет overlap и horizontal overflow;
- текст читается на каждом chapter focus;
- hover применяется только на подходящих устройствах;
- post-hero motion restrained и не конфликтует с hero;
- controls работают с клавиатуры и имеют ARIA state.

### Engineering

- `npm run check` проходит;
- `npm run build` проходит;
- `npm run sequence:validate` проходит;
- console errors отсутствуют;
- critical assets возвращают HTTP 200;
- versioned media получает ожидаемые cache headers;
- cold-cache и throttled-network сценарии пройдены;
- diff не содержит временные файлы и source leaks;
- production deployment проверен.

---

## 32. Главный принцип

Scroll-driven sequence является не видео-плеером, а интерактивным монтажом. Качество проекта определяется не количеством эффектов, а точностью связи между движением камеры, номером кадра, появлением текста, скоростью чтения и действием пользователя.

Сначала нужно добиться стабильной механики и чистого монтажа. Затем добавить типографику и локальную читаемость. И только после этого использовать grain, reveal, parallax, hover и дополнительные инструменты. Каждый эффект должен усиливать сюжет и иметь понятный fallback.
