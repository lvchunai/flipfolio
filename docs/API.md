# FlipFolio API

## Constructor

```js
const book = new FlipFolio(container, options);
```

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `container` | `string \| HTMLElement` | CSS selector or DOM element |
| `options` | `object` | Configuration (see below) |

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `width` | `number` | `800` | Book width in pixels |
| `height` | `number` | `600` | Book height in pixels |
| `pages` | `array` | `[]` | Array of page descriptors |
| `startPage` | `number` | `0` | Initial page index (0-based) |
| `duration` | `number` | `0.6` | Flip animation duration in seconds |
| `timing` | `string` | `'ease-in-out'` | CSS timing function |
| `dragThreshold` | `number` | `0.3` | Drag progress (0-1) needed to complete a flip |
| `responsive` | `boolean` | `true` | Auto-scale to fit container width |
| `keyboard` | `boolean` | `true` | Enable keyboard navigation |
| `clickToFlip` | `boolean` | `true` | Click left/right halves to flip |
| `showSpineShadow` | `boolean` | `true` | Show shadow at spine |
| `autoInjectCSS` | `boolean` | `true` | Auto-inject styles (set `false` if using CSS file) |

## Page Descriptors

Pages are described using the `pages` array. Each entry can be:

### Image URL (string)

```js
pages: [
  'https://example.com/page1.jpg',
  'https://example.com/page2.jpg',
]
```

### Image object

```js
{
  type: 'image',
  src: 'https://example.com/photo.jpg',
  alt: 'Description',
}
```

### HTML content

```js
{
  type: 'html',
  content: '<div class="my-page"><h1>Title</h1><p>Content...</p></div>',
}
```

### DOM element

```js
{
  type: 'element',
  element: document.getElementById('my-template'),
}
```

### Common options

All page objects support:

| Property | Type | Description |
|----------|------|-------------|
| `className` | `string` | Additional CSS class for the content wrapper |
| `style` | `object` | Inline styles for the content wrapper |

## Methods

### `flipNext()`

Flip to the next page. No-op if already at the last page or animating.

### `flipPrev()`

Flip to the previous page. No-op if already at the first page or animating.

### `flipTo(pageIndex)`

Jump to a specific page (0-based index). Instant jump without animation.

```js
book.flipTo(4); // Jump to page 5
```

### `on(event, callback)`

Listen for events. Returns the instance for chaining.

```js
book.on('flip', (data) => {
  console.log('Current page:', data.page);
});
```

### `off(event, callback)`

Remove an event listener. Returns the instance for chaining.

### `destroy()`

Clean up: remove DOM, event listeners, and observers.

## Properties

| Property | Type | Description |
|----------|------|-------------|
| `currentPage` | `number` | Current left page index (read-only) |
| `pageCount` | `number` | Total number of pages (read-only) |

## Events

### `flip`

Fired after a page flip completes.

```js
book.on('flip', ({ page, leaf }) => {
  // page: current page index (0-based)
  // leaf: current leaf index
});
```

### `destroy`

Fired when `destroy()` is called.

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `ArrowRight` / `PageDown` | Next page |
| `ArrowLeft` / `PageUp` | Previous page |
| `Home` | First page |
| `End` | Last page |

## Usage Examples

### ESM

```js
import FlipFolio from 'flipfolio';
import 'flipfolio/css';

const book = new FlipFolio('#book', {
  width: 800,
  height: 600,
  pages: [
    { type: 'html', content: '<h1>Cover</h1>' },
    { type: 'image', src: 'page1.jpg' },
    { type: 'html', content: '<p>Chapter 1...</p>' },
    'page2.jpg',
  ],
});

book.on('flip', ({ page }) => console.log('Page:', page));
```

### CDN / UMD

```html
<link rel="stylesheet" href="https://unpkg.com/flipfolio/dist/flipfolio.css">
<script src="https://unpkg.com/flipfolio/dist/flipfolio.umd.js"></script>

<div id="book"></div>

<script>
  const book = new FlipFolio('#book', {
    pages: ['page1.jpg', 'page2.jpg', 'page3.jpg'],
  });
</script>
```

### HTML pages

```html
<div id="book"></div>

<template id="cover">
  <div style="text-align:center; padding:40px;">
    <h1>My Book</h1>
  </div>
</template>

<script type="module">
  import FlipFolio from 'flipfolio';

  const book = new FlipFolio('#book', {
    pages: [
      { type: 'element', element: document.getElementById('cover').content.firstElementChild },
      { type: 'html', content: '<p>Page content here...</p>' },
    ],
  });
</script>
```
