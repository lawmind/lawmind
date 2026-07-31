/**
 * <lottie-mark src="assets/lawmind-gavel.json" loop autoplay speed="1" tint="#E8C86A">
 * Thin wrapper over lottie-web. Loads the player from CDN once, respects
 * prefers-reduced-motion (renders the last frame, static), and can retint every
 * fill/stroke in the animation to a single colour.
 * Attributes: src · loop · autoplay · speed · frame (static frame) · tint · duotone
 */
(function () {
  const CDN = 'https://cdnjs.cloudflare.com/ajax/libs/bodymovin/5.12.2/lottie.min.js';
  let loading = null;
  function lottie() {
    if (window.lottie) return Promise.resolve(window.lottie);
    if (!loading) loading = new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = CDN; s.onload = () => res(window.lottie); s.onerror = rej;
      document.head.appendChild(s);
    });
    return loading;
  }
  const cache = new Map();
  function data(src) {
    if (!cache.has(src)) cache.set(src, fetch(src).then((r) => r.json()));
    return cache.get(src);
  }
  const toRgb = (hex) => {
    const h = hex.replace('#', '');
    return [parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255, 1];
  };
  // Retint every solid fill/stroke. duotone keeps relative luminance so the
  // mark's three gilt tones survive as light/mid/deep of the new hue.
  function retint(node, rgb, duotone) {
    if (Array.isArray(node)) return node.forEach((n) => retint(n, rgb, duotone));
    if (!node || typeof node !== 'object') return;
    if ((node.ty === 'fl' || node.ty === 'st') && node.c && Array.isArray(node.c.k) && typeof node.c.k[0] === 'number') {
      const src = node.c.k;
      if (duotone) {
        const l = 0.299 * src[0] + 0.587 * src[1] + 0.114 * src[2];
        const k = 0.62 + l * 0.55;
        node.c.k = [Math.min(1, rgb[0] * k), Math.min(1, rgb[1] * k), Math.min(1, rgb[2] * k), src[3] != null ? src[3] : 1];
      } else {
        node.c.k = [rgb[0], rgb[1], rgb[2], src[3] != null ? src[3] : 1];
      }
    }
    // gradient fills/strokes: g.k.k is a flat [stop, r,g,b, stop, r,g,b, …] ramp
    if ((node.ty === 'gf' || node.ty === 'gs') && node.g && node.g.k && Array.isArray(node.g.k.k)) {
      const ramp = node.g.k.k;
      const stops = node.g.p || Math.floor(ramp.length / 4);
      for (let i = 0; i < stops; i++) {
        const o = i * 4;
        if (typeof ramp[o + 1] !== 'number') continue;
        const l = 0.299 * ramp[o + 1] + 0.587 * ramp[o + 2] + 0.114 * ramp[o + 3];
        const k = duotone ? 0.5 + l * 0.85 : 1;
        ramp[o + 1] = Math.min(1, rgb[0] * k);
        ramp[o + 2] = Math.min(1, rgb[1] * k);
        ramp[o + 3] = Math.min(1, rgb[2] * k);
      }
    }
    Object.keys(node).forEach((k) => { if (k !== 'c') retint(node[k], rgb, duotone); });
  }

  class LottieMark extends HTMLElement {
    connectedCallback() {
      if (this._mounted) return;
      this._mounted = true;
      this.style.display = this.style.display || 'block';
      const host = document.createElement('div');
      host.style.cssText = 'width:100%;height:100%;overflow:hidden';
      this.appendChild(host);
      const src = this.getAttribute('src');
      if (!src) return;
      const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      Promise.all([lottie(), data(src)]).then(([L, json]) => {
        const anim = JSON.parse(JSON.stringify(json));
        const tint = this.getAttribute('tint');
        if (tint) { retint(anim.layers, toRgb(tint), this.hasAttribute('duotone')); retint(anim.assets, toRgb(tint), this.hasAttribute('duotone')); }
        const frame = this.getAttribute('frame');
        const still = reduced || frame != null;
        this._anim = L.loadAnimation({
          container: host,
          renderer: 'svg',
          loop: !still && this.hasAttribute('loop'),
          autoplay: !still && this.hasAttribute('autoplay'),
          animationData: anim,
          rendererSettings: { preserveAspectRatio: this.getAttribute('fit') || 'xMidYMid meet', progressiveLoad: false }
        });
        const fill = () => {
          const svg = host.querySelector('svg');
          if (svg) { svg.setAttribute('width', '100%'); svg.setAttribute('height', '100%'); svg.style.display = 'block'; }
        };
        fill();
        this._anim.addEventListener('DOMLoaded', fill);
        const sp = parseFloat(this.getAttribute('speed'));
        if (sp) this._anim.setSpeed(sp);
        if (still) {
          const f = frame != null ? parseFloat(frame) : (anim.op - 1);
          this._anim.addEventListener('DOMLoaded', () => this._anim.goToAndStop(f, true));
        }
        this.dispatchEvent(new CustomEvent('ready'));
      }).catch(() => { host.setAttribute('data-lottie-error', src); });
    }
    play() { this._anim && this._anim.play(); }
    stop() { this._anim && this._anim.stop(); }
    goToAndStop(f) { this._anim && this._anim.goToAndStop(f, true); }
    disconnectedCallback() { if (this._anim) { this._anim.destroy(); this._anim = null; this._mounted = false; } }
  }
  if (!customElements.get('lottie-mark')) customElements.define('lottie-mark', LottieMark);
})();
