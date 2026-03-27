# FlipFolio API

## Constructor

```js
const book = new FlipFolio(container, options);
```

构造函数同步创建 WebGL 场景和 DOM 容器，然后异步加载页面纹理。纹理加载完成后触发 `ready` 事件，在此之前 `flipNext()` / `flipPrev()` / `flipTo()` 为空操作。

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `container` | `string \| HTMLElement` | CSS 选择器或 DOM 元素 |
| `options` | `object` | 配置项（见下表） |

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `width` | `number` | `800` | 书本宽度（像素），页面宽度为此值的一半 |
| `height` | `number` | `600` | 书本高度（像素） |
| `pages` | `array` | `[]` | 页面描述符数组（见 Page Descriptors） |
| `startPage` | `number` | `0` | 初始页码（0-based） |
| `duration` | `number` | `0.7` | 翻页动画时长（秒） |
| `dragThreshold` | `number` | `0.3` | 拖拽松手后完成翻页所需的进度阈值（0-1） |
| `responsive` | `boolean` | `true` | 自动缩放以适应容器宽度 |
| `keyboard` | `boolean` | `true` | 启用键盘导航 |
| `clickToFlip` | `boolean` | `false` | 点击左/右半区翻页（保留选项，当前版本未实现） |
| `autoInjectCSS` | `boolean` | `true` | 自动注入容器样式（设为 `false` 则需手动引入 CSS 文件） |
| `cornerCurl` | `boolean` | `true` | 启用边缘悬停翻页预览 |
| `edgeCurlZone` | `number` | `60` | 边缘悬停检测区域宽度（像素） |
| `velocityThreshold` | `number` | `0.4` | 拖拽速度阈值（progress/s），超过此值时按速度方向决定翻页 |

## Page Descriptors

页面通过 `pages` 数组描述。每两个页面组成一个 leaf（叶）：偶数索引为正面（右页），奇数索引为背面（左页）。

所有页面内容在初始化时异步渲染为 WebGL 纹理。

### Image URL (string)

直接传入图片 URL 字符串，使用 Three.js TextureLoader 加载。

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
  alt: 'Description',  // 仅用于元数据
}
```

### HTML content

通过 `html2canvas`（如可用）或 SVG foreignObject 降级方案将 HTML 渲染为纹理。

```js
{
  type: 'html',
  content: '<div class="my-page"><h1>Title</h1><p>Content...</p></div>',
}
```

### DOM element

克隆指定 DOM 元素并渲染为纹理。

```js
{
  type: 'element',
  element: document.getElementById('my-template'),
}
```

### Canvas callback

提供回调函数直接绘制到 Canvas 上下文。

```js
{
  type: 'canvas',
  render: (ctx, width, height) => {
    ctx.fillStyle = '#f0f0f0';
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = '#333';
    ctx.font = '48px sans-serif';
    ctx.fillText('Hello', 50, 100);
  },
}
```

> Canvas 回调接收的 `width` / `height` 为实际 canvas 尺寸（2x 页面像素尺寸，用于高清渲染）。

### null / 缺失

`null` 或数组越界的页面渲染为白色空白页。

### Common options

`html` / `image` / `element` 类型的页面对象还支持：

| Property | Type | Description |
|----------|------|-------------|
| `className` | `string` | 附加 CSS class（仅对 html 类型生效，应用到内容容器） |
| `style` | `object` | 内联样式对象（仅对 html 类型生效） |

## Methods

### `flipNext()`

翻到下一页。如果已在最后一页、正在动画中、或纹理未加载完成，则无操作。

### `flipPrev()`

翻到上一页。如果已在第一页、正在动画中、或纹理未加载完成，则无操作。

### `flipTo(pageIndex)`

瞬间跳转到指定页（0-based 索引）。无动画，直接设置所有叶的平面状态。

```js
book.flipTo(4); // 跳转到第5页
```

### `on(event, callback)`

监听事件。返回实例，支持链式调用。

```js
book.on('flip', (data) => {
  console.log('Current page:', data.page);
});
```

### `off(event, callback)`

移除事件监听。返回实例，支持链式调用。

### `destroy()`

销毁实例：释放 WebGL 上下文和所有 GPU 资源（geometries、materials、textures），移除 DOM 元素和事件监听器，断开 ResizeObserver。

## Properties

| Property | Type | Description |
|----------|------|-------------|
| `currentPage` | `number` | 当前叶索引（只读）。0 = 只看到第一页正面，1 = 第一叶已翻 |
| `pageCount` | `number` | 总页数（只读） |

## Events

### `ready`

纹理全部加载完成，组件可交互。

```js
book.on('ready', () => {
  console.log('Book is ready');
});
```

### `flip`

翻页动画完成后触发。

```js
book.on('flip', ({ page, leaf }) => {
  // page: 当前叶索引（同 currentPage）
  // leaf: 当前叶索引
});
```

### `destroy`

调用 `destroy()` 时触发。

## Keyboard Shortcuts

需要 `keyboard: true`（默认开启）且书本容器获得焦点。

| Key | Action |
|-----|--------|
| `ArrowRight` / `PageDown` | 下一页 |
| `ArrowLeft` / `PageUp` | 上一页 |
| `Home` | 第一页 |
| `End` | 最后一页 |

## Drag & Touch

- 在书本右半区按下并拖拽 → 向前翻页
- 在书本左半区按下并拖拽 → 向后翻页
- 拖拽过程中页面实时弯曲变形，跟随指针位置
- 松手后根据拖拽进度和速度判断完成翻页或回弹
- 触摸设备通过 Pointer Events API 支持

## Edge Curl Peek

需要 `cornerCurl: true`（默认开启）。

- 鼠标悬停在右边缘 `edgeCurlZone` 像素内 → 预览下一页（微小弯曲变形）
- 鼠标悬停在左边缘 → 预览上一页
- 鼠标移开 → 恢复平面

## Architecture

### Rendering

使用 Three.js WebGLRenderer，按需渲染（无持续 RAF 循环）：
- 拖拽时：每次 `pointermove` 触发一次渲染
- 翻页动画中：RAF 循环驱动变形 + 渲染
- 悬停预览：单次变形 + 渲染
- 状态变化（flipTo、z-order 更新）：单次渲染

### Bend Deformation

页面使用 40 段宽度的 PlaneGeometry，通过圆柱体折叠算法实时变形顶点：
- 折线右侧：平面（未翻部分）
- 折线处：圆柱弧（弯曲部分）
- 弧后：平面（已翻到左侧的部分）

卷曲半径随翻页进度动态变化，在 50% 处达到峰值。

### Texture Pipeline

| 页面类型 | 纹理生成方式 |
|---------|------------|
| `string` (URL) / `{type:'image'}` | `THREE.TextureLoader` |
| `{type:'html'}` | html2canvas → CanvasTexture（降级：SVG foreignObject） |
| `{type:'element'}` | 克隆 DOM → html2canvas → CanvasTexture |
| `{type:'canvas'}` | 调用回调函数绘制 → CanvasTexture |
| `null` / 缺失 | 白色 Canvas |

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

book.on('ready', () => console.log('Ready'));
book.on('flip', ({ page }) => console.log('Page:', page));
```

### CDN / UMD

```html
<script src="https://unpkg.com/three@0.159.0/build/three.min.js"></script>
<script src="https://unpkg.com/html2canvas@1.4.1/dist/html2canvas.min.js"></script>
<script src="https://unpkg.com/flipfolio/dist/flipfolio.umd.js"></script>

<div id="book"></div>

<script>
  const book = new FlipFolio('#book', {
    pages: ['page1.jpg', 'page2.jpg', 'page3.jpg'],
  });
</script>
```

> **注意：** UMD 构建依赖全局 `THREE` 对象。Three.js r159 是最后一个提供全局构建（`build/three.min.js`）的版本。r160+ 仅提供 ES module 格式。

### Canvas 回调页面

```js
const book = new FlipFolio('#book', {
  pages: [
    {
      type: 'canvas',
      render: (ctx, w, h) => {
        // 自定义 Canvas 绘制
        const grad = ctx.createLinearGradient(0, 0, w, h);
        grad.addColorStop(0, '#2c3e50');
        grad.addColorStop(1, '#4a6741');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = '#fff';
        ctx.font = `${h * 0.08}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText('Custom Cover', w / 2, h / 2);
      },
    },
    { type: 'html', content: '<p>Page content here...</p>' },
  ],
});
```

### HTML pages with template

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
