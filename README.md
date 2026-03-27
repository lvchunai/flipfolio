# FlipFolio

基于 Three.js WebGL 的翻书组件，通过圆柱体折叠变形算法实现逼真的纸张弯曲翻页效果。

依赖 [Three.js](https://threejs.org/)（peer dependency），支持 HTML、图片、DOM 元素和 Canvas 回调四种页面格式，兼容鼠标/触摸/键盘交互。

## Features

- Three.js WebGL 渲染，真实的纸张弯曲变形（cylindrical curl deformation）
- 拖拽翻页，支持惯性检测，松手自动完成或回弹
- 键盘导航（方向键 / PageUp / PageDown / Home / End）
- 边缘悬停预览（edge curl peek）
- 支持 HTML、图片 URL、DOM 元素、Canvas 回调四种页面格式
- 页面内容通过 html2canvas 渲染为 WebGL 纹理（可选，有 SVG foreignObject 降级方案）
- 书脊阴影 + 页面堆叠深度阴影
- 响应式缩放（ResizeObserver）
- 触摸设备支持（Pointer Events API）
- 按需渲染，无持续 RAF 循环
- 事件系统（ready / flip / destroy）
- ESM + UMD 双格式输出

## Quick Start

### npm

```bash
npm install flipfolio three
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

book.on('ready', () => console.log('Textures loaded'));
```

### CDN

```html
<script src="https://unpkg.com/three@0.159.0/build/three.min.js"></script>
<script src="https://unpkg.com/html2canvas@1.4.1/dist/html2canvas.min.js"></script>
<script src="https://unpkg.com/flipfolio/dist/flipfolio.umd.js"></script>

<div id="book"></div>
<script>
  const book = new FlipFolio('#book', {
    pages: ['cover.jpg', 'page1.jpg', 'page2.jpg', 'back.jpg'],
  });
</script>
```

> **注意：** UMD 构建需要全局 `THREE` 对象。Three.js r159 是最后一个提供 UMD 全局构建的版本。`html2canvas` 为可选依赖，用于将 HTML 页面内容渲染为纹理。

## API Overview

```js
book.flipNext();           // 下一页
book.flipPrev();           // 上一页
book.flipTo(4);            // 跳转到第5页
book.currentPage;          // 当前页码（只读）
book.pageCount;            // 总页数（只读）
book.on('flip', callback); // 监听翻页事件
book.on('ready', callback);// 纹理加载完成
book.destroy();            // 销毁实例，释放 WebGL 资源
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
├── flipfolio.umd.js       # UMD (需要全局 THREE)
├── flipfolio.umd.min.js   # UMD (minified)
└── flipfolio.css           # 容器样式
```

## Dependencies

| 依赖 | 类型 | 说明 |
|------|------|------|
| `three` >= 0.152.0 | peerDependency | WebGL 渲染引擎 |
| `html2canvas` | 可选（运行时） | HTML 页面内容转纹理，未加载时降级为 SVG foreignObject |

## Demo

打开 `examples/index.html` 查看演示（需先 `npm run build`）。

## License

MIT
