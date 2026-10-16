/* GEGH — banda sonora
   Reproduce la pista del sitio (assets/audio) en bucle continuo: dos reproductores
   alternan con un fundido cruzado antes del final, así nunca se oye el corte.
   Pasa por Web Audio para controlar el volumen con fundidos (también en iOS),
   entregar la forma de onda a la escena 3D y añadir dos gestos de ruido
   (soplo al cambiar de capítulo y tic al pulsar), sin notas que choquen con la música.
   Diseño y desarrollo: Grupo Empresarial Guerrero Herrera (GEGH), Bucaramanga.
   Propiedad de Grupo Empresarial Guerrero Herrera S.A.S. */
(function () {
  'use strict';

  /* Pista: ruta, cola de silencio al final (s) que se recorta del bucle,
     duración del fundido cruzado (s) y nivel de reproducción (0..1). */
  const TRACK = {
    src: 'assets/audio/ill-never-gonna-say-goodbye-instrumental.mp3',
    tail: 1.5,
    crossfade: 4.0,
    level: 0.45
  };

  class GEGHAudio {
    constructor() {
      this.ctx = null;
      this.enabled = false;
      this.station = 0;
      this.els = [];
      this.gains = [];
      this.cur = 0;
      this.unlocked = false;
      this.pausedByVisibility = false;
      this._wave = null;
      this._xfadeArmed = false;
      this._firstStart = true;
      this.canPlay = null;
      this._preload();
    }

    get ready() { return !!(this.ctx && this.enabled); }

    /* Dos reproductores sobre el mismo archivo: el navegador descarga una sola vez. */
    _preload() {
      if (typeof Audio === 'undefined') { this.canPlay = Promise.resolve(); return; }
      for (let i = 0; i < 2; i++) {
        const el = new Audio();
        el.preload = i === 0 ? 'auto' : 'metadata';
        el.src = TRACK.src;
        el.loop = false;
        el.addEventListener('timeupdate', () => this._onTime(i));
        el.addEventListener('ended', () => this._onEnded(i));
        this.els.push(el);
      }
      const first = this.els[0];
      this.canPlay = new Promise(resolve => {
        if (first.readyState >= 3) { resolve(); return; }
        const done = () => resolve();
        first.addEventListener('canplaythrough', done, { once: true });
        first.addEventListener('canplay', done, { once: true });
        first.addEventListener('error', done, { once: true });
      });
    }

    init() {
      if (this.ctx) return;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC || !this.els.length) return;
      const ctx = new AC();
      this.ctx = ctx;

      // master → filtro (la música "enfoca" durante la intro) → destino
      this.master = ctx.createGain();
      this.master.gain.value = 0;
      this.filter = ctx.createBiquadFilter();
      this.filter.type = 'lowpass'; this.filter.frequency.value = 18000; this.filter.Q.value = 0.5;
      this.master.connect(this.filter);
      this.filter.connect(ctx.destination);

      // analizador para la escena (forma de onda)
      this.analyser = ctx.createAnalyser();
      this.analyser.fftSize = 1024;
      this.analyser.smoothingTimeConstant = 0.6;
      this.filter.connect(this.analyser);
      this._wave = new Uint8Array(this.analyser.fftSize);

      // cada reproductor con su propia ganancia para el fundido cruzado
      this.els.forEach((el, i) => {
        const g = ctx.createGain(); g.gain.value = i === 0 ? 1 : 0;
        try {
          const src = ctx.createMediaElementSource(el);
          src.connect(g);
        } catch (e) { /* el elemento ya estaba conectado */ }
        g.connect(this.master);
        this.gains.push(g);
      });

      // gestos: bus de efectos con su propio nivel
      this.fx = ctx.createGain(); this.fx.gain.value = 0.5;
      this.fx.connect(this.master);
      this.noiseBuf = this._noise(2);
    }

    _noise(seconds) {
      const ctx = this.ctx, len = Math.floor(ctx.sampleRate * seconds);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      let b0 = 0, b1 = 0, b2 = 0;
      for (let i = 0; i < len; i++) { // ruido rosa
        const w = Math.random() * 2 - 1;
        b0 = 0.99765 * b0 + w * 0.0990460;
        b1 = 0.96300 * b1 + w * 0.2965164;
        b2 = 0.57000 * b2 + w * 1.0526913;
        d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.11;
      }
      return buf;
    }

    /* iOS exige que la primera reproducción de cada elemento salga de un gesto del
       usuario: se "desbloquean" ambos dentro del clic de entrada. */
    _unlock() {
      if (this.unlocked) return;
      this.unlocked = true;
      const other = this.els[1];
      if (!other) return;
      const p = other.play();
      if (p && p.then) p.then(() => { other.pause(); other.currentTime = 0; }).catch(() => {});
      else { other.pause(); other.currentTime = 0; }
    }

    /* ---------- control ---------- */

    start() {
      this.init();
      if (!this.ctx) return;
      if (this.ctx.state === 'suspended') this.ctx.resume();
      this.enabled = true;
      this.pausedByVisibility = false;
      this._unlock();
      const t = this.ctx.currentTime;
      const el = this.els[this.cur];
      const p = el.play();
      if (p && p.catch) p.catch(() => {});
      this.master.gain.cancelScheduledValues(t);
      if (this._firstStart) {
        // la música entra creciendo y enfocándose junto con la cámara
        this._firstStart = false;
        this.master.gain.setValueAtTime(0.0001, t);
        this.master.gain.exponentialRampToValueAtTime(TRACK.level, t + 2.6);
        this.filter.frequency.cancelScheduledValues(t);
        this.filter.frequency.setValueAtTime(700, t);
        this.filter.frequency.exponentialRampToValueAtTime(18000, t + 3.2);
      } else {
        // al reactivar con el botón, vuelve enseguida
        this.master.gain.setValueAtTime(this.master.gain.value, t);
        this.master.gain.linearRampToValueAtTime(TRACK.level, t + 0.8);
      }
    }

    stop() {
      if (!this.ctx) return;
      this.enabled = false;
      const t = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(t);
      this.master.gain.setValueAtTime(Math.max(this.master.gain.value, 0.0001), t);
      this.master.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
      clearTimeout(this._pauseTimer);
      this._pauseTimer = setTimeout(() => { if (!this.enabled) this.els.forEach(e => e.pause()); }, 750);
    }

    toggle() {
      if (this.enabled) { this.stop(); return false; }
      this.start(); return true;
    }

    /* la pestaña deja de verse: pausa; vuelve: continúa donde iba */
    visibility(hidden) {
      if (!this.ctx) return;
      if (hidden) {
        if (!this.enabled) return;
        this.pausedByVisibility = true;
        this.els.forEach(e => { if (!e.paused) e.pause(); });
        this.ctx.suspend();
      } else if (this.pausedByVisibility) {
        this.pausedByVisibility = false;
        this.ctx.resume();
        const el = this.els[this.cur];
        const p = el.play(); if (p && p.catch) p.catch(() => {});
      }
    }

    /* ---------- bucle con fundido cruzado ---------- */

    _onTime(i) {
      if (i !== this.cur || !this.enabled || this._xfadeArmed) return;
      const el = this.els[i];
      if (!isFinite(el.duration) || el.duration <= 0) return;
      const at = el.duration - TRACK.tail - TRACK.crossfade;
      if (el.currentTime >= at) this._crossfade();
    }

    _onEnded(i) {
      // red de seguridad: si por lo que sea no hubo fundido, reinicia
      if (i === this.cur && this.enabled && !this._xfadeArmed) {
        const el = this.els[i];
        el.currentTime = 0;
        const p = el.play(); if (p && p.catch) p.catch(() => {});
      }
    }

    _crossfade() {
      if (!this.ctx) return;
      this._xfadeArmed = true;
      const ctx = this.ctx, t = ctx.currentTime, xf = TRACK.crossfade;
      const from = this.cur, to = 1 - this.cur;
      const elTo = this.els[to], gTo = this.gains[to], gFrom = this.gains[from];
      elTo.currentTime = 0;
      const p = elTo.play(); if (p && p.catch) p.catch(() => {});
      // fundido de potencia constante: la suma se mantiene igual de fuerte todo el tiempo
      if (!this._curveIn) {
        const n = 64;
        this._curveIn = new Float32Array(n); this._curveOut = new Float32Array(n);
        for (let i = 0; i < n; i++) {
          const a = (i / (n - 1)) * Math.PI / 2;
          this._curveIn[i] = Math.sin(a); this._curveOut[i] = Math.cos(a);
        }
      }
      gTo.gain.cancelScheduledValues(t);
      gTo.gain.setValueAtTime(0, t);
      gTo.gain.setValueCurveAtTime(this._curveIn, t, xf);
      gFrom.gain.cancelScheduledValues(t);
      gFrom.gain.setValueAtTime(1, t);
      gFrom.gain.setValueCurveAtTime(this._curveOut, t, xf);
      this.cur = to;
      clearTimeout(this._xfadeTimer);
      this._xfadeTimer = setTimeout(() => {
        const elFrom = this.els[from];
        elFrom.pause(); elFrom.currentTime = 0;
        this._xfadeArmed = false;
      }, (xf + 0.3) * 1000);
    }

    /* ---------- compatibilidad con la escena y la interfaz ---------- */

    setStation(i) { this.station = i | 0; }

    scrollVelocity() { /* la pista no cambia con el scroll */ }

    /* forma de onda 0..255 para la escena; devuelve false si no hay audio */
    waveform(out) {
      if (!this.ready || !this.analyser) return false;
      this.analyser.getByteTimeDomainData(this._wave);
      const step = this._wave.length / out.length;
      for (let i = 0; i < out.length; i++) out[i] = this._wave[Math.floor(i * step)];
      return true;
    }

    _env(gain, t, attack, decay, peak) {
      const g = gain.gain;
      g.cancelScheduledValues(t);
      g.setValueAtTime(0.0001, t);
      g.exponentialRampToValueAtTime(peak, t + attack);
      g.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    }

    /* soplo de aire al cambiar de capítulo (ruido filtrado, sin nota) */
    whoosh() {
      if (!this.ready) return;
      const ctx = this.ctx, t = ctx.currentTime;
      const src = ctx.createBufferSource(); src.buffer = this.noiseBuf;
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.2;
      bp.frequency.setValueAtTime(220, t); bp.frequency.exponentialRampToValueAtTime(2400, t + 0.5); bp.frequency.exponentialRampToValueAtTime(300, t + 1.1);
      const g = ctx.createGain(); this._env(g, t, 0.18, 0.9, 0.35);
      src.connect(bp); bp.connect(g); g.connect(this.fx);
      src.start(t); src.stop(t + 1.3);
    }

    /* tic seco al pulsar (ruido muy breve) */
    click() {
      if (!this.ready) return;
      const ctx = this.ctx, t = ctx.currentTime;
      const src = ctx.createBufferSource(); src.buffer = this.noiseBuf;
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1800;
      const g = ctx.createGain(); this._env(g, t, 0.003, 0.05, 0.25);
      src.connect(hp); hp.connect(g); g.connect(this.fx);
      src.start(t); src.stop(t + 0.08);
    }
  }

  window.GEGHAudio = GEGHAudio;
})();
