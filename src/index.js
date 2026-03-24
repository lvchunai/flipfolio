/**
 * FlipFolio - A pure vanilla JS page-flip book component
 * Uses CSS 3D Transforms for realistic book page-turning effects
 * 2-pages-per-leaf: front = recto (right), back = verso (left when flipped)
 * Curl effect inspired by WowBook's fold gradient technique
 */

const DEFAULTS = {
  width: 800,
  height: 600,
  pages: [],
  startPage: 0,
  duration: 0.7,
  timing: 'cubic-bezier(0.4, 0.0, 0.2, 1.0)',
  dragThreshold: 0.3,
  responsive: true,
  keyboard: true,
  clickToFlip: false,
  showSpineShadow: true,
  autoInjectCSS: true,
  cornerCurl: true,
  cornerCurlAngle: 28,
  edgeCurlZone: 60,
  pageThickness: 0.5,
  maxStackOffset: 6,
  velocityThreshold: 200,
};

let cssInjected = false;

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

/**
 * Newton-Raphson cubic bezier solver.
 * Maps elapsed fraction x → eased value y for a given cubic-bezier curve.
 */
function cubicBezierSolver(x1, y1, x2, y2) {
  return function (x) {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 8; i++) {
      const ct = 1 - t;
      const bx = 3 * ct * ct * t * x1 + 3 * ct * t * t * x2 + t * t * t;
      const dx = 3 * ct * ct * x1 + 6 * ct * t * (x2 - x1) + 3 * t * t * (1 - x2);
      if (Math.abs(dx) < 1e-6) break;
      t -= (bx - x) / dx;
      t = clamp(t, 0, 1);
    }
    const ct = 1 - t;
    return 3 * ct * ct * t * y1 + 3 * ct * t * t * y2 + t * t * t;
  };
}

const naturalEase = cubicBezierSolver(0.4, 0.0, 0.2, 1.0);
const easeOut = cubicBezierSolver(0, 0, 0.2, 1);

class FlipFolio {
  constructor(container, opts = {}) {
    this._el =
      typeof container === 'string'
        ? document.querySelector(container)
        : container;
    if (!this._el) throw new Error('FlipFolio: container element not found');

    this._opts = { ...DEFAULTS, ...opts };
    this._pages = this._opts.pages;
    this._leafCount = Math.ceil(this._pages.length / 2);
    this._currentLeaf = 0;
    this._animating = false;
    this._dragging = false;
    this._dragLeaf = null;
    this._dragStartX = 0;
    this._dragAngle = 0;
    this._curlRAF = null;
    this._listeners = {};
    this._leaves = [];
    this._destroyed = false;

    this._cornerCurling = false;
    this._cornerLeaf = null;
    this._cornerDir = null;

    this._velocitySamples = [];

    this._onPointerDown = this._handlePointerDown.bind(this);
    this._onPointerMove = this._handlePointerMove.bind(this);
    this._onPointerUp = this._handlePointerUp.bind(this);
    this._onKeyDown = this._handleKeyDown.bind(this);
    this._onResize = this._handleResize.bind(this);
    this._onCornerMove = this._handleCornerCurl.bind(this);
    this._onMouseLeave = this._handleMouseLeave.bind(this);

    if (this._opts.autoInjectCSS) this._injectCSS();

    this._build();
    this._bindEvents();

    if (this._opts.startPage > 0) {
      const startLeaf = Math.min(
        Math.ceil(this._opts.startPage / 2),
        this._leafCount
      );
      this._currentLeaf = startLeaf;
      for (let i = 0; i < this._currentLeaf; i++) {
        this._leaves[i].classList.add('ff-flipped');
      }
    }

    this._updateZIndex();
    if (this._opts.responsive) this._handleResize();
  }

  // ===== DOM Construction =====

  _build() {
    const o = this._opts;

    this._book = document.createElement('div');
    this._book.className = 'ff-book' + (o.responsive ? ' ff-responsive' : '');
    this._book.style.setProperty('--ff-width', o.width + 'px');
    this._book.style.setProperty('--ff-height', o.height + 'px');
    this._book.style.setProperty('--ff-duration', o.duration + 's');
    this._book.style.setProperty('--ff-timing', o.timing);
    this._book.setAttribute('tabindex', '0');
    this._book.setAttribute('role', 'region');
    this._book.setAttribute('aria-label', 'Book viewer');

    this._pagesEl = document.createElement('div');
    this._pagesEl.className = 'ff-pages';

    for (let i = 0; i < this._leafCount; i++) {
      const leaf = this._buildLeaf(i);
      this._leaves.push(leaf);
      this._pagesEl.appendChild(leaf);
    }

    this._castShadowLeft = document.createElement('div');
    this._castShadowLeft.className = 'ff-cast-shadow ff-cast-shadow-left';
    this._pagesEl.appendChild(this._castShadowLeft);

    this._castShadowRight = document.createElement('div');
    this._castShadowRight.className = 'ff-cast-shadow ff-cast-shadow-right';
    this._pagesEl.appendChild(this._castShadowRight);

    if (o.showSpineShadow) {
      this._spineShadow = document.createElement('div');
      this._spineShadow.className = 'ff-spine-shadow';
      this._pagesEl.appendChild(this._spineShadow);
    }

    this._book.appendChild(this._pagesEl);
    this._el.appendChild(this._book);
  }

  _buildLeaf(index) {
    const leaf = document.createElement('div');
    leaf.className = 'ff-leaf';
    leaf.dataset.leafIndex = index;

    const frontPageIndex = index * 2;
    const backPageIndex = index * 2 + 1;

    // Front face = right-hand page (recto)
    const front = document.createElement('div');
    front.className = 'ff-face ff-face-front';

    const frontContent = document.createElement('div');
    frontContent.className = 'ff-content';
    this._renderPage(frontContent, this._pages[frontPageIndex], frontPageIndex);
    front.appendChild(frontContent);

    const frontShadow = document.createElement('div');
    frontShadow.className = 'ff-shadow ff-shadow-front';
    front.appendChild(frontShadow);

    const frontCurl = document.createElement('div');
    frontCurl.className = 'ff-curl ff-curl-front';
    front.appendChild(frontCurl);

    const frontDepth = document.createElement('div');
    frontDepth.className = 'ff-depth-shadow-right';
    front.appendChild(frontDepth);

    // Back face = left-hand page (verso, visible when flipped)
    const back = document.createElement('div');
    back.className = 'ff-face ff-face-back';

    const backContent = document.createElement('div');
    backContent.className = 'ff-content';
    if (backPageIndex < this._pages.length) {
      this._renderPage(backContent, this._pages[backPageIndex], backPageIndex);
    }
    back.appendChild(backContent);

    const backShadow = document.createElement('div');
    backShadow.className = 'ff-shadow ff-shadow-back';
    back.appendChild(backShadow);

    const backCurl = document.createElement('div');
    backCurl.className = 'ff-curl ff-curl-back';
    back.appendChild(backCurl);

    const backDepth = document.createElement('div');
    backDepth.className = 'ff-depth-shadow';
    back.appendChild(backDepth);

    leaf.appendChild(front);
    leaf.appendChild(back);

    // Cache child references to avoid querySelector in animation hot path
    leaf._ff = {
      frontFace: front,
      backFace: back,
      frontCurl: frontCurl,
      backCurl: backCurl,
      frontShadow: frontShadow,
      backShadow: backShadow,
      frontDepth: frontDepth,
      backDepth: backDepth,
    };

    return leaf;
  }

  _renderPage(container, page, pageIndex) {
    if (page == null) {
      container.classList.add('ff-blank');
      return;
    }
    if (typeof page === 'string') {
      const img = document.createElement('img');
      img.src = page;
      img.alt = `Page ${pageIndex + 1}`;
      img.draggable = false;
      container.appendChild(img);
      return;
    }
    if (typeof page === 'object') {
      if (page.type === 'image') {
        const img = document.createElement('img');
        img.src = page.src;
        img.alt = page.alt || `Page ${pageIndex + 1}`;
        img.draggable = false;
        container.appendChild(img);
      } else if (page.type === 'html') {
        container.classList.add('ff-content-html');
        container.innerHTML = page.content;
      } else if (page.type === 'element') {
        container.appendChild(page.element.cloneNode(true));
      }
      if (page.className) container.classList.add(page.className);
      if (page.style) Object.assign(container.style, page.style);
    }
  }

  // ===== CSS Injection =====

  _injectCSS() {
    if (cssInjected) return;
    cssInjected = true;

    const sheets = document.styleSheets;
    for (let i = 0; i < sheets.length; i++) {
      try {
        if ((sheets[i].href || '').includes('flipfolio')) return;
      } catch (_) {}
    }

    const style = document.createElement('style');
    style.id = 'flipfolio-styles';
    style.textContent = this._getInlineCSS();
    document.head.appendChild(style);
  }

  _getInlineCSS() {
    return `.ff-book{--ff-width:800px;--ff-height:600px;--ff-page-width:calc(var(--ff-width)/2);--ff-duration:0.7s;--ff-timing:cubic-bezier(0.4,0.0,0.2,1.0);--ff-bg:#fff;--ff-shadow-color:rgba(0,0,0,0.25);--ff-spine-shadow:rgba(0,0,0,0.3);position:relative;width:var(--ff-width);height:var(--ff-height);margin:0 auto;user-select:none;-webkit-user-select:none;touch-action:none;-ms-touch-action:none}
.ff-book.ff-responsive{transform-origin:top center}
.ff-pages{position:relative;width:100%;height:100%;perspective:2000px;perspective-origin:center center;contain:layout style}
.ff-leaf{position:absolute;top:0;left:50%;width:var(--ff-page-width);height:100%;transform-origin:left center;transform-style:preserve-3d;--ff-stack-offset:0px;transform:rotateY(0deg) translateX(var(--ff-stack-offset));transition:transform var(--ff-duration) var(--ff-timing);will-change:transform;cursor:default}
.ff-leaf.ff-flipped{transform:rotateY(-180deg) translateX(var(--ff-stack-offset))}
.ff-leaf.ff-dragging{transition:none!important;cursor:grabbing}
.ff-leaf.ff-animating{pointer-events:none}
.ff-face{position:absolute;top:0;left:0;width:100%;height:100%;backface-visibility:hidden;-webkit-backface-visibility:hidden;overflow:hidden}
.ff-face-front{z-index:1;background:var(--ff-bg)}
.ff-face-back{z-index:0;transform:rotateY(180deg);background:var(--ff-bg)}
.ff-content{position:relative;width:100%;height:100%;overflow:hidden;box-sizing:border-box}
.ff-content img{width:100%;height:100%;object-fit:cover;display:block;-webkit-user-drag:none;user-select:none;pointer-events:none}
.ff-content-html{padding:30px}
.ff-shadow{position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;opacity:0;will-change:opacity}
.ff-shadow-front,.ff-shadow-back{background:none}
.ff-curl{position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;will-change:opacity}
.ff-cast-shadow{position:absolute;top:0;height:100%;pointer-events:none;opacity:0;z-index:9998;will-change:opacity}
.ff-cast-shadow-left{left:0;width:50%}
.ff-cast-shadow-right{left:50%;width:50%}
.ff-depth-shadow,.ff-depth-shadow-right{position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;opacity:0;transition:opacity 0.4s}
.ff-depth-shadow{background:linear-gradient(to left,rgba(0,0,0,1),transparent 50%)}
.ff-depth-shadow-right{background:linear-gradient(to right,rgba(0,0,0,1),transparent 50%)}
.ff-spine-shadow{position:absolute;top:0;left:50%;width:30px;height:100%;transform:translateX(-50%);background:linear-gradient(to right,transparent 0%,rgba(0,0,0,0.08) 20%,var(--ff-spine-shadow) 45%,var(--ff-spine-shadow) 55%,rgba(0,0,0,0.08) 80%,transparent 100%);z-index:9999;pointer-events:none}
.ff-blank{display:flex;align-items:center;justify-content:center;color:#ccc;font-size:14px}
.ff-book:focus{outline:2px solid #4a90d9;outline-offset:4px}`;
  }

  // ===== Event Binding =====

  _bindEvents() {
    this._book.addEventListener('pointerdown', this._onPointerDown);
    document.addEventListener('pointermove', this._onPointerMove, { passive: false });
    document.addEventListener('pointerup', this._onPointerUp);
    document.addEventListener('pointercancel', this._onPointerUp);

    if (this._opts.keyboard) {
      this._book.addEventListener('keydown', this._onKeyDown);
    }

    if (this._opts.cornerCurl) {
      this._book.addEventListener('mousemove', this._onCornerMove);
      this._book.addEventListener('mouseleave', this._onMouseLeave);
    }

    if (this._opts.responsive && typeof ResizeObserver !== 'undefined') {
      this._resizeObserver = new ResizeObserver(this._onResize);
      this._resizeObserver.observe(this._el);
    } else if (this._opts.responsive) {
      window.addEventListener('resize', this._onResize);
    }
  }

  // ===== Edge Curl (hover peek at left/right edges) =====

  _handleCornerCurl(e) {
    if (this._animating || this._dragging || this._destroyed) return;

    const rect = this._book.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const w = rect.width;
    const edgeZone = this._opts.edgeCurlZone;

    const nearRight = x > w - edgeZone;
    const nearLeft = x < edgeZone;

    if (nearRight && this._currentLeaf < this._leafCount) {
      if (!this._cornerCurling || this._cornerDir !== 'forward') {
        this._cornerPeek(this._currentLeaf, 'forward');
      }
    } else if (nearLeft && this._currentLeaf > 0) {
      if (!this._cornerCurling || this._cornerDir !== 'backward') {
        this._cornerPeek(this._currentLeaf - 1, 'backward');
      }
    } else if (this._cornerCurling) {
      this._cornerUnpeek();
    }
  }

  _handleMouseLeave() {
    if (this._cornerCurling) this._cornerUnpeek();
  }

  _cornerPeek(leafIndex, dir) {
    if (this._cornerCurling) this._cornerUnpeek(true);

    const leaf = this._leaves[leafIndex];
    if (!leaf) return;

    this._cornerCurling = true;
    this._cornerLeaf = leaf;
    this._cornerDir = dir;

    leaf.style.zIndex = this._leafCount + 5;
    leaf.style.transition = 'transform 0.35s ease-out';

    const peekAngle = this._opts.cornerCurlAngle;
    const angle = dir === 'forward' ? -peekAngle : -(180 - peekAngle);
    leaf.style.transform = `rotateY(${angle}deg) translateX(0px)`;

    this._updateCurlEffect(leaf, angle, dir === 'forward');
  }

  _cornerUnpeek(instant) {
    if (!this._cornerCurling || !this._cornerLeaf) return;

    const leaf = this._cornerLeaf;

    if (instant) {
      // Reset immediately: set transition none + clear transform, force reflow,
      // then remove inline transition so CSS class transition works for subsequent flips
      leaf.style.transition = 'none';
      leaf.style.transform = '';
      void leaf.offsetHeight;
      leaf.style.transition = '';
    } else {
      // Animate back smoothly
      leaf.style.transition = 'transform 0.35s ease-out';
      leaf.style.transform = '';
    }

    this._clearCurlEffect(leaf);

    if (!instant) {
      const ref = leaf;
      setTimeout(() => {
        ref.style.transition = '';
        this._updateZIndex();
      }, 360);
    } else {
      this._updateZIndex();
    }

    this._cornerCurling = false;
    this._cornerLeaf = null;
    this._cornerDir = null;
  }

  // ===== Curl Effect Engine =====

  /**
   * Build a multi-stop linear-gradient simulating cylindrical paper curl.
   * concave shadow -> specular highlight -> convex shadow -> S-curve highlight -> edge glow
   */
  _buildCurlGradient(pos, width, intensity, dir) {
    const s = intensity * 0.70;
    const h = intensity * 0.95;
    const w = width;
    const p = pos;
    const c = (v) => clamp(v, 0, 100).toFixed(1);
    const a = (v) => Math.max(0, v).toFixed(3);

    return (
      `linear-gradient(to ${dir}, ` +
      `transparent ${c(p - w)}%, ` +
      `rgba(0,0,0,${a(s * 0.03)}) ${c(p - w * 0.9)}%, ` +
      `rgba(0,0,0,${a(s * 0.1)}) ${c(p - w * 0.76)}%, ` +
      `rgba(0,0,0,${a(s * 0.3)}) ${c(p - w * 0.58)}%, ` +
      `rgba(0,0,0,${a(s * 0.6)}) ${c(p - w * 0.4)}%, ` +
      `rgba(0,0,0,${a(s * 0.85)}) ${c(p - w * 0.24)}%, ` +
      `rgba(0,0,0,${a(s)}) ${c(p - w * 0.1)}%, ` +
      `rgba(0,0,0,${a(s * 0.7)}) ${c(p - 4)}%, ` +
      `rgba(255,255,255,${a(h * 0.2)}) ${c(p - 2.5)}%, ` +
      `rgba(255,255,255,${a(h * 0.65)}) ${c(p - 1)}%, ` +
      `rgba(255,255,255,${a(h)}) ${c(p)}%, ` +
      `rgba(255,255,255,${a(h * 0.65)}) ${c(p + 1)}%, ` +
      `rgba(255,255,255,${a(h * 0.2)}) ${c(p + 2.5)}%, ` +
      `rgba(0,0,0,${a(s * 0.55)}) ${c(p + w * 0.06)}%, ` +
      `rgba(0,0,0,${a(s * 0.35)}) ${c(p + w * 0.16)}%, ` +
      `rgba(0,0,0,${a(s * 0.2)}) ${c(p + w * 0.28)}%, ` +
      `rgba(255,255,255,${a(h * 0.05)}) ${c(p + w * 0.36)}%, ` +
      `rgba(255,255,255,${a(h * 0.1)}) ${c(p + w * 0.44)}%, ` +
      `rgba(255,255,255,${a(h * 0.05)}) ${c(p + w * 0.52)}%, ` +
      `rgba(0,0,0,${a(s * 0.08)}) ${c(p + w * 0.64)}%, ` +
      `rgba(0,0,0,${a(s * 0.03)}) ${c(p + w * 0.78)}%, ` +
      `rgba(255,255,255,${a(h * 0.08)}) ${c(p + w * 0.88)}%, ` +
      `rgba(255,255,255,${a(h * 0.18)}) ${c(p + w * 0.96)}%, ` +
      `transparent ${c(p + w)}%)`
    );
  }

  /**
   * Update all curl visual effects for a leaf at a given rotation angle.
   * Uses cached _ff references for performance.
   *
   * Shadow model:
   *  1. Curl gradient overlay — cylindrical fold highlight/shadow on the turning page
   *  2. Dynamic self-shadow — fold-edge shadow that spreads across the page face
   *  3. Paper edge — multi-layer inset box-shadow for thickness illusion
   *  4. Cast shadow — umbra + penumbra on the underlying pages, width grows with lift
   */
  _updateCurlEffect(leaf, angle, forward) {
    const progress = Math.abs(angle) / 180;
    const curlIntensity = Math.sin(progress * Math.PI);
    const curlWidth = 30 + curlIntensity * 55;
    const refs = leaf._ff;
    const angleRad = Math.abs(angle) * (Math.PI / 180);

    // --- 1. Curl gradient overlay (cylindrical fold simulation) ---
    const frontPos = (1 - progress) * 100;
    if (refs.frontCurl) {
      refs.frontCurl.style.background =
        curlIntensity > 0.01
          ? this._buildCurlGradient(frontPos, curlWidth, curlIntensity, 'right')
          : 'none';
    }
    const backPos = progress * 100;
    if (refs.backCurl) {
      refs.backCurl.style.background =
        curlIntensity > 0.01
          ? this._buildCurlGradient(backPos, curlWidth, curlIntensity, 'left')
          : 'none';
    }

    // --- 2. Dynamic self-shadow on faces ---
    // Simulates the shadow cast by the lifted page near the fold crease.
    // The gradient originates at the fold edge (spine side) and fades inward.
    // Spread and intensity grow as the page lifts toward vertical.
    const foldI = curlIntensity * 0.45;
    const spreadPct = 12 + curlIntensity * 40;

    if (refs.frontShadow) {
      if (foldI > 0.01) {
        refs.frontShadow.style.opacity = '1';
        refs.frontShadow.style.background =
          `linear-gradient(to right, ` +
          `rgba(0,0,0,${(foldI * 0.55).toFixed(3)}) 0%, ` +
          `rgba(0,0,0,${(foldI * 0.3).toFixed(3)}) ${(spreadPct * 0.35).toFixed(1)}%, ` +
          `rgba(0,0,0,${(foldI * 0.1).toFixed(3)}) ${spreadPct.toFixed(1)}%, ` +
          `transparent ${(spreadPct * 1.6).toFixed(1)}%)`;
      } else {
        refs.frontShadow.style.opacity = '0';
      }
    }
    if (refs.backShadow) {
      if (foldI > 0.01) {
        refs.backShadow.style.opacity = '1';
        refs.backShadow.style.background =
          `linear-gradient(to left, ` +
          `rgba(0,0,0,${(foldI * 0.55).toFixed(3)}) 0%, ` +
          `rgba(0,0,0,${(foldI * 0.3).toFixed(3)}) ${(spreadPct * 0.35).toFixed(1)}%, ` +
          `rgba(0,0,0,${(foldI * 0.1).toFixed(3)}) ${spreadPct.toFixed(1)}%, ` +
          `transparent ${(spreadPct * 1.6).toFixed(1)}%)`;
      } else {
        refs.backShadow.style.opacity = '0';
      }
    }

    // --- 3. Paper edge thickness (multi-layer inset box-shadow) ---
    // Layer 1: dark outer edge shadow
    // Layer 2: bright specular highlight on paper edge
    // Layer 3: subtle inner ambient shadow for depth
    const edgeI = curlIntensity;
    if (refs.frontFace) {
      refs.frontFace.style.boxShadow =
        edgeI > 0.02
          ? `inset -3px 0 ${(12 * edgeI).toFixed(1)}px rgba(0,0,0,${(0.28 * edgeI).toFixed(3)}), ` +
            `inset -1px 0 0 rgba(255,255,255,${(0.5 * edgeI).toFixed(3)}), ` +
            `inset 4px 0 ${(18 * edgeI).toFixed(1)}px rgba(0,0,0,${(0.08 * edgeI).toFixed(3)})`
          : '';
    }
    if (refs.backFace) {
      refs.backFace.style.boxShadow =
        edgeI > 0.02
          ? `inset 3px 0 ${(12 * edgeI).toFixed(1)}px rgba(0,0,0,${(0.28 * edgeI).toFixed(3)}), ` +
            `inset 1px 0 0 rgba(255,255,255,${(0.5 * edgeI).toFixed(3)}), ` +
            `inset -4px 0 ${(18 * edgeI).toFixed(1)}px rgba(0,0,0,${(0.08 * edgeI).toFixed(3)})`
          : '';
    }

    // --- 4. Cast shadow on underlying pages ---
    // Physics-based: shadow penumbra widens as the page lifts further from the surface.
    // liftHeight ~ sin(angle) peaks at 90°.
    // Umbra = hard shadow core near the spine; penumbra = soft outer fade.
    const liftHeight = Math.sin(angleRad);
    const castI = curlIntensity * 0.65;
    const umbra = 4 + liftHeight * 18;
    const penumbra = 12 + liftHeight * 80;

    if (forward || progress < 0.5) {
      if (castI > 0.01) {
        this._castShadowRight.style.opacity = '1';
        this._castShadowRight.style.background =
          `linear-gradient(to right, ` +
          `rgba(0,0,0,${(castI * 1.0).toFixed(3)}) 0px, ` +
          `rgba(0,0,0,${(castI * 0.8).toFixed(3)}) ${umbra.toFixed(0)}px, ` +
          `rgba(0,0,0,${(castI * 0.35).toFixed(3)}) ${penumbra.toFixed(0)}px, ` +
          `rgba(0,0,0,${(castI * 0.08).toFixed(3)}) ${(penumbra * 1.8).toFixed(0)}px, ` +
          `transparent ${(penumbra * 3).toFixed(0)}px)`;
      } else {
        this._castShadowRight.style.opacity = '0';
      }
    }
    if (!forward || progress >= 0.5) {
      if (castI > 0.01) {
        this._castShadowLeft.style.opacity = '1';
        this._castShadowLeft.style.background =
          `linear-gradient(to left, ` +
          `rgba(0,0,0,${(castI * 1.0).toFixed(3)}) 0px, ` +
          `rgba(0,0,0,${(castI * 0.8).toFixed(3)}) ${umbra.toFixed(0)}px, ` +
          `rgba(0,0,0,${(castI * 0.35).toFixed(3)}) ${penumbra.toFixed(0)}px, ` +
          `rgba(0,0,0,${(castI * 0.08).toFixed(3)}) ${(penumbra * 1.8).toFixed(0)}px, ` +
          `transparent ${(penumbra * 3).toFixed(0)}px)`;
      } else {
        this._castShadowLeft.style.opacity = '0';
      }
    }

    // --- 5. Page curl geometry (clip-path) ---
    // Curves the free edge of each face inward to simulate paper bending.
    // The curve follows a sine profile along the page height, peaking at center.
    // Front face: right edge curves in. Back face: left edge curves in (local coords).
    const curlDepth = curlIntensity * 10; // max 10% of page width at peak
    if (curlDepth > 0.3) {
      const N = 12;
      // Front face — curve right edge
      let fp = '0% 0%';
      for (let i = 0; i <= N; i++) {
        const t = i / N;
        const d = curlDepth * Math.sin(t * Math.PI);
        fp += `, ${(100 - d).toFixed(2)}% ${(t * 100).toFixed(1)}%`;
      }
      fp += ', 0% 100%';
      refs.frontFace.style.clipPath = `polygon(${fp})`;

      // Back face — curve left edge (in local coords, before its rotateY(180deg))
      let bp = '';
      for (let i = 0; i <= N; i++) {
        const t = i / N;
        const d = curlDepth * Math.sin(t * Math.PI);
        bp += (i > 0 ? ', ' : '') + `${d.toFixed(2)}% ${(t * 100).toFixed(1)}%`;
      }
      bp += ', 100% 100%, 100% 0%';
      refs.backFace.style.clipPath = `polygon(${bp})`;
    } else {
      refs.frontFace.style.clipPath = '';
      refs.backFace.style.clipPath = '';
    }
  }

  _clearCurlEffect(leaf) {
    if (this._curlRAF) {
      cancelAnimationFrame(this._curlRAF);
      this._curlRAF = null;
    }

    const refs = leaf._ff;
    if (refs.frontCurl) refs.frontCurl.style.background = 'none';
    if (refs.backCurl) refs.backCurl.style.background = 'none';
    if (refs.frontShadow) {
      refs.frontShadow.style.opacity = '0';
      refs.frontShadow.style.background = '';
    }
    if (refs.backShadow) {
      refs.backShadow.style.opacity = '0';
      refs.backShadow.style.background = '';
    }
    if (refs.frontFace) {
      refs.frontFace.style.boxShadow = '';
      refs.frontFace.style.clipPath = '';
    }
    if (refs.backFace) {
      refs.backFace.style.boxShadow = '';
      refs.backFace.style.clipPath = '';
    }
    if (refs.frontDepth) refs.frontDepth.style.opacity = 0;
    if (refs.backDepth) refs.backDepth.style.opacity = 0;

    this._castShadowLeft.style.opacity = '0';
    this._castShadowLeft.style.background = '';
    this._castShadowRight.style.opacity = '0';
    this._castShadowRight.style.background = '';
  }

  /**
   * RAF loop that drives curl effect in sync with CSS transition.
   * @param {Element} leaf
   * @param {boolean} forward - shadow direction
   * @param {number} [fromAngle] - start angle (for drag-to-flip continuity)
   * @param {number} [toAngle] - explicit end angle (for snap-back)
   */
  _animateCurl(leaf, forward, fromAngle, toAngle, customDuration, customEase) {
    const startTime = performance.now();
    const duration = (customDuration !== undefined ? customDuration : this._opts.duration) * 1000;
    const startAngle =
      fromAngle !== undefined ? fromAngle : forward ? 0 : -180;
    const endAngle =
      toAngle !== undefined ? toAngle : forward ? -180 : 0;
    const easeFn = customEase || naturalEase;

    const tick = () => {
      const elapsed = performance.now() - startTime;
      const t = clamp(elapsed / duration, 0, 1);
      const easedT = easeFn(t);
      const currentAngle = startAngle + (endAngle - startAngle) * easedT;

      this._updateCurlEffect(leaf, currentAngle, forward);

      if (t < 1) {
        this._curlRAF = requestAnimationFrame(tick);
      }
    };

    this._curlRAF = requestAnimationFrame(tick);
  }

  // ===== Flip API =====

  flipNext() {
    if (this._animating || this._currentLeaf >= this._leafCount) return;
    if (this._cornerCurling) this._cornerUnpeek(true);
    this._flipLeaf(this._currentLeaf, true);
  }

  flipPrev() {
    if (this._animating || this._currentLeaf <= 0) return;
    if (this._cornerCurling) this._cornerUnpeek(true);
    this._flipLeaf(this._currentLeaf - 1, false);
  }

  flipTo(pageIndex) {
    if (this._cornerCurling) this._cornerUnpeek(true);

    const clampedTarget = Math.max(
      0,
      Math.min(Math.ceil(pageIndex / 2), this._leafCount)
    );
    if (clampedTarget === this._currentLeaf) return;

    const duration = this._opts.duration;
    this._book.style.setProperty('--ff-duration', '0s');

    for (let i = 0; i < this._leafCount; i++) {
      if (i < clampedTarget) {
        this._leaves[i].classList.add('ff-flipped');
      } else {
        this._leaves[i].classList.remove('ff-flipped');
      }
    }

    this._currentLeaf = clampedTarget;
    this._updateZIndex();

    requestAnimationFrame(() => {
      this._book.style.setProperty('--ff-duration', duration + 's');
      this._emit('flip', { page: this.currentPage, leaf: this._currentLeaf });
    });
  }

  get currentPage() {
    return this._currentLeaf;
  }

  get pageCount() {
    return this._pages.length;
  }

  /**
   * Core flip animation.
   * @param {number} leafIndex
   * @param {boolean} forward
   * @param {number} [fromAngle] - current angle if continuing from drag
   * @param {number} [duration] - custom duration in seconds (inertia-driven)
   */
  _flipLeaf(leafIndex, forward, fromAngle, duration) {
    const leaf = this._leaves[leafIndex];
    if (!leaf) return;

    this._animating = true;
    leaf.classList.add('ff-animating');
    leaf.style.zIndex = this._leafCount + 10;

    // Use custom duration with ease-out curve if inertia-driven, otherwise default
    const dur = duration !== undefined ? duration : this._opts.duration;
    const isInertia = duration !== undefined;
    const curveCss = isInertia ? 'cubic-bezier(0,0,0.2,1)' : this._opts.timing;
    const easeFn = isInertia ? easeOut : naturalEase;

    leaf.style.transition = `transform ${dur}s ${curveCss}`;

    // Set target rotation via CSS class
    if (forward) {
      leaf.classList.add('ff-flipped');
    } else {
      leaf.classList.remove('ff-flipped');
    }

    // Clear inline transform — CSS transition animates from current rendered
    // position (0deg, -180deg, or drag angle) to the class-defined target
    leaf.style.transform = '';

    // Sync curl gradient effect with the CSS transition
    this._animateCurl(leaf, forward, fromAngle, undefined, dur, easeFn);

    const onEnd = () => {
      leaf.removeEventListener('transitionend', onTransitionEnd);
      clearTimeout(fallbackTimer);

      leaf.classList.remove('ff-animating');
      leaf.style.transition = '';
      this._clearCurlEffect(leaf);

      this._currentLeaf = forward ? leafIndex + 1 : leafIndex;
      this._animating = false;
      this._updateZIndex();
      this._emit('flip', { page: this.currentPage, leaf: this._currentLeaf });
    };

    const onTransitionEnd = (e) => {
      if (e.target === leaf && e.propertyName === 'transform') onEnd();
    };

    leaf.addEventListener('transitionend', onTransitionEnd);
    const fallbackTimer = setTimeout(
      onEnd,
      (dur + 0.1) * 1000
    );
  }

  // ===== Drag Handling =====

  _handlePointerDown(e) {
    if (this._animating || this._destroyed || e.button !== 0) return;

    if (this._cornerCurling) this._cornerUnpeek(true);

    const rect = this._book.getBoundingClientRect();
    this._dragRect = rect;
    this._dragSpineX = rect.left + rect.width / 2;
    this._dragPageWidth = rect.width / 2;
    const spineX = this._dragSpineX;
    const pageWidth = this._dragPageWidth;
    const relX = e.clientX - rect.left;

    let leafIndex, dragForward;
    if (relX > rect.width / 2) {
      leafIndex = this._currentLeaf;
      dragForward = true;
    } else {
      leafIndex = this._currentLeaf - 1;
      dragForward = false;
    }

    if (leafIndex < 0 || leafIndex >= this._leafCount) return;

    this._dragging = true;
    this._dragForward = dragForward;
    this._dragLeaf = this._leaves[leafIndex];
    this._dragLeafIndex = leafIndex;
    this._dragAngle = dragForward ? 0 : -180;

    // Edge offset: distance from pointer to the page's free edge.
    // This ensures the page edge tracks the pointer without an initial jump.
    if (dragForward) {
      this._dragEdgeOffset = (spineX + pageWidth) - e.clientX;
    } else {
      this._dragEdgeOffset = (spineX - pageWidth) - e.clientX;
    }

    this._dragLeaf.classList.add('ff-dragging');
    this._dragLeaf.style.zIndex = this._leafCount + 10;
    this._dragLeaf.style.setProperty('--ff-stack-offset', '0px');

    this._velocitySamples = [];

    e.preventDefault();
    this._book.setPointerCapture(e.pointerId);
  }

  _handlePointerMove(e) {
    if (!this._dragging || !this._dragLeaf) return;

    e.preventDefault();

    const spineX = this._dragSpineX;
    const pageWidth = this._dragPageWidth;

    // Target edge position = pointer + initial offset from edge
    const targetEdgeX = e.clientX + this._dragEdgeOffset;

    // Map edge position to rotation angle:
    // edgeX = spineX + pageWidth * cos(angle)  →  angle = -acos(...)
    const cosAngle = clamp((targetEdgeX - spineX) / pageWidth, -1, 1);
    const angle = -Math.acos(cosAngle) * (180 / Math.PI);

    this._dragAngle = angle;
    this._dragLeaf.style.transform = `rotateY(${angle}deg) translateX(0px)`;
    this._updateCurlEffect(this._dragLeaf, angle, this._dragForward);

    // Track velocity samples
    const now = performance.now();
    this._velocitySamples.push({ angle, time: now });
    if (this._velocitySamples.length > 5) this._velocitySamples.shift();
  }

  _handlePointerUp() {
    if (!this._dragging || !this._dragLeaf) return;

    this._dragging = false;
    const leaf = this._dragLeaf;
    const dragAngle = this._dragAngle;

    // Re-enable CSS transition (was disabled by ff-dragging)
    leaf.classList.remove('ff-dragging');

    const progress = Math.abs(dragAngle) / 180;
    const threshold = this._opts.dragThreshold;

    // Compute velocity from recent samples
    let velocity = 0;
    const samples = this._velocitySamples;
    if (samples.length >= 2) {
      const now = performance.now();
      let first = samples[0];
      for (let i = 0; i < samples.length; i++) {
        if (now - samples[i].time < 100) { first = samples[i]; break; }
      }
      const last = samples[samples.length - 1];
      const dt = last.time - first.time;
      if (dt > 5) {
        velocity = ((last.angle - first.angle) / dt) * 1000; // deg/s
      }
    }

    let shouldFlip;
    if (this._dragForward) {
      shouldFlip = progress > threshold;
    } else {
      shouldFlip = progress < 1 - threshold;
    }

    // Velocity override
    const velThreshold = this._opts.velocityThreshold;
    if (Math.abs(velocity) > velThreshold) {
      if (this._dragForward) {
        shouldFlip = velocity < -velThreshold;
      } else {
        shouldFlip = velocity > velThreshold;
      }
    }

    // Calculate dynamic duration based on velocity
    const baseDuration = this._opts.duration;
    const remainingDeg = shouldFlip
      ? (this._dragForward ? 180 - Math.abs(dragAngle) : Math.abs(dragAngle))
      : (this._dragForward ? Math.abs(dragAngle) : 180 - Math.abs(dragAngle));
    let duration;
    if (Math.abs(velocity) > velThreshold) {
      duration = clamp(remainingDeg / Math.abs(velocity), 0.15, baseDuration);
    } else {
      duration = clamp(baseDuration * (remainingDeg / 180), 0.2, baseDuration);
    }

    if (shouldFlip) {
      // Complete the flip — animate from drag angle to target
      this._flipLeaf(this._dragLeafIndex, this._dragForward, dragAngle, duration);
    } else {
      // Snap back with animated curl effect
      this._animating = true;
      leaf.classList.add('ff-animating');

      const isInertia = Math.abs(velocity) > velThreshold;
      const easeFn = isInertia ? easeOut : naturalEase;
      const curveCss = isInertia
        ? 'cubic-bezier(0,0,0.2,1)' : this._opts.timing;

      leaf.style.transition = `transform ${duration}s ${curveCss}`;
      leaf.style.transform = ''; // CSS transition animates to class-defined rotation

      // Animate curl in sync: forward snap → back to 0°, backward snap → back to -180°
      const snapTarget = this._dragForward ? 0 : -180;
      this._animateCurl(leaf, this._dragForward, dragAngle, snapTarget, duration, easeFn);

      const onEnd = () => {
        clearTimeout(fallback);
        leaf.removeEventListener('transitionend', onTE);
        leaf.classList.remove('ff-animating');
        leaf.style.transition = '';
        this._clearCurlEffect(leaf);
        this._animating = false;
        this._updateZIndex();
      };
      const onTE = (ev) => {
        if (ev.target === leaf && ev.propertyName === 'transform') onEnd();
      };
      leaf.addEventListener('transitionend', onTE);
      const fallback = setTimeout(
        onEnd,
        (duration + 0.1) * 1000
      );
    }

    this._dragLeaf = null;
  }

  // ===== Keyboard =====

  _handleKeyDown(e) {
    if (this._destroyed) return;
    switch (e.key) {
      case 'ArrowRight':
      case 'PageDown':
        e.preventDefault();
        this.flipNext();
        break;
      case 'ArrowLeft':
      case 'PageUp':
        e.preventDefault();
        this.flipPrev();
        break;
      case 'Home':
        e.preventDefault();
        this.flipTo(0);
        break;
      case 'End':
        e.preventDefault();
        this.flipTo(this._pages.length - 1);
        break;
    }
  }

  // ===== Z-Index Management =====

  _updateZIndex() {
    const thickness = this._opts.pageThickness;
    const maxOffset = this._opts.maxStackOffset;

    for (let i = 0; i < this._leafCount; i++) {
      const leaf = this._leaves[i];
      const refs = leaf._ff;

      if (i < this._currentLeaf) {
        // Flipped leaves (left side): higher index = on top
        leaf.style.zIndex = i;
        const depth = this._currentLeaf - i;
        const offset = Math.min(depth * thickness, maxOffset);
        leaf.style.setProperty('--ff-stack-offset', offset + 'px');
        // Depth shadow on back face (visible when flipped)
        if (refs.backDepth) {
          refs.backDepth.style.opacity = depth <= 1 ? 0 : Math.min((depth - 1) * 0.15, 0.6);
        }
        if (refs.frontDepth) refs.frontDepth.style.opacity = 0;
      } else {
        // Unflipped leaves (right side): lower index = on top
        leaf.style.zIndex = this._leafCount - i;
        const depth = i - this._currentLeaf;
        const offset = Math.min(depth * thickness, maxOffset);
        leaf.style.setProperty('--ff-stack-offset', offset + 'px');
        // Depth shadow on front face (darkens deeper pages)
        if (refs.frontDepth) {
          refs.frontDepth.style.opacity = depth === 0 ? 0 : Math.min(depth * 0.12, 0.5);
        }
        if (refs.backDepth) refs.backDepth.style.opacity = 0;
      }
    }
  }

  // ===== Responsive =====

  _handleResize() {
    if (this._destroyed || !this._book) return;

    const parentWidth = this._el.clientWidth;
    const bookWidth = this._opts.width;

    if (parentWidth < bookWidth) {
      const scale = parentWidth / bookWidth;
      this._book.style.transform = `scale(${scale})`;
      this._book.style.marginBottom =
        -(this._opts.height * (1 - scale)) + 'px';
    } else {
      this._book.style.transform = '';
      this._book.style.marginBottom = '';
    }
  }

  // ===== Event System =====

  on(event, fn) {
    if (!this._listeners[event]) this._listeners[event] = [];
    this._listeners[event].push(fn);
    return this;
  }

  off(event, fn) {
    const arr = this._listeners[event];
    if (arr) this._listeners[event] = arr.filter((f) => f !== fn);
    return this;
  }

  _emit(event, data) {
    const arr = this._listeners[event];
    if (arr) arr.forEach((fn) => fn(data));
  }

  // ===== Destroy =====

  destroy() {
    this._destroyed = true;

    if (this._curlRAF) {
      cancelAnimationFrame(this._curlRAF);
      this._curlRAF = null;
    }
    if (this._cornerCurling) this._cornerUnpeek(true);

    this._book.removeEventListener('pointerdown', this._onPointerDown);
    document.removeEventListener('pointermove', this._onPointerMove);
    document.removeEventListener('pointerup', this._onPointerUp);
    document.removeEventListener('pointercancel', this._onPointerUp);
    this._book.removeEventListener('keydown', this._onKeyDown);
    this._book.removeEventListener('mousemove', this._onCornerMove);
    this._book.removeEventListener('mouseleave', this._onMouseLeave);

    if (this._resizeObserver) {
      this._resizeObserver.disconnect();
    } else {
      window.removeEventListener('resize', this._onResize);
    }

    this._el.removeChild(this._book);
    this._leaves = [];
    this._listeners = {};
    this._emit('destroy');
  }
}

export default FlipFolio;
