/**
 * FlipFolio - A vanilla JS page-flip book component
 * Uses Three.js WebGL for realistic paper bending with cylindrical curl deformation
 * 2-pages-per-leaf: front = recto (right), back = verso (left when flipped)
 */

import {
  WebGLRenderer,
  Scene,
  PerspectiveCamera,
  AmbientLight,
  DirectionalLight,
  PlaneGeometry,
  ShaderMaterial,
  DoubleSide,
  Mesh,
  CanvasTexture,
  TextureLoader,
  SRGBColorSpace,
  MeshBasicMaterial,
  FrontSide,
} from 'three';

const DEFAULTS = {
  width: 800,
  height: 600,
  pages: [],
  startPage: 0,
  duration: 0.7,
  dragThreshold: 0.3,
  responsive: true,
  keyboard: true,
  clickToFlip: false,
  autoInjectCSS: true,
  cornerCurl: true,
  edgeCurlZone: 60,
  velocityThreshold: 0.4, // in progress/s now (0-1 range)
};

let cssInjected = false;

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

// ===== Bend Deformation Algorithm =====

/**
 * Deform a PlaneGeometry to simulate cylindrical paper fold.
 * @param {Float32Array} posArray - geometry position attribute array (mutated)
 * @param {Float32Array} origArray - original vertex positions (read-only)
 * @param {number} flipProgress - 0 (flat right) to 1 (flat left)
 * @param {number} pageWidth - width of the page
 * @param {number} curlRadius - radius of the curl cylinder
 */
function deformPageGeometry(posArray, origArray, flipProgress, pageWidth, curlRadius) {
  const foldX = pageWidth * (1 - flipProgress);
  const R = curlRadius;
  const PI = Math.PI;

  for (let i = 0; i < origArray.length; i += 3) {
    const ox = origArray[i], oy = origArray[i + 1];

    if (ox <= foldX) {
      // Flat right side (not yet turned)
      posArray[i] = ox;
      posArray[i + 1] = oy;
      posArray[i + 2] = 0;
    } else {
      const d = ox - foldX;
      const theta = d / R;

      if (theta <= PI) {
        // Cylinder arc
        posArray[i] = foldX + R * (Math.cos(theta) - 1);
        posArray[i + 1] = oy;
        posArray[i + 2] = R * Math.sin(theta);
      } else {
        // Flat left side (past arc)
        const excess = d - PI * R;
        posArray[i] = foldX - 2 * R - excess;
        posArray[i + 1] = oy;
        posArray[i + 2] = 0;
      }
    }
  }
}

/**
 * Compute dynamic curl radius that varies with flip progress.
 * Peaks at progress=0.5 (mid-flip) for maximum visible curl.
 */
function computeCurlRadius(progress, pageWidth) {
  const R_MIN = pageWidth * 0.01;
  const R_MAX = pageWidth * 0.06;
  const midDist = Math.sin(progress * Math.PI); // peaks at 0.5
  return R_MIN + (R_MAX - R_MIN) * midDist;
}

// ===== Easing =====

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

// ===== Shader =====

const PAGE_VERTEX_SHADER = `
varying vec2 vUv;
varying vec3 vNormal;
void main() {
  vUv = uv;
  vNormal = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const PAGE_FRAGMENT_SHADER = `
uniform sampler2D frontTex;
uniform sampler2D backTex;
uniform float shadowIntensity;
varying vec2 vUv;
varying vec3 vNormal;
void main() {
  vec4 color;
  if (gl_FrontFacing) {
    color = texture2D(frontTex, vUv);
  } else {
    color = texture2D(backTex, vec2(1.0 - vUv.x, vUv.y));
  }
  // Simple diffuse lighting
  vec3 n = gl_FrontFacing ? vNormal : -vNormal;
  float light = 0.65 + 0.35 * max(dot(n, normalize(vec3(0.0, 0.5, 1.0))), 0.0);
  color.rgb *= light;
  // Apply shadow overlay for depth stacking
  color.rgb *= (1.0 - shadowIntensity);
  gl_FragColor = vec4(color.rgb, 1.0);
}
`;

// ===== Texture Pipeline =====

/**
 * Create a white canvas texture as fallback.
 */
function createWhiteTexture(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

/**
 * Render HTML content to a canvas texture using html2canvas or SVG foreignObject fallback.
 */
async function htmlToTexture(htmlContent, width, height, className, style) {
  const container = document.createElement('div');
  container.style.cssText = `position:fixed;left:-9999px;top:-9999px;width:${width}px;height:${height}px;overflow:hidden;background:#fff;`;
  container.innerHTML = htmlContent;

  if (className) container.firstElementChild?.classList.add(className);
  if (style && container.firstElementChild) {
    Object.assign(container.firstElementChild.style, style);
  }

  document.body.appendChild(container);

  let tex;
  try {
    if (typeof window.html2canvas === 'function') {
      const canvas = await window.html2canvas(container, {
        width,
        height,
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
      });
      tex = new CanvasTexture(canvas);
      tex.colorSpace = SRGBColorSpace;
    } else {
      // SVG foreignObject fallback
      tex = await svgForeignObjectTexture(container, width, height);
    }
  } catch (_) {
    tex = createWhiteTexture(width, height);
  } finally {
    document.body.removeChild(container);
  }

  return tex;
}

/**
 * SVG foreignObject fallback when html2canvas is unavailable.
 */
async function svgForeignObjectTexture(element, width, height) {
  const html = element.outerHTML;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <foreignObject width="100%" height="100%">
      <div xmlns="http://www.w3.org/1999/xhtml" style="width:${width}px;height:${height}px;overflow:hidden;background:#fff;">
        ${html}
      </div>
    </foreignObject>
  </svg>`;

  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = width * 2;
      canvas.height = height * 2;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      const tex = new CanvasTexture(canvas);
      tex.colorSpace = SRGBColorSpace;
      resolve(tex);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(createWhiteTexture(width, height));
    };
    img.src = url;
  });
}

/**
 * Load a page descriptor into a Three.js texture.
 */
async function loadPageTexture(page, pageIndex, width, height) {
  if (page == null) {
    return createWhiteTexture(width, height);
  }

  if (typeof page === 'string') {
    // Image URL
    return new Promise((resolve) => {
      const loader = new TextureLoader();
      loader.load(
        page,
        (tex) => { tex.colorSpace = SRGBColorSpace; resolve(tex); },
        undefined,
        () => resolve(createWhiteTexture(width, height))
      );
    });
  }

  if (typeof page === 'object') {
    if (page.type === 'image') {
      return new Promise((resolve) => {
        const loader = new TextureLoader();
        loader.load(
          page.src,
          (tex) => { tex.colorSpace = SRGBColorSpace; resolve(tex); },
          undefined,
          () => resolve(createWhiteTexture(width, height))
        );
      });
    }

    if (page.type === 'html') {
      return htmlToTexture(page.content, width, height, page.className, page.style);
    }

    if (page.type === 'element') {
      const container = document.createElement('div');
      container.style.cssText = `position:fixed;left:-9999px;top:-9999px;width:${width}px;height:${height}px;overflow:hidden;background:#fff;`;
      container.appendChild(page.element.cloneNode(true));
      document.body.appendChild(container);

      let tex;
      try {
        if (typeof window.html2canvas === 'function') {
          const canvas = await window.html2canvas(container, {
            width,
            height,
            scale: 2,
            useCORS: true,
            backgroundColor: '#ffffff',
          });
          tex = new CanvasTexture(canvas);
          tex.colorSpace = SRGBColorSpace;
        } else {
          tex = await svgForeignObjectTexture(container, width, height);
        }
      } catch (_) {
        tex = createWhiteTexture(width, height);
      } finally {
        document.body.removeChild(container);
      }
      return tex;
    }

    if (page.type === 'canvas') {
      const canvas = document.createElement('canvas');
      canvas.width = width * 2;
      canvas.height = height * 2;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      if (typeof page.render === 'function') {
        page.render(ctx, canvas.width, canvas.height);
      }
      const tex = new CanvasTexture(canvas);
      tex.colorSpace = SRGBColorSpace;
      return tex;
    }
  }

  return createWhiteTexture(width, height);
}

// ===== FlipFolio Class =====

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
    this._listeners = {};
    this._meshes = [];
    this._destroyed = false;
    this._ready = false;

    this._cornerCurling = false;
    this._cornerMeshIndex = -1;
    this._cornerDir = null;

    this._velocitySamples = [];
    this._flipRAF = null;

    // Bound handlers
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
    this._initAsync();
  }

  // ===== Scene Setup =====

  _build() {
    const o = this._opts;

    this._book = document.createElement('div');
    this._book.className = 'ff-book' + (o.responsive ? ' ff-responsive' : '');
    this._book.style.setProperty('--ff-width', o.width + 'px');
    this._book.style.setProperty('--ff-height', o.height + 'px');
    this._book.setAttribute('tabindex', '0');
    this._book.setAttribute('role', 'region');
    this._book.setAttribute('aria-label', 'Book viewer');

    // Page dimensions (half-width for each page)
    this._pageWidth = o.width / 2;
    this._pageHeight = o.height;

    // Three.js setup
    this._renderer = new WebGLRenderer({ alpha: true, antialias: true });
    this._renderer.setSize(o.width, o.height);
    this._renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this._renderer.outputColorSpace = SRGBColorSpace;
    this._canvas = this._renderer.domElement;

    this._scene = new Scene();

    // Camera: position so the book fills the view
    const fov = 45;
    const dist = (this._pageHeight / 2) / Math.tan((fov / 2) * Math.PI / 180);
    this._camera = new PerspectiveCamera(fov, o.width / o.height, 1, dist * 3);
    this._camera.position.set(0, 0, dist);
    this._camera.lookAt(0, 0, 0);

    // Lighting
    const ambient = new AmbientLight(0xffffff, 0.7);
    this._scene.add(ambient);

    const dirLight = new DirectionalLight(0xffffff, 0.4);
    dirLight.position.set(0, dist * 0.5, dist);
    this._scene.add(dirLight);

    // Spine shadow (vertical semi-transparent plane at x=0)
    const spineGeo = new PlaneGeometry(8, this._pageHeight);
    const spineMat = new MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.2,
      depthWrite: false,
      side: FrontSide,
    });
    this._spineShadow = new Mesh(spineGeo, spineMat);
    this._spineShadow.position.set(0, 0, 0.5);
    this._spineShadow.renderOrder = 1000;
    this._scene.add(this._spineShadow);

    this._book.appendChild(this._canvas);
    this._el.appendChild(this._book);
  }

  /**
   * Load textures and create meshes asynchronously.
   */
  async _initAsync() {
    const pw = this._pageWidth;
    const ph = this._pageHeight;
    const texWidth = Math.round(pw);
    const texHeight = Math.round(ph);

    // Load all page textures
    const textures = await Promise.all(
      this._pages.map((page, i) => loadPageTexture(page, i, texWidth, texHeight))
    );

    if (this._destroyed) return;

    this._textures = textures;

    // Create leaf meshes
    for (let i = 0; i < this._leafCount; i++) {
      const mesh = this._createLeafMesh(i, textures);
      this._meshes.push(mesh);
      this._scene.add(mesh);
    }

    // Apply startPage
    if (this._opts.startPage > 0) {
      const startLeaf = Math.min(
        Math.ceil(this._opts.startPage / 2),
        this._leafCount
      );
      this._currentLeaf = startLeaf;
      for (let i = 0; i < this._currentLeaf; i++) {
        this._setMeshFlat(i, true); // flipped
      }
    }

    this._updateMeshOrder();
    this._render();

    this._ready = true;
    this._emit('ready');

    if (this._opts.responsive) this._handleResize();
  }

  /**
   * Create a PlaneGeometry mesh for a leaf with front/back textures.
   */
  _createLeafMesh(leafIndex, textures) {
    const pw = this._pageWidth;
    const ph = this._pageHeight;
    const segments = 40;

    const geo = new PlaneGeometry(pw, ph, segments, 1);

    // Shift vertices so left edge at x=0 (spine), right edge at x=pageWidth
    const pos = geo.attributes.position.array;
    for (let i = 0; i < pos.length; i += 3) {
      pos[i] += pw / 2; // shift from centered to spine-anchored
    }
    geo.attributes.position.needsUpdate = true;
    geo.computeVertexNormals();

    // Store original positions for deformation reference
    const origPositions = new Float32Array(pos.length);
    origPositions.set(pos);

    const frontIdx = leafIndex * 2;
    const backIdx = leafIndex * 2 + 1;

    const frontTex = textures[frontIdx] || createWhiteTexture(pw, ph);
    const backTex = backIdx < textures.length
      ? textures[backIdx]
      : createWhiteTexture(pw, ph);

    const mat = new ShaderMaterial({
      vertexShader: PAGE_VERTEX_SHADER,
      fragmentShader: PAGE_FRAGMENT_SHADER,
      uniforms: {
        frontTex: { value: frontTex },
        backTex: { value: backTex },
        shadowIntensity: { value: 0.0 },
      },
      side: DoubleSide,
      transparent: false,
    });

    const mesh = new Mesh(geo, mat);

    // Store metadata on the mesh
    mesh._ff = {
      leafIndex,
      origPositions,
      flipped: false,
      flipProgress: 0, // 0=flat right, 1=flat left
    };

    return mesh;
  }

  /**
   * Set a mesh to flat position (flipped or unflipped) without deformation.
   */
  _setMeshFlat(meshIndex, flipped) {
    const mesh = this._meshes[meshIndex];
    if (!mesh) return;

    const ff = mesh._ff;
    const pos = mesh.geometry.attributes.position.array;
    const orig = ff.origPositions;
    const pw = this._pageWidth;

    if (flipped) {
      // Mirror all vertices: x' = -x (page lies on left side)
      for (let i = 0; i < orig.length; i += 3) {
        pos[i] = -orig[i];
        pos[i + 1] = orig[i + 1];
        pos[i + 2] = 0;
      }
      ff.flipped = true;
      ff.flipProgress = 1;
    } else {
      // Reset to original positions
      pos.set(orig);
      ff.flipped = false;
      ff.flipProgress = 0;
    }

    mesh.geometry.attributes.position.needsUpdate = true;
    mesh.geometry.computeVertexNormals();
  }

  /**
   * Apply bend deformation to a mesh at a given progress.
   */
  _deformMesh(meshIndex, progress) {
    const mesh = this._meshes[meshIndex];
    if (!mesh) return;

    const ff = mesh._ff;
    const pos = mesh.geometry.attributes.position.array;
    const orig = ff.origPositions;
    const pw = this._pageWidth;
    const R = computeCurlRadius(progress, pw);

    deformPageGeometry(pos, orig, progress, pw, R);

    ff.flipProgress = progress;
    mesh.geometry.attributes.position.needsUpdate = true;
    mesh.geometry.computeVertexNormals();
  }

  /**
   * Update mesh renderOrder and z-position for correct stacking.
   */
  _updateMeshOrder() {
    for (let i = 0; i < this._leafCount; i++) {
      const mesh = this._meshes[i];
      if (!mesh) continue;

      const ff = mesh._ff;
      let depth, shadowVal;

      if (i < this._currentLeaf) {
        // Flipped (left side): higher index = on top
        mesh.renderOrder = i;
        depth = this._currentLeaf - i;
        mesh.position.z = -depth * 0.1;
        shadowVal = depth <= 1 ? 0 : Math.min((depth - 1) * 0.15, 0.6);
      } else {
        // Unflipped (right side): lower index = on top
        mesh.renderOrder = this._leafCount - i;
        depth = i - this._currentLeaf;
        mesh.position.z = -depth * 0.1;
        shadowVal = depth === 0 ? 0 : Math.min(depth * 0.12, 0.5);
      }

      mesh.material.uniforms.shadowIntensity.value = shadowVal;
    }
  }

  // ===== Rendering =====

  _render() {
    if (this._destroyed || !this._renderer) return;
    this._renderer.render(this._scene, this._camera);
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
    return `.ff-book{--ff-width:800px;--ff-height:600px;position:relative;width:var(--ff-width);height:var(--ff-height);margin:0 auto;user-select:none;-webkit-user-select:none;touch-action:none;-ms-touch-action:none}
.ff-book.ff-responsive{transform-origin:top center}
.ff-book canvas{display:block}
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

  // ===== Edge Curl (hover peek) =====

  _handleCornerCurl(e) {
    if (this._animating || this._dragging || this._destroyed || !this._ready) return;

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

  _cornerPeek(meshIndex, dir) {
    if (this._cornerCurling) this._cornerUnpeek(true);

    const mesh = this._meshes[meshIndex];
    if (!mesh) return;

    this._cornerCurling = true;
    this._cornerMeshIndex = meshIndex;
    this._cornerDir = dir;

    // Bring to front
    mesh.renderOrder = this._leafCount + 5;
    mesh.position.z = 0.2;

    // Small deformation for peek
    const peekProgress = dir === 'forward' ? 0.05 : 0.95;
    this._deformMesh(meshIndex, peekProgress);
    this._render();
  }

  _cornerUnpeek(instant) {
    if (!this._cornerCurling || this._cornerMeshIndex < 0) return;

    const meshIndex = this._cornerMeshIndex;
    const mesh = this._meshes[meshIndex];

    if (mesh) {
      // Reset to flat position
      const isFlipped = meshIndex < this._currentLeaf;
      this._setMeshFlat(meshIndex, isFlipped);
    }

    this._updateMeshOrder();

    if (!instant) {
      // Animate back - but for simplicity we just render the final state
      this._render();
    } else {
      this._render();
    }

    this._cornerCurling = false;
    this._cornerMeshIndex = -1;
    this._cornerDir = null;
  }

  // ===== Flip API =====

  flipNext() {
    if (this._animating || !this._ready || this._currentLeaf >= this._leafCount) return;
    if (this._cornerCurling) this._cornerUnpeek(true);
    this._flipLeaf(this._currentLeaf, true);
  }

  flipPrev() {
    if (this._animating || !this._ready || this._currentLeaf <= 0) return;
    if (this._cornerCurling) this._cornerUnpeek(true);
    this._flipLeaf(this._currentLeaf - 1, false);
  }

  flipTo(pageIndex) {
    if (!this._ready) return;
    if (this._cornerCurling) this._cornerUnpeek(true);

    const clampedTarget = Math.max(
      0,
      Math.min(Math.ceil(pageIndex / 2), this._leafCount)
    );
    if (clampedTarget === this._currentLeaf) return;

    // Instantly set all meshes
    for (let i = 0; i < this._leafCount; i++) {
      this._setMeshFlat(i, i < clampedTarget);
    }

    this._currentLeaf = clampedTarget;
    this._updateMeshOrder();
    this._render();
    this._emit('flip', { page: this.currentPage, leaf: this._currentLeaf });
  }

  get currentPage() {
    return this._currentLeaf;
  }

  get pageCount() {
    return this._pages.length;
  }

  /**
   * Core flip animation using RAF loop with geometry deformation.
   * @param {number} meshIndex - index of leaf mesh
   * @param {boolean} forward - flip direction
   * @param {number} [fromProgress] - start progress if continuing from drag (0-1)
   * @param {number} [duration] - custom duration in seconds
   */
  _flipLeaf(meshIndex, forward, fromProgress, duration) {
    const mesh = this._meshes[meshIndex];
    if (!mesh) return;

    this._animating = true;

    // Bring mesh to top
    mesh.renderOrder = this._leafCount + 10;
    mesh.position.z = 0.3;

    const startProgress = fromProgress !== undefined
      ? fromProgress
      : (forward ? 0 : 1);
    const endProgress = forward ? 1 : 0;
    const dur = (duration !== undefined ? duration : this._opts.duration) * 1000;
    const startTime = performance.now();

    const tick = () => {
      if (this._destroyed) return;

      const elapsed = performance.now() - startTime;
      const t = clamp(elapsed / dur, 0, 1);
      const easedT = duration !== undefined ? easeOutCubic(t) : easeInOutCubic(t);
      const progress = startProgress + (endProgress - startProgress) * easedT;

      this._deformMesh(meshIndex, progress);
      this._render();

      if (t < 1) {
        this._flipRAF = requestAnimationFrame(tick);
      } else {
        // Animation complete - set to final flat state
        this._setMeshFlat(meshIndex, forward);
        this._currentLeaf = forward ? meshIndex + 1 : meshIndex;
        this._animating = false;
        this._updateMeshOrder();
        this._render();
        this._emit('flip', { page: this.currentPage, leaf: this._currentLeaf });
      }
    };

    this._flipRAF = requestAnimationFrame(tick);
  }

  /**
   * Snap-back animation (drag released past threshold, return to original).
   */
  _snapBack(meshIndex, fromProgress, forward, duration) {
    const mesh = this._meshes[meshIndex];
    if (!mesh) return;

    this._animating = true;
    mesh.renderOrder = this._leafCount + 10;
    mesh.position.z = 0.3;

    const endProgress = forward ? 0 : 1; // snap back to where it was
    const dur = (duration || this._opts.duration) * 1000;
    const startTime = performance.now();

    const tick = () => {
      if (this._destroyed) return;

      const elapsed = performance.now() - startTime;
      const t = clamp(elapsed / dur, 0, 1);
      const easedT = easeOutCubic(t);
      const progress = fromProgress + (endProgress - fromProgress) * easedT;

      this._deformMesh(meshIndex, progress);
      this._render();

      if (t < 1) {
        this._flipRAF = requestAnimationFrame(tick);
      } else {
        const isFlipped = meshIndex < this._currentLeaf;
        this._setMeshFlat(meshIndex, isFlipped);
        this._animating = false;
        this._updateMeshOrder();
        this._render();
      }
    };

    this._flipRAF = requestAnimationFrame(tick);
  }

  // ===== Drag Handling =====

  _handlePointerDown(e) {
    if (this._animating || this._destroyed || !this._ready || e.button !== 0) return;

    if (this._cornerCurling) this._cornerUnpeek(true);

    const rect = this._book.getBoundingClientRect();
    this._dragRect = rect;
    const relX = e.clientX - rect.left;
    const halfW = rect.width / 2;

    let meshIndex, dragForward;
    if (relX > halfW) {
      meshIndex = this._currentLeaf;
      dragForward = true;
    } else {
      meshIndex = this._currentLeaf - 1;
      dragForward = false;
    }

    if (meshIndex < 0 || meshIndex >= this._leafCount) return;

    this._dragging = true;
    this._dragForward = dragForward;
    this._dragMeshIndex = meshIndex;
    this._dragProgress = dragForward ? 0 : 1;

    // Edge offset for smooth tracking
    const spineX = rect.left + halfW;
    const pageWidth = halfW;
    if (dragForward) {
      this._dragEdgeOffset = (spineX + pageWidth) - e.clientX;
    } else {
      this._dragEdgeOffset = (spineX - pageWidth) - e.clientX;
    }
    this._dragSpineX = spineX;
    this._dragPageWidth = pageWidth;

    // Bring mesh to top
    const mesh = this._meshes[meshIndex];
    mesh.renderOrder = this._leafCount + 10;
    mesh.position.z = 0.3;

    this._velocitySamples = [];

    e.preventDefault();
    this._book.setPointerCapture(e.pointerId);
  }

  _handlePointerMove(e) {
    if (!this._dragging) return;
    e.preventDefault();

    const spineX = this._dragSpineX;
    const pageWidth = this._dragPageWidth;

    // Target edge position
    const targetEdgeX = e.clientX + this._dragEdgeOffset;

    // Map edge position to progress (0-1)
    // cosAngle maps from [-1, 1], angle from [0, PI], progress from [0, 1]
    const cosAngle = clamp((targetEdgeX - spineX) / pageWidth, -1, 1);
    const progress = Math.acos(cosAngle) / Math.PI;

    this._dragProgress = progress;
    this._deformMesh(this._dragMeshIndex, progress);
    this._render();

    // Track velocity
    const now = performance.now();
    this._velocitySamples.push({ progress, time: now });
    if (this._velocitySamples.length > 5) this._velocitySamples.shift();
  }

  _handlePointerUp() {
    if (!this._dragging) return;

    this._dragging = false;
    const meshIndex = this._dragMeshIndex;
    const dragProgress = this._dragProgress;
    const threshold = this._opts.dragThreshold;

    // Compute velocity
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
        velocity = ((last.progress - first.progress) / dt) * 1000; // progress/s
      }
    }

    let shouldFlip;
    if (this._dragForward) {
      shouldFlip = dragProgress > threshold;
    } else {
      shouldFlip = dragProgress < 1 - threshold;
    }

    // Velocity override
    const velThreshold = this._opts.velocityThreshold;
    if (Math.abs(velocity) > velThreshold) {
      if (this._dragForward) {
        shouldFlip = velocity > velThreshold; // positive velocity = increasing progress = flipping forward
      } else {
        shouldFlip = velocity < -velThreshold;
      }
    }

    // Calculate dynamic duration
    const baseDuration = this._opts.duration;
    const remainingProgress = shouldFlip
      ? (this._dragForward ? 1 - dragProgress : dragProgress)
      : (this._dragForward ? dragProgress : 1 - dragProgress);
    let duration;
    if (Math.abs(velocity) > velThreshold) {
      duration = clamp(remainingProgress / Math.abs(velocity), 0.15, baseDuration);
    } else {
      duration = clamp(baseDuration * remainingProgress, 0.2, baseDuration);
    }

    if (shouldFlip) {
      this._flipLeaf(meshIndex, this._dragForward, dragProgress, duration);
    } else {
      this._snapBack(meshIndex, dragProgress, this._dragForward, duration);
    }
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

    if (this._flipRAF) {
      cancelAnimationFrame(this._flipRAF);
      this._flipRAF = null;
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

    // Dispose Three.js resources
    if (this._meshes) {
      for (const mesh of this._meshes) {
        mesh.geometry.dispose();
        mesh.material.dispose();
        if (mesh.material.uniforms) {
          const ft = mesh.material.uniforms.frontTex?.value;
          const bt = mesh.material.uniforms.backTex?.value;
          if (ft) ft.dispose();
          if (bt) bt.dispose();
        }
      }
    }

    if (this._spineShadow) {
      this._spineShadow.geometry.dispose();
      this._spineShadow.material.dispose();
    }

    if (this._renderer) {
      this._renderer.dispose();
      this._renderer.forceContextLoss();
    }

    this._el.removeChild(this._book);
    this._meshes = [];
    this._textures = [];
    this._listeners = {};
    this._emit('destroy');
  }
}

export default FlipFolio;
