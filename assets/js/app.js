/* GEGH — orquestación de interfaz
   Compuerta de entrada, scroll con inercia, scroll → riel 3D, revelados, sonido, cursor, reloj y navegación.
   Diseño y desarrollo: Grupo Empresarial Guerrero Herrera (GEGH), Bucaramanga.
   Propiedad de Grupo Empresarial Guerrero Herrera S.A.S. */
(function () {
  'use strict';

  const { clamp, smoothstep, Ease, isMobile, reduced } = window.GEGH;
  const $ = (s, c) => (c || document).querySelector(s);
  const $$ = (s, c) => Array.prototype.slice.call((c || document).querySelectorAll(s));

  document.body.classList.add('is-locked');
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  window.scrollTo(0, 0);
  if (isMobile) document.body.classList.add('is-mobile');
  try { console.log('%cGEGH %c— Diseño y desarrollo: Grupo Empresarial Guerrero Herrera · Bucaramanga, Colombia', 'font-weight:700;letter-spacing:.1em', 'font-weight:400'); } catch (e) { /* sin consola */ }

  /* ---------- Scroll con inercia (escritorio con rueda o trackpad) ----------
     La rueda mueve un objetivo y la página lo sigue con amortiguación; la barra de
     desplazamiento y el teclado siguen funcionando de forma nativa. */
  const smooth = (function () {
    if (reduced || isMobile || !matchMedia('(pointer: fine)').matches) return null;
    let target = window.scrollY, current = target, raf = null, last = 0, active = false;
    const max = () => Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
    function loop(now) {
      const dt = Math.min((now - last) / 1000, 0.05); last = now;
      current += (target - current) * (1 - Math.exp(-dt * 8.5));
      if (Math.abs(target - current) < 0.4) { current = target; window.scrollTo(0, current); active = false; raf = null; return; }
      window.scrollTo(0, current);
      raf = requestAnimationFrame(loop);
    }
    function kick() { if (!raf) { last = performance.now(); active = true; raf = requestAnimationFrame(loop); } }
    window.addEventListener('wheel', e => {
      if (e.ctrlKey || document.body.classList.contains('is-locked')) return;
      e.preventDefault();
      const d = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * window.innerHeight : e.deltaY;
      if (!active) { target = current = window.scrollY; }
      target = clamp(target + d, 0, max());
      kick();
    }, { passive: false });
    window.addEventListener('scroll', () => { if (!active) target = current = window.scrollY; }, { passive: true });
    return { to(y) { if (!active) current = window.scrollY; target = clamp(y, 0, max()); kick(); } };
  })();
  // los enlaces internos viajan con la misma inercia
  $$('a[href^="#"]').forEach(a => a.addEventListener('click', e => {
    const id = a.getAttribute('href').slice(1);
    const el = id && document.getElementById(id);
    if (!el || !smooth) return;
    e.preventDefault();
    smooth.to(el.offsetTop);
  }));

  /* ---------- Audio + escena ---------- */
  const audio = new window.GEGHAudio(); // la pista empieza a descargarse ya
  let scene = null;
  try {
    if (!window.THREE) throw new Error('Three.js no cargó');
    scene = new window.GEGHScene($('#gl'), { mobile: isMobile, reduced });
    scene.init();
    scene.attachAudio(audio);
    window.GEGH.scene = scene;
    window.GEGH.audio = audio;
  } catch (err) {
    console.warn('GEGH: WebGL no disponible, modo estático.', err);
    scene = null;
    document.body.classList.add('no-webgl');
  }

  /* ---------- Compuerta ---------- */
  const gate = $('#gate');
  const counter = $('#gateCounter');
  const bar = $('#gateBar');
  const soundBtn = $('#soundBtn');
  let prog = 0, ready = false;

  let revisit = false;
  try { revisit = sessionStorage.getItem('gegh-entered') === '1'; } catch (e) { /* almacenamiento bloqueado */ }

  const fontsReady = (document.fonts && document.fonts.load)
    ? Promise.all([
        document.fonts.load("800 180px 'Syne'"),
        document.fonts.load("700 20px 'Syne'"),
        document.fonts.load("400 16px 'Instrument Sans'"),
        document.fonts.load("italic 400 16px 'Instrument Serif'"),
        document.fonts.load("400 12px 'JetBrains Mono'")
      ]).catch(() => {})
    : Promise.resolve();
  const minWait = new Promise(r => setTimeout(r, revisit ? 500 : 1700));
  // la pista empieza a descargarse con la compuerta; se espera un máximo de 3 s
  const audioReady = Promise.race([audio.canPlay || Promise.resolve(), new Promise(r => setTimeout(r, 3000))]);
  const hardTimeout = new Promise(r => setTimeout(r, 5000));

  const t0 = performance.now();
  let lastNow = t0;
  function progLoop(now) {
    const p = clamp((now - t0) / (revisit ? 500 : 1500), 0, 1);
    const target = ready ? 100 : 92 * Ease.outCubic(p);
    const dt = clamp((now - lastNow) / 1000, 0, 0.1);
    lastNow = now;
    prog += (target - prog) * (1 - Math.exp(-dt * 9));
    counter.textContent = String(Math.round(prog)).padStart(3, '0');
    bar.style.width = prog + '%';
    if (prog < 99.4 || !ready) {
      requestAnimationFrame(progLoop);
    } else {
      counter.textContent = '100';
      bar.style.width = '100%';
      gate.classList.add('is-ready');
      $('#enterSound').focus({ preventScroll: true });
    }
  }
  requestAnimationFrame(progLoop);
  Promise.race([Promise.all([fontsReady, minWait, audioReady]), hardTimeout]).then(() => {
    ready = true;
    fitHeroTitle();
  });

  function fitHeroTitle() {
    try {
      const svg = $('.hero-title');
      const g = $('#heroText');
      if (!svg || !g) return;
      const b = g.getBBox();
      if (b.width > 0 && b.height > 0) {
        svg.setAttribute('viewBox', (b.x - 30) + ' ' + (b.y - 24) + ' ' + (b.width + 60) + ' ' + (b.height + 48));
      }
    } catch (e) { /* el navegador aún no ha maquetado el SVG */ }
  }

  let entered = false;
  function enter(withSound) {
    if (entered) return;
    entered = true;
    try { sessionStorage.setItem('gegh-entered', '1'); } catch (e) { /* almacenamiento bloqueado */ }
    if (withSound) {
      audio.start();
      setSoundUI(true);
    }
    gate.classList.add('is-out');
    document.body.classList.add('is-entered');
    const introSeconds = scene ? scene.playIntro() : 0.4;
    setTimeout(() => { document.body.classList.remove('is-locked'); measure(); }, Math.max(300, introSeconds * 1000 - 500));
    setTimeout(() => {
      $$('#hero .reveal').forEach((el, i) => setTimeout(() => {
        el.classList.add('in-view');
        if (el.hasAttribute('data-count')) countUp(el);
      }, i * 140));
      $$('#hero [data-count]').forEach(countUp);
    }, Math.max(300, introSeconds * 1000 - 1500));
    observeReveals();
    startScrollEngine();
  }
  $('#enterSound').addEventListener('click', () => enter(true));
  $('#enterSilent').addEventListener('click', () => enter(false));
  gate.addEventListener('keydown', e => { if (e.key === 'Enter' && ready) enter(true); });

  /* ---------- Sonido ---------- */
  function setSoundUI(on) {
    soundBtn.classList.toggle('is-on', on);
    soundBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
    soundBtn.title = on ? 'Silenciar' : 'Activar sonido';
  }
  soundBtn.addEventListener('click', () => setSoundUI(audio.toggle()));
  document.addEventListener('visibilitychange', () => audio.visibility(document.hidden));

  document.addEventListener('mouseover', e => {
    const t = e.target.closest && e.target.closest('a, button, .card, .list li, .step');
    if (t && cursorRing) cursorRing.classList.add('is-hover');
  });
  document.addEventListener('mouseout', e => {
    const t = e.target.closest && e.target.closest('a, button, .card, .list li, .step');
    if (t && cursorRing) cursorRing.classList.remove('is-hover');
  });
  document.addEventListener('click', e => {
    if (e.target.closest && e.target.closest('a, button')) audio.click();
  });

  /* ---------- Cursor ---------- */
  let cursorRing = null;
  if (matchMedia('(pointer: fine)').matches && !isMobile) {
    document.body.classList.add('has-cursor');
    const dot = $('.cursor');
    cursorRing = $('.cursor-ring');
    let cx = window.innerWidth / 2, cy = window.innerHeight / 2, rx = cx, ry = cy;
    window.addEventListener('mousemove', e => {
      cx = e.clientX; cy = e.clientY;
      dot.style.transform = 'translate(' + cx + 'px,' + cy + 'px)';
      if (scene) scene.setPointer((cx / window.innerWidth) * 2 - 1, (cy / window.innerHeight) * 2 - 1);
    }, { passive: true });
    (function ringLoop() {
      rx += (cx - rx) * 0.18; ry += (cy - ry) * 0.18;
      cursorRing.style.transform = 'translate(' + rx + 'px,' + ry + 'px)';
      requestAnimationFrame(ringLoop);
    })();
  } else if (scene) {
    window.addEventListener('mousemove', e => {
      scene.setPointer((e.clientX / window.innerWidth) * 2 - 1, (e.clientY / window.innerHeight) * 2 - 1);
    }, { passive: true });
  }

  /* ---------- Reloj local (Bucaramanga, GMT-5) ---------- */
  const clockEl = $('#clock');
  function tick() {
    try {
      clockEl.textContent = new Date().toLocaleTimeString('es-CO', { timeZone: 'America/Bogota', hour12: false });
    } catch (e) {
      clockEl.textContent = new Date().toLocaleTimeString();
    }
  }
  tick();
  setInterval(tick, 1000);

  /* ---------- Menú móvil ---------- */
  const burger = $('#burger');
  const menu = $('#menu');
  function setMenu(open) {
    burger.classList.toggle('is-open', open);
    burger.setAttribute('aria-expanded', open ? 'true' : 'false');
    menu.classList.toggle('is-open', open);
    menu.setAttribute('aria-hidden', open ? 'false' : 'true');
  }
  burger.addEventListener('click', () => setMenu(!menu.classList.contains('is-open')));
  $$('a', menu).forEach(a => a.addEventListener('click', () => setMenu(false)));

  window.addEventListener('load', fitHeroTitle);

  /* ---------- Scroll → riel ---------- */
  const sections = $$('[data-scene]');
  const chapterLinks = $$('.chapters a');
  const navLinks = $$('.nav__links a');
  const progressBar = $('.progress');
  const procesoEl = $('#proceso');
  const steps = $$('.step');
  let metrics = [];
  let vh = window.innerHeight;

  function measure() {
    vh = window.innerHeight;
    metrics = sections.map(s => ({ el: s, top: s.offsetTop, h: Math.max(s.offsetHeight, 1), content: s.classList.contains('chapter--tall') && s.id !== 'hero' ? s.querySelector('.panel__content') : null }));
  }
  measure();

  function computeSceneT(y) {
    const n = metrics.length;
    for (let i = 0; i < n; i++) {
      const m = metrics[i];
      if (y < m.top + m.h || i === n - 1) {
        const local = clamp((y - m.top) / m.h, 0, 1);
        // la cámara nunca se detiene: avanza despacio mientras lees y acelera entre capítulos
        const tr = i === n - 1 ? 0 : 0.2 * local + 0.8 * (local * local * (3 - 2 * local));
        return i + tr;
      }
    }
    return n - 1;
  }

  let station = 0, lastY = window.scrollY, lastT = performance.now(), velN = 0, engineOn = false;

  function setActive(st) {
    chapterLinks.forEach(a => a.classList.toggle('is-active', +a.dataset.ch === st));
    navLinks.forEach(a => {
      const list = (a.dataset.stations || '').split(',').map(Number);
      a.classList.toggle('is-active', list.indexOf(st) !== -1);
    });
  }
  setActive(0);

  function updateProceso(y) {
    if (!procesoEl || !steps.length) return;
    const m = metrics.find(mm => mm.el === procesoEl);
    if (!m) return;
    const holdPx = Math.max(m.h - vh, 1);
    const local = clamp((y - m.top + vh * 0.35) / holdPx, 0, 1);
    const on = Math.floor(local * 5.999);
    steps.forEach((s, i) => s.classList.toggle('is-on', i <= on));
    if (scene) scene.setProcess(local);
  }

  function frame(now) {
    if (!engineOn) return;
    requestAnimationFrame(frame);
    const y = window.scrollY;
    const dt = Math.max(now - lastT, 1) / 1000;
    const v = Math.abs(y - lastY) / dt;
    velN = velN * 0.85 + clamp(v / 2400, 0, 1) * 0.15;
    lastY = y; lastT = now;

    const sT = computeSceneT(y);
    const st = Math.round(sT);
    if (st !== station) {
      station = st;
      setActive(st);
      if (scene) scene.pulse(1);
      audio.setStation(st);
      audio.whoosh();
    }
    if (scene) scene.setScroll(sT, velN);
    audio.scrollVelocity(velN);
    const total = Math.max(document.documentElement.scrollHeight - vh, 1);
    progressBar.style.transform = 'scaleX(' + clamp(y / total, 0, 1) + ')';
    updateProceso(y);
    // los textos de los capítulos pegajosos suben despacio y se despiden al final
    if (!isMobile && !reduced) {
      for (let i = 0; i < metrics.length; i++) {
        const m = metrics[i];
        if (!m.content) continue;
        const local = (y - m.top) / m.h;
        if (local < -0.2 || local > 1.2) continue;
        const l = clamp(local, 0, 1);
        m.content.style.transform = 'translate3d(0,' + (-l * 34).toFixed(1) + 'px,0)';
        m.content.style.opacity = (1 - smoothstep(0.8, 1, l)).toFixed(3);
      }
    }
  }

  function startScrollEngine() {
    if (engineOn) return;
    engineOn = true;
    measure();
    requestAnimationFrame(frame);
  }

  let resizeTimer = null;
  window.addEventListener('resize', () => {
    measure();
    if (scene) scene.resize();
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { measure(); fitHeroTitle(); }, 250);
  });
  window.addEventListener('orientationchange', () => setTimeout(measure, 300));

  /* ---------- Títulos palabra por palabra ---------- */
  function splitWords(el) {
    const walk = node => {
      Array.prototype.slice.call(node.childNodes).forEach(ch => {
        if (ch.nodeType === 3) {
          const parts = ch.textContent.split(/(\s+)/);
          const frag = document.createDocumentFragment();
          parts.forEach(pt => {
            if (!pt) return;
            if (/^\s+$/.test(pt)) { frag.appendChild(document.createTextNode(' ')); return; }
            const w = document.createElement('span'); w.className = 'w';
            const wi = document.createElement('span'); wi.className = 'wi'; wi.textContent = pt;
            w.appendChild(wi); frag.appendChild(w);
          });
          node.replaceChild(frag, ch);
        } else if (ch.nodeType === 1 && ch.tagName !== 'BR') walk(ch);
      });
    };
    walk(el);
    $$('.wi', el).forEach((wi, i) => { wi.style.setProperty('--wd', (i * 70) + 'ms'); });
  }
  if (!reduced) $$('.title').forEach(splitWords);

  /* ---------- Botones magnéticos ---------- */
  const magnets = $$('.btn');
  if (!isMobile && matchMedia('(pointer: fine)').matches && !reduced) {
    window.addEventListener('mousemove', e => {
      for (let i = 0; i < magnets.length; i++) {
        const b = magnets[i];
        const r = b.getBoundingClientRect();
        if (r.bottom < -100 || r.top > window.innerHeight + 100) continue;
        const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        const dx = e.clientX - cx, dy = e.clientY - cy;
        const d = Math.hypot(dx, dy);
        const reach = Math.max(r.width, r.height) * 0.9;
        if (d < reach) {
          const k = (1 - d / reach) * 0.35;
          b.style.transform = 'translate(' + (dx * k).toFixed(1) + 'px,' + (dy * k).toFixed(1) + 'px)';
        } else if (b.style.transform) b.style.transform = '';
      }
    }, { passive: true });
  }

  /* ---------- Revelados, texto codificado y contadores ---------- */
  const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#/%&<>_';
  function scramble(el) {
    if (reduced) return;
    const text = el.dataset.text || el.textContent;
    el.dataset.text = text;
    const dur = 900;
    const start = performance.now();
    function f(now) {
      const p = clamp((now - start) / dur, 0, 1);
      let out = '';
      for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (ch === ' ' || ch === '\n') { out += ch; continue; }
        out += p > i / text.length ? ch : CHARS[Math.floor(Math.random() * CHARS.length)];
      }
      el.textContent = out;
      if (p < 1) requestAnimationFrame(f); else el.textContent = text;
    }
    requestAnimationFrame(f);
  }

  function countUp(el) {
    if (el.dataset.done) return;
    el.dataset.done = '1';
    const end = parseFloat(el.dataset.count) || 0;
    const pad = parseInt(el.dataset.pad || '0', 10);
    if (reduced) { el.textContent = String(end).padStart(pad, '0'); return; }
    const dur = 1500;
    const start = performance.now();
    function f(now) {
      const p = clamp((now - start) / dur, 0, 1);
      el.textContent = String(Math.round(end * Ease.outExpo(p))).padStart(pad, '0');
      if (p < 1) requestAnimationFrame(f);
    }
    requestAnimationFrame(f);
  }

  function observeReveals() {
    if (!('IntersectionObserver' in window)) {
      $$('.reveal').forEach(el => el.classList.add('in-view'));
      $$('[data-count]').forEach(countUp);
      return;
    }
    const io = new IntersectionObserver(entries => {
      entries.forEach(en => {
        if (!en.isIntersecting) return;
        const el = en.target;
        el.classList.add('in-view');
        if (el.hasAttribute('data-scramble')) scramble(el);
        if (el.hasAttribute('data-count')) countUp(el);
        io.unobserve(el);
      });
    }, { threshold: 0.15, rootMargin: '0px 0px -6% 0px' });
    $$('.reveal, [data-scramble], [data-count]').forEach(el => {
      if (el.closest('#hero')) return; // el inicio se revela con la intro
      io.observe(el);
    });
  }

  /* ---------- Contacto: ondulación desde Bucaramanga ---------- */
  $$('.contact-link').forEach(l => {
    l.addEventListener('mouseenter', () => { if (scene) scene.ripple(); });
    l.addEventListener('focus', () => { if (scene) scene.ripple(); });
  });

  /* ---------- Sin WebGL: mostrar todo de inmediato ---------- */
  if (!scene) $$('.reveal').forEach(el => el.classList.add('in-view'));
})();
