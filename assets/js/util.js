/* GEGH — utilidades compartidas (interpolación, easing, flags de dispositivo)
   Diseño y desarrollo: Grupo Empresarial Guerrero Herrera (GEGH), Bucaramanga.
   Propiedad de Grupo Empresarial Guerrero Herrera S.A.S. */
(function () {
  'use strict';

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const damp = (a, b, k, dt) => lerp(a, b, 1 - Math.exp(-k * dt));

  const Ease = {
    linear: t => t,
    outCubic: t => 1 - Math.pow(1 - t, 3),
    inOutCubic: t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
    outExpo: t => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)),
    outQuart: t => 1 - Math.pow(1 - t, 4),
    inOutSine: t => -(Math.cos(Math.PI * t) - 1) / 2
  };

  /* Motor de interpolación mínimo */
  const active = [];
  let raf = null;

  function loop(now) {
    for (let i = active.length - 1; i >= 0; i--) {
      const tw = active[i];
      if (now < tw.start) continue;
      const p = clamp((now - tw.start) / tw.dur, 0, 1);
      const e = tw.ease(p);
      for (const k in tw.to) tw.target[k] = tw.from[k] + (tw.to[k] - tw.from[k]) * e;
      if (tw.onUpdate) tw.onUpdate(e, p);
      if (p >= 1) {
        active.splice(i, 1);
        if (tw.onComplete) tw.onComplete();
      }
    }
    raf = active.length ? requestAnimationFrame(loop) : null;
  }

  function tween(target, to, opts) {
    opts = opts || {};
    for (let i = active.length - 1; i >= 0; i--) {
      const a = active[i];
      if (a.target !== target) continue;
      for (const k in to) { if (k in a.to) { delete a.to[k]; delete a.from[k]; } }
      if (!Object.keys(a.to).length) active.splice(i, 1);
    }
    const from = {};
    for (const k in to) from[k] = target[k];
    const tw = {
      target, to: Object.assign({}, to), from,
      dur: (opts.duration || 1) * 1000,
      start: performance.now() + (opts.delay || 0) * 1000,
      ease: opts.ease || Ease.outCubic,
      onUpdate: opts.onUpdate, onComplete: opts.onComplete
    };
    active.push(tw);
    if (!raf) raf = requestAnimationFrame(loop);
    return tw;
  }

  /* Generador determinista: la escena se ve igual en cada visita */
  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  const isMobile = matchMedia('(max-width: 900px)').matches ||
    (navigator.maxTouchPoints > 0 && window.innerWidth < 1100);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const lowPower = isMobile || (navigator.hardwareConcurrency || 8) <= 4;

  window.GEGH = { clamp, lerp, smoothstep, damp, Ease, tween, mulberry32, isMobile, reduced, lowPower };
})();
