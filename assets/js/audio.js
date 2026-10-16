/* GEGH — partitura generativa (Web Audio API, sin archivos)
   Una pieza ambiental en re menor que cambia de acorde con cada capítulo,
   responde a la velocidad del scroll y entrega su forma de onda a la escena 3D.
   Diseño y desarrollo: Grupo Empresarial Guerrero Herrera (GEGH), Bucaramanga.
   Propiedad de Grupo Empresarial Guerrero Herrera S.A.S. */
(function () {
  'use strict';

  const midi = n => 440 * Math.pow(2, (n - 69) / 12);

  /* Un acorde por capítulo (notas MIDI). Re menor como centro tonal. */
  const CHORDS = [
    [38, 45, 53, 64], // 00 Inicio        Dm(add9)
    [46, 53, 57, 62], // 01 Manifiesto    Bbmaj7
    [43, 50, 58, 69], // 02 Diseño        Gm9
    [48, 55, 64, 74], // 03 Código        C(add9)
    [41, 48, 64, 69], // 04 Multimedia    Fmaj7
    [39, 46, 55, 62], // 05 Aprendizaje   Ebmaj7
    [45, 52, 55, 60], // 06 Proceso       Am7
    [46, 53, 60, 62], // 07 Colaboración  Bb(add9)
    [38, 45, 53, 64]  // 08 Contacto      Dm(add9), vuelta a casa
  ];

  class GEGHAudio {
    constructor() {
      this.ctx = null;
      this.enabled = false;
      this.station = 0;
      this.voices = [];
      this._chimeTimer = null;
      this._wave = null;
    }

    get ready() { return !!(this.ctx && this.enabled); }

    init() {
      if (this.ctx) return;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const ctx = new AC();
      this.ctx = ctx;

      // salida: master → compresor suave → destino
      this.master = ctx.createGain();
      this.master.gain.value = 0;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -20; comp.ratio.value = 3; comp.attack.value = 0.01; comp.release.value = 0.3;
      this.master.connect(comp);
      comp.connect(ctx.destination);

      // analizador para la escena (forma de onda)
      this.analyser = ctx.createAnalyser();
      this.analyser.fftSize = 1024;
      this.analyser.smoothingTimeConstant = 0.6;
      this.master.connect(this.analyser);
      this._wave = new Uint8Array(this.analyser.fftSize);

      // reverberación: respuesta al impulso sintetizada
      this.reverb = ctx.createConvolver();
      this.reverb.buffer = this._impulse(2.8, 2.6);
      this.reverbGain = ctx.createGain(); this.reverbGain.gain.value = 0.38;
      this.reverb.connect(this.reverbGain); this.reverbGain.connect(this.master);

      // eco estéreo para campanas
      this.delay = ctx.createDelay(1.0); this.delay.delayTime.value = 0.36;
      const fb = ctx.createGain(); fb.gain.value = 0.36;
      const wet = ctx.createGain(); wet.gain.value = 0.3;
      this.delay.connect(fb); fb.connect(this.delay);
      this.delay.connect(wet); wet.connect(this.master); wet.connect(this.reverb);

      this._buildPad();
      this._buildSub();
      this._buildWind();
    }

    _impulse(seconds, decay) {
      const ctx = this.ctx, rate = ctx.sampleRate, len = Math.floor(rate * seconds);
      const buf = ctx.createBuffer(2, len, rate);
      for (let c = 0; c < 2; c++) {
        const d = buf.getChannelData(c);
        let lp = 0;
        for (let i = 0; i < len; i++) {
          const env = Math.pow(1 - i / len, decay);
          const w = (Math.random() * 2 - 1) * env;
          lp = lp * 0.72 + w * 0.28; // cola más oscura
          d[i] = lp * (i < rate * 0.02 ? i / (rate * 0.02) : 1);
        }
      }
      return buf;
    }

    _buildPad() {
      const ctx = this.ctx;
      this.padFilter = ctx.createBiquadFilter();
      this.padFilter.type = 'lowpass'; this.padFilter.frequency.value = 460; this.padFilter.Q.value = 0.7;
      this.padGain = ctx.createGain(); this.padGain.gain.value = 0.16;
      this.padFilter.connect(this.padGain);
      this.padGain.connect(this.master);
      this.padGain.connect(this.reverb);

      // LFO lento sobre el filtro: la pieza respira
      const lfo = ctx.createOscillator(); lfo.frequency.value = 0.05;
      const lg = ctx.createGain(); lg.gain.value = 140;
      lfo.connect(lg); lg.connect(this.padFilter.frequency); lfo.start();

      const chord = CHORDS[0];
      for (let i = 0; i < chord.length; i++) {
        const g = ctx.createGain(); g.gain.value = i === 0 ? 0.5 : 0.36;
        const a = ctx.createOscillator(); a.type = 'sawtooth'; a.frequency.value = midi(chord[i]); a.detune.value = -6;
        const b = ctx.createOscillator(); b.type = 'triangle'; b.frequency.value = midi(chord[i]); b.detune.value = 5;
        a.connect(g); b.connect(g); g.connect(this.padFilter);
        a.start(); b.start();
        this.voices.push({ a, b, g });
      }
    }

    _buildSub() {
      const ctx = this.ctx;
      this.sub = ctx.createOscillator(); this.sub.type = 'sine';
      this.sub.frequency.value = midi(CHORDS[0][0] - 12);
      this.subGain = ctx.createGain(); this.subGain.gain.value = 0.22;
      this.sub.connect(this.subGain); this.subGain.connect(this.master);
      this.sub.start();
    }

    _buildWind() {
      const ctx = this.ctx;
      const len = ctx.sampleRate * 3;
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
      this.noiseBuf = buf;
      const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 700; bp.Q.value = 0.5;
      this.windGain = ctx.createGain(); this.windGain.gain.value = 0.012;
      src.connect(bp); bp.connect(this.windGain); this.windGain.connect(this.master); src.start();
      this.windFilter = bp;
    }

    /* ---------- control ---------- */

    start() {
      this.init();
      if (!this.ctx) return;
      if (this.ctx.state === 'suspended') this.ctx.resume();
      this.enabled = true;
      const t = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(t);
      this.master.gain.setValueAtTime(Math.max(this.master.gain.value, 0.0001), t);
      this.master.gain.exponentialRampToValueAtTime(0.9, t + 2.6);
      this._scheduleChime();
    }

    stop() {
      if (!this.ctx) return;
      this.enabled = false;
      const t = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(t);
      this.master.gain.setValueAtTime(Math.max(this.master.gain.value, 0.0001), t);
      this.master.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
      clearTimeout(this._chimeTimer);
    }

    toggle() {
      if (this.enabled) { this.stop(); return false; }
      this.start(); return true;
    }

    /* pausa cuando la pestaña no se ve */
    visibility(hidden) {
      if (!this.ctx || !this.enabled) return;
      if (hidden) this.ctx.suspend(); else this.ctx.resume();
    }

    /* cambio de capítulo: el acorde se desliza al siguiente */
    setStation(i) {
      i = Math.max(0, Math.min(CHORDS.length - 1, i | 0));
      if (i === this.station) return;
      this.station = i;
      if (!this.ctx) return;
      const chord = CHORDS[i];
      const t = this.ctx.currentTime;
      this.voices.forEach((v, k) => {
        const f = midi(chord[k]);
        [v.a, v.b].forEach(o => {
          o.frequency.cancelScheduledValues(t);
          o.frequency.setValueAtTime(Math.max(o.frequency.value, 1), t);
          o.frequency.exponentialRampToValueAtTime(f, t + 1.6);
        });
      });
      this.sub.frequency.cancelScheduledValues(t);
      this.sub.frequency.setValueAtTime(Math.max(this.sub.frequency.value, 1), t);
      this.sub.frequency.exponentialRampToValueAtTime(midi(chord[0] - 12), t + 1.6);
      if (this.enabled) this.arpeggio();
    }

    /* velocidad de scroll normalizada 0..1 → filtro y viento */
    scrollVelocity(v) {
      if (!this.ready) return;
      const t = this.ctx.currentTime;
      this.padFilter.frequency.setTargetAtTime(460 + v * 1700, t, 0.12);
      this.windGain.gain.setTargetAtTime(0.012 + v * 0.11, t, 0.1);
      this.windFilter.frequency.setTargetAtTime(700 + v * 1400, t, 0.15);
    }

    /* forma de onda 0..255 para la escena; devuelve false si no hay audio */
    waveform(out) {
      if (!this.ready || !this.analyser) return false;
      this.analyser.getByteTimeDomainData(this._wave);
      const step = this._wave.length / out.length;
      for (let i = 0; i < out.length; i++) out[i] = this._wave[Math.floor(i * step)];
      return true;
    }

    /* ---------- gestos sonoros ---------- */

    _env(gain, t, attack, decay, peak) {
      const g = gain.gain;
      g.cancelScheduledValues(t);
      g.setValueAtTime(0.0001, t);
      g.exponentialRampToValueAtTime(peak, t + attack);
      g.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    }

    /* campana FM: suena en el eco y la reverberación */
    bell(freq, when, peak, decay) {
      if (!this.ready) return;
      const ctx = this.ctx, t = when || ctx.currentTime;
      const car = ctx.createOscillator(); car.type = 'sine'; car.frequency.value = freq;
      const mod = ctx.createOscillator(); mod.type = 'sine'; mod.frequency.value = freq * 2.01;
      const mg = ctx.createGain(); mg.gain.setValueAtTime(freq * 1.4, t); mg.gain.exponentialRampToValueAtTime(freq * 0.05, t + 1.2);
      mod.connect(mg); mg.connect(car.frequency);
      const g = ctx.createGain();
      this._env(g, t, 0.012, decay || 2.4, peak || 0.12);
      car.connect(g); g.connect(this.delay); g.connect(this.master);
      mod.start(t); car.start(t);
      mod.stop(t + (decay || 2.4) + 0.2); car.stop(t + (decay || 2.4) + 0.2);
    }

    _chordTone(offset) {
      const chord = CHORDS[this.station];
      const n = chord[1 + Math.floor(Math.random() * (chord.length - 1))] + 12 * (1 + Math.floor(Math.random() * 2));
      return midi(n + (offset || 0));
    }

    chime() { this.bell(this._chordTone(0), null, 0.09, 2.8); }

    _scheduleChime() {
      clearTimeout(this._chimeTimer);
      this._chimeTimer = setTimeout(() => {
        if (!this.enabled) return;
        this.chime();
        this._scheduleChime();
      }, 5000 + Math.random() * 9000);
    }

    /* tres notas del acorde, en ascenso */
    arpeggio() {
      if (!this.ready) return;
      const t = this.ctx.currentTime;
      const chord = CHORDS[this.station];
      for (let i = 0; i < 3; i++) this.bell(midi(chord[1 + i] + 12), t + i * 0.09, 0.07, 1.8);
    }

    shimmer() {
      if (!this.ready) return;
      const t = this.ctx.currentTime;
      for (let i = 0; i < 3; i++) this.bell(this._chordTone(12), t + i * 0.06, 0.05, 1.4);
    }

    /* viento al cambiar de capítulo */
    whoosh() {
      if (!this.ready) return;
      const ctx = this.ctx, t = ctx.currentTime;
      const src = ctx.createBufferSource(); src.buffer = this.noiseBuf;
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.2;
      bp.frequency.setValueAtTime(220, t); bp.frequency.exponentialRampToValueAtTime(2400, t + 0.5); bp.frequency.exponentialRampToValueAtTime(300, t + 1.1);
      const g = ctx.createGain(); this._env(g, t, 0.18, 0.9, 0.5);
      src.connect(bp); bp.connect(g); g.connect(this.master); g.connect(this.reverb);
      src.start(t); src.stop(t + 1.3);
    }

    /* vidrio breve en hover */
    blip(freq) {
      if (!this.ready) return;
      const ctx = this.ctx, t = ctx.currentTime;
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = freq || 1320;
      const g = ctx.createGain(); this._env(g, t, 0.006, 0.09, 0.05);
      o.connect(g); g.connect(this.master);
      o.start(t); o.stop(t + 0.14);
    }

    /* clic: dos notas secas */
    click() {
      if (!this.ready) return;
      const ctx = this.ctx, t = ctx.currentTime;
      [880, 1320].forEach((f, i) => {
        const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = f;
        const g = ctx.createGain(); this._env(g, t + i * 0.045, 0.004, 0.08, 0.08);
        o.connect(g); g.connect(this.master);
        o.start(t + i * 0.045); o.stop(t + i * 0.045 + 0.12);
      });
    }
  }

  window.GEGHAudio = GEGHAudio;
})();
