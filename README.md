# FlipFolio

纯原生 JavaScript 翻书组件，基于 CSS 3D Transform 实现逼真的书页翻转效果。

零依赖，支持 HTML 和图片内容，兼容鼠标/触摸/键盘交互。

## Features

- CSS 3D Transform 翻页动画（perspective + rotateY + backface-visibility）
- 拖拽翻页，松手自动完成或回弹
- 点击翻页 + 键盘导航（方向键 / PageUp / PageDown / Home / End）
- 支持 HTML、图片 URL、DOM 元素三种页面格式
- 翻页阴影 + 书脊阴影
- 响应式缩放（ResizeObserver）
- 触摸设备支持（Pointer Events API）
- 事件系统（flip / destroy）
- ESM + UMD 双格式输出

## Quick Start

### npm

```bash
npm install flipfolio
```

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
```

### CDN

```html
<link rel="stylesheet" href="https://unpkg.com/flipfolio/dist/flipfolio.css">
<script src="https://unpkg.com/flipfolio/dist/flipfolio.umd.js"></script>

<div id="book"></div>
<script>
  const book = new FlipFolio('#book', {
    pages: ['cover.jpg', 'page1.jpg', 'page2.jpg', 'back.jpg'],
  });
</script>
```

## API Overview

```js
book.flipNext();           // 下一页
book.flipPrev();           // 上一页
book.flipTo(4);            // 跳转到第5页
book.currentPage;          // 当前页码（只读）
book.pageCount;            // 总页数（只读）
book.on('flip', callback); // 监听翻页事件
book.destroy();            // 销毁实例
```

完整 API 文档见 [docs/API.md](docs/API.md)。

## Development

```bash
npm install
npm run build    # 构建到 dist/
npm run dev      # 监听模式
```

构建产物：

```
dist/
├── flipfolio.esm.js       # ES Module
├── flipfolio.esm.min.js   # ES Module (minified)
├── flipfolio.umd.js       # UMD
├── flipfolio.umd.min.js   # UMD (minified)
└── flipfolio.css           # Styles
```

## Demo

打开 `examples/index.html` 查看演示。

## License

MIT
