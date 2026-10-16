/* GEGH — "Un solo trazo": escena 3D (Three.js r128)
   Una línea de luz recorre un estudio oscuro; la cámara viaja sobre un riel y el scroll
   la empuja de capítulo en capítulo. En cada estación flota un objeto de vidrio renderizado
   (assets/img), con flotación, inclinación según el puntero, un barrido de luz que lo
   recorre, niebla de profundidad y bloom. Post: HDR + bloom + ACES.
   Diseño y desarrollo: Grupo Empresarial Guerrero Herrera (GEGH), Bucaramanga.
   Propiedad de Grupo Empresarial Guerrero Herrera S.A.S. */
(function () {
  'use strict';

  const { clamp, lerp, smoothstep, damp, Ease, tween, mulberry32 } = window.GEGH;

  const INK = 0x08070b;
  const STATIONS = 9;
  const ACCENTS = ['#efe8da', '#efe8da', '#c77dff', '#69d2ff', '#ffb45c', '#6ee7c8', '#efe8da', '#c77dff', '#ffb45c'];
  const lin = hex => new THREE.Color(hex).convertSRGBToLinear();

  /* Objetos por capítulo: posición en el marco de cada estación (adelante, lado, arriba) y tamaño.
     En escritorio van al lado contrario del texto; en móvil, centrados arriba del texto. */
  const OBJECTS = [
    { src: 'assets/img/00-inicio.webp',       d: { ahead: 6.2, side: 2.4, up: 0.15, size: 3.2 }, m: { ahead: 6.4, side: 0.0, up: 2.0, size: 2.5 } },
    { src: 'assets/img/01-manifiesto.webp',   d: { ahead: 5.8, side: 1.75, up: 0.25, size: 3.2 }, m: { ahead: 6.2, side: 0.0, up: 1.5, size: 2.7 } },
    { src: 'assets/img/02-diseno.webp',       d: { ahead: 5.8, side: 2.0, up: 0.2, size: 3.3 },  m: { ahead: 6.2, side: 0.0, up: 1.5, size: 2.8 } },
    { src: 'assets/img/03-software.webp',     d: { ahead: 6.0, side: -2.1, up: 0.15, size: 3.2 }, m: { ahead: 6.4, side: 0.0, up: 1.5, size: 2.7 } },
    { src: 'assets/img/04-multimedia.webp',   d: { ahead: 5.8, side: 2.0, up: 0.0, size: 3.4 },  m: { ahead: 6.2, side: 0.0, up: 1.5, size: 2.9 } },
    { src: 'assets/img/05-aprendizaje.webp',  d: { ahead: 5.8, side: -2.0, up: 0.1, size: 3.2 }, m: { ahead: 6.2, side: 0.0, up: 1.5, size: 2.8 } },
    { src: 'assets/img/06-proceso.webp',      d: { ahead: 5.8, side: 2.0, up: 0.1, size: 3.4 },  m: { ahead: 6.2, side: 0.0, up: 1.5, size: 2.9 } },
    { src: 'assets/img/07-colaboracion.webp', d: { ahead: 6.6, side: 0.0, up: 1.55, size: 2.4 }, m: { ahead: 7.0, side: 0.0, up: 2.4, size: 2.3 } },
    { src: 'assets/img/08-contacto.webp',     d: { ahead: 6.0, side: 2.2, up: -0.1, size: 3.6 }, m: { ahead: 6.4, side: 0.0, up: 1.4, size: 3.0 } }
  ];

  /* ---------------- GLSL ---------------- */

  const FOG = `
    uniform vec3 uFogColor; uniform float uFogNear; uniform float uFogFar;
    float fogF(float z){ return smoothstep(uFogNear, uFogFar, z); }
  `;

  /* Objeto renderizado: el negro del render se vuelve transparente; barrido de luz; tinte del capítulo */
  const IMG_VERT = `
    varying vec2 vUv; varying float vZ; varying vec3 vN;
    void main(){
      vUv = uv;
      vN = normalize(normalMatrix * normal);
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      vZ = -mv.z;
      gl_Position = projectionMatrix * mv;
    }
  `;
  const IMG_FRAG = `
    precision highp float;
    uniform sampler2D uMap; uniform float uTime; uniform float uAlpha; uniform float uSweep; uniform float uSweepAmt;
    uniform vec3 uTint; uniform float uTintAmt; uniform float uGain; uniform float uVolume;
    varying vec2 vUv; varying float vZ; varying vec3 vN;
    ${FOG}
    void main(){
      vec3 c = texture2D(uMap, vUv).rgb;
      float lum = max(c.r, max(c.g, c.b));
      float a = smoothstep(0.0, 0.075, lum) * uAlpha;
      c = pow(c, vec3(2.2)) * uGain;                       // sRGB → lineal
      vec3 n = normalize(vN);
      // volumen: la luz del estudio cae desde arriba a la izquierda y el borde se oscurece al girar
      float key = max(dot(n, normalize(vec3(-0.35, 0.55, 1.0))), 0.0);
      float rim = pow(1.0 - clamp(n.z, 0.0, 1.0), 1.6);
      c *= mix(1.0, 0.72 + 0.5 * key, uVolume) * (1.0 - 0.45 * rim * uVolume);
      float sw = exp(-pow((vUv.x + vUv.y * 0.35 - uSweep) * 7.0, 2.0));
      c += c * sw * uSweepAmt * 2.2;                       // destello que recorre el vidrio
      c += uTint * uTintAmt * pow(lum, 1.5) * 0.25;        // el color del capítulo se refleja en el objeto
      c = mix(c, uFogColor, fogF(vZ));
      gl_FragColor = vec4(c, a);
    }
  `;

  /* Partículas de materialización: el objeto se forma a partir de luz y vuelve a disolverse */
  const MAT_VERT = `
    attribute vec3 aTarget; attribute vec3 aScatter; attribute vec3 aColor; attribute float aSeed;
    uniform float uMorph; uniform float uTime; uniform float uPixelRatio; uniform float uSize;
    varying vec3 vC; varying float vA; varying float vZ;
    void main(){
      float e = uMorph * uMorph * (3.0 - 2.0 * uMorph);
      float d = pow(1.0 - e, 1.5);
      vec3 sc = aScatter + vec3(sin(uTime * 0.7 + aSeed * 9.0), cos(uTime * 0.5 + aSeed * 7.0), sin(uTime * 0.6 + aSeed * 5.0)) * 0.12 * d;
      // cada partícula llega en su propio momento
      float m = clamp((e - aSeed * 0.35) / 0.65, 0.0, 1.0);
      m = m * m * (3.0 - 2.0 * m);
      vec3 p = mix(sc, aTarget, m);
      vec4 mv = modelViewMatrix * vec4(p, 1.0);
      vZ = -mv.z;
      vC = aColor;
      vA = smoothstep(0.0, 0.12, uMorph) * (1.0 - smoothstep(0.72, 1.0, uMorph));
      gl_PointSize = uSize * (1.0 + 0.7 * (1.0 - m)) * uPixelRatio * (90.0 / max(vZ, 1.0)) * 0.12;
      gl_Position = projectionMatrix * mv;
    }
  `;
  const MAT_FRAG = `
    precision highp float;
    varying vec3 vC; varying float vA; varying float vZ;
    ${FOG}
    void main(){
      vec2 c = gl_PointCoord - 0.5;
      float m = 1.0 - smoothstep(0.12, 0.5, length(c));
      float a = m * vA * (1.0 - fogF(vZ));
      gl_FragColor = vec4(vC * a * 1.6, a);
    }
  `;

  /* El trazo: luz pura con pulsos que corren a lo largo */
  const TRAZO_VERT = `
    varying vec2 vUv; varying float vZ; varying float vFres;
    void main(){
      vUv = uv;
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      vec3 n = normalize(normalMatrix * normal);
      vFres = pow(1.0 - abs(dot(n, normalize(-mv.xyz))), 1.5);
      vZ = -mv.z;
      gl_Position = projectionMatrix * mv;
    }
  `;
  const TRAZO_FRAG = `
    precision highp float;
    uniform vec3 uColor; uniform vec3 uHot; uniform float uTime; uniform float uFlow; uniform float uAlpha; uniform float uDraw; uniform float uGain;
    varying vec2 vUv; varying float vZ; varying float vFres;
    ${FOG}
    void main(){
      float u = vUv.x;
      if (u > uDraw) discard;
      float head = smoothstep(uDraw - 0.012, uDraw, u) * 3.0;
      float pulse = pow(0.5 + 0.5 * sin(u * 140.0 - uTime * uFlow), 10.0);
      float slow  = pow(0.5 + 0.5 * sin(u * 9.0 - uTime * 0.35), 3.0);
      vec3 col = mix(uColor * 0.6, uHot, pulse * 0.9) * uGain;
      col += uColor * slow * 0.5 + uHot * head;
      col = mix(col, uHot, vFres * 0.2);
      col *= 1.0 - fogF(vZ);
      gl_FragColor = vec4(col, (0.8 + 0.2 * pulse) * uAlpha);
    }
  `;
  const HALO_FRAG = `
    precision highp float;
    uniform vec3 uColor; uniform float uTime; uniform float uDraw;
    varying vec2 vUv; varying float vZ; varying float vFres;
    ${FOG}
    void main(){
      if (vUv.x > uDraw) discard;
      float pulse = pow(0.5 + 0.5 * sin(vUv.x * 140.0 - uTime * 5.0), 10.0);
      float a = (1.0 - vFres) * (0.06 + 0.16 * pulse);
      gl_FragColor = vec4(uColor * a * (1.0 - fogF(vZ)), 1.0);
    }
  `;

  /* Polvo: puntos aditivos a lo largo del recorrido */
  const DUST_VERT = `
    attribute float aSeed;
    uniform float uTime; uniform float uPixelRatio;
    varying float vA; varying float vZ;
    void main(){
      vec3 p = position;
      p.x += sin(uTime * 0.25 + aSeed * 6.28) * 0.35;
      p.y += cos(uTime * 0.2 + aSeed * 9.4) * 0.3;
      vec4 mv = modelViewMatrix * vec4(p, 1.0);
      vZ = -mv.z;
      vA = 0.55 + 0.45 * sin(uTime * (0.8 + aSeed) + aSeed * 20.0);
      gl_PointSize = (1.5 + aSeed * 2.5) * uPixelRatio * (60.0 / max(vZ, 1.0)) * 0.25 + 0.8 * uPixelRatio;
      gl_Position = projectionMatrix * mv;
    }
  `;
  const DUST_FRAG = `
    precision highp float;
    uniform vec3 uColor;
    varying float vA; varying float vZ;
    ${FOG}
    void main(){
      vec2 c = gl_PointCoord - 0.5;
      float m = 1.0 - smoothstep(0.15, 0.5, length(c));
      float a = m * vA * 0.5 * (1.0 - fogF(vZ));
      gl_FragColor = vec4(uColor * a, a);
    }
  `;

  /* Post-proceso */
  const QUAD_VERT = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
  const BRIGHT_FRAG = `
    precision highp float;
    uniform sampler2D tDiffuse; uniform float uThreshold;
    varying vec2 vUv;
    vec3 sane(vec3 c){
      if (!(c.r <= 48.0)) c.r = 0.0; if (!(c.g <= 48.0)) c.g = 0.0; if (!(c.b <= 48.0)) c.b = 0.0;
      return max(c, 0.0);
    }
    void main(){
      vec3 c = sane(texture2D(tDiffuse, vUv).rgb);
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      float k = smoothstep(uThreshold, uThreshold + 0.6, l);
      gl_FragColor = vec4(c * k, 1.0);
    }
  `;
  const BLUR_FRAG = `
    precision highp float;
    uniform sampler2D tDiffuse; uniform vec2 uDir;
    varying vec2 vUv;
    void main(){
      vec3 c = texture2D(tDiffuse, vUv).rgb * 0.227027;
      vec2 o1 = uDir * 1.384615, o2 = uDir * 3.230769;
      c += (texture2D(tDiffuse, vUv + o1).rgb + texture2D(tDiffuse, vUv - o1).rgb) * 0.316216;
      c += (texture2D(tDiffuse, vUv + o2).rgb + texture2D(tDiffuse, vUv - o2).rgb) * 0.070270;
      gl_FragColor = vec4(c, 1.0);
    }
  `;
  const POST_FRAG = `
    precision highp float;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
    float vnoise(vec2 p){
      vec2 i = floor(p), f = fract(p);
      vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
    }
    float fbm(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 3; i++) { v += a * vnoise(p); p = p * 2.03 + 11.7; a *= 0.5; } return v; }
    uniform sampler2D tDiffuse; uniform sampler2D tBloom; uniform vec2 uRes; uniform float uTime;
    uniform float uAberration; uniform float uVel; uniform float uVignette; uniform float uGrain; uniform float uBloom; uniform float uExposure; uniform vec3 uTint; uniform float uShock;
    varying vec2 vUv;
    vec3 aces(vec3 x){
      const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
      return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
    }
    void main(){
      vec2 uv = vUv;
      vec2 c = uv - 0.5;
      float r = length(c);
      vec2 dir = c / max(r, 1e-4);
      // onda de choque sutil al entrar en un capítulo
      if (uShock >= 0.0 && uShock < 1.1) {
        float k = 1.0 - uShock / 1.1;
        uv += dir * sin(r * 34.0 - uShock * 11.0) * 0.0032 * k * k;
      }
      float ab = uAberration * (0.35 + r * 2.2);
      vec3 col = vec3(0.0);
      for (int i = 0; i < 4; i++) {
        float k = float(i) / 3.0;
        vec2 o = dir * uVel * 0.02 * k * r;
        col.r += texture2D(tDiffuse, uv - dir * ab - o).r;
        col.g += texture2D(tDiffuse, uv - o).g;
        col.b += texture2D(tDiffuse, uv + dir * ab - o).b;
      }
      col *= 0.25;
      if (!(col.r <= 48.0)) col.r = 0.0; if (!(col.g <= 48.0)) col.g = 0.0; if (!(col.b <= 48.0)) col.b = 0.0;
      vec3 bl = texture2D(tBloom, uv).rgb;
      if (!(bl.r <= 48.0)) bl.r = 0.0; if (!(bl.g <= 48.0)) bl.g = 0.0; if (!(bl.b <= 48.0)) bl.b = 0.0;
      col = max(col, 0.0) + max(bl, 0.0) * uBloom;
      col = aces(col * uExposure);
      col = pow(col, vec3(1.0 / 2.2));
      // aurora: un campo de color lento con el tono del capítulo
      float au = fbm(uv * vec2(2.2, 1.4) + vec2(uTime * 0.025, -uTime * 0.018));
      col += uTint * (0.03 + 0.06 * au) * (1.0 - smoothstep(0.1, 0.95, r));
      col *= 1.0 - uVignette * smoothstep(0.32, 0.98, r);
      float g = fract(sin(dot(uv * uRes + vec2(uTime * 37.0, uTime * 11.0), vec2(12.9898, 78.233))) * 43758.5453);
      col += (g - 0.5) * uGrain;
      gl_FragColor = vec4(col, 1.0);
    }
  `;

  /* ---------------- utilidades ---------------- */

  const UP = new THREE.Vector3(0, 1, 0);
  function frameAt(curve, t, look) {
    const p = curve.getPointAt(t);
    const T = look
      ? curve.getPointAt(Math.min(t + 0.014, 1)).sub(p).normalize()
      : curve.getTangentAt(t).normalize();
    if (T.lengthSq() < 1e-6) T.copy(curve.getTangentAt(t)).normalize();
    const R = new THREE.Vector3().crossVectors(T, UP).normalize();
    const U = new THREE.Vector3().crossVectors(R, T).normalize();
    return { p, T, R, U };
  }
  function local(f, ahead, side, up) {
    return f.p.clone().addScaledVector(f.T, ahead).addScaledVector(f.R, side).addScaledVector(f.U, up);
  }

  /* ---------------- escena ---------------- */

  class GEGHScene {
    constructor(canvas, opts) {
      opts = opts || {};
      this.canvas = canvas;
      this.mobile = !!opts.mobile;
      this.reduced = !!opts.reduced;
      this.q = this.mobile ? 0.5 : 1;
      this.rng = mulberry32(2026);
      this.time = 0;
      this.sceneT = 0; this.targetT = 0; this.velN = 0; this.abKick = 0;
      this.mouse = { x: 0, y: 0 }; this.par = { x: 0, y: 0 };
      this.introActive = false; this.introT = 0; this.drawP = 0;
      this.process = 0; this.shockAt = -10;
      this._ndc = new THREE.Vector3();
      this.frames = 0; this.frameAcc = 0;
      this.ready = false;
      this.accent = new THREE.Color();
      this.colors = ACCENTS.map(lin);
      this.waveIn = new Uint8Array(256);
      this.audioLevel = 0;
      this.audio = null;
      this.objects = [];
    }

    init() {
      const r = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: false, alpha: false, powerPreference: 'high-performance', stencil: false });
      this.renderer = r;
      this.gl2 = r.capabilities.isWebGL2;
      this.pr = Math.min(window.devicePixelRatio || 1, this.mobile ? 1.5 : 2);
      r.setPixelRatio(this.pr);
      r.setClearColor(new THREE.Color(INK).convertSRGBToLinear(), 1);
      r.toneMapping = THREE.NoToneMapping;
      r.outputEncoding = THREE.LinearEncoding;
      this.hdr = this.gl2 && !!(r.extensions.get('EXT_color_buffer_float') || r.extensions.get('EXT_color_buffer_half_float'));

      this.scene = new THREE.Scene();
      this.camera = new THREE.PerspectiveCamera(this.mobile ? 60 : 48, 1, 0.08, 90);
      this.fogU = { uFogColor: { value: lin('#08070b') }, uFogNear: { value: 9 }, uFogFar: { value: 30 } };

      this._buildPath();
      this._buildPost();
      this._buildTrazo();
      this._buildDust();
      this._buildObjects();

      this.resize();
      this.clock = new THREE.Clock();
      this._loop = this._loop.bind(this);
      this.running = true;
      this.ready = true;
      this.setCamera(this.stationT[0]);
      requestAnimationFrame(this._loop);
    }

    _fogged(u) { return Object.assign(u, this.fogU); }

    /* --- riel y trazo --- */
    _buildPath() {
      const pts = [
        new THREE.Vector3(0, 0.5, 9),
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(2.4, -0.5, -12),
        new THREE.Vector3(-2.6, 0.6, -24),
        new THREE.Vector3(2.8, -0.2, -36),
        new THREE.Vector3(-2.0, 0.9, -48),
        new THREE.Vector3(2.2, -0.4, -60),
        new THREE.Vector3(-1.8, 0.8, -72),
        new THREE.Vector3(2.4, -0.6, -84),
        new THREE.Vector3(0.6, 0.6, -98)
      ];
      this.rail = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
      this.stationT = [];
      const N = 2600;
      for (let s = 1; s < pts.length; s++) {
        let best = 0, bd = Infinity;
        for (let i = 0; i <= N; i++) {
          const d = this.rail.getPointAt(i / N).distanceToSquared(pts[s]);
          if (d < bd) { bd = d; best = i / N; }
        }
        this.stationT.push(best);
      }
      this.stationT[this.stationT.length - 1] = 1;
      this.frame = this.stationT.map(t => frameAt(this.rail, t, true));

      const tp = [];
      const M = 300;
      for (let i = 0; i <= M; i++) {
        const t = i / M;
        const f = frameAt(this.rail, t);
        const side = 2.3 * Math.sin(t * Math.PI * 7.1 + 0.4) * (this.mobile ? 0.6 : 1);
        const up = -1.15 + 0.55 * Math.cos(t * Math.PI * 4.6);
        tp.push(local(f, 0, side, up));
      }
      this.trazoCurve = new THREE.CatmullRomCurve3(tp, false, 'centripetal');
    }

    _buildTrazo() {
      const segs = this.mobile ? 800 : 1200;
      const geo = new THREE.TubeGeometry(this.trazoCurve, segs, 0.022, 7, false);
      this.trazoU = this._fogged({
        uColor: { value: this.colors[0].clone() }, uHot: { value: new THREE.Color(1, 1, 1) },
        uTime: { value: 0 }, uFlow: { value: 5.0 }, uAlpha: { value: 1 }, uDraw: { value: 0 }, uGain: { value: 1.6 }
      });
      const mat = new THREE.ShaderMaterial({ uniforms: this.trazoU, vertexShader: TRAZO_VERT, fragmentShader: TRAZO_FRAG, transparent: true, depthWrite: true });
      this.trazo = new THREE.Mesh(geo, mat);
      this.trazo.frustumCulled = false;
      this.scene.add(this.trazo);
      const hgeo = new THREE.TubeGeometry(this.trazoCurve, Math.round(segs * 0.6), 0.1, 6, false);
      const hmat = new THREE.ShaderMaterial({ uniforms: this.trazoU, vertexShader: TRAZO_VERT, fragmentShader: HALO_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.BackSide });
      this.halo = new THREE.Mesh(hgeo, hmat);
      this.halo.frustumCulled = false;
      this.scene.add(this.halo);
    }

    _buildDust() {
      const N = Math.round(1000 * this.q) + 300;
      const pos = new Float32Array(N * 3), seed = new Float32Array(N);
      const rng = this.rng;
      for (let i = 0; i < N; i++) {
        const t = rng();
        const f = frameAt(this.rail, t);
        const a = rng() * Math.PI * 2, rad = 1.2 + rng() * 5.5;
        const p = local(f, 0, Math.cos(a) * rad, Math.sin(a) * rad * 0.7);
        pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z;
        seed[i] = rng();
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
      this.dustU = this._fogged({ uTime: { value: 0 }, uPixelRatio: { value: this.pr }, uColor: { value: lin('#efe8da').multiplyScalar(1.8) } });
      const mat = new THREE.ShaderMaterial({ uniforms: this.dustU, vertexShader: DUST_VERT, fragmentShader: DUST_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
      this.dust = new THREE.Points(geo, mat);
      this.dust.frustumCulled = false;
      this.scene.add(this.dust);
    }

    /* --- los objetos renderizados, uno por estación --- */
    /* Infla la silueta del render: un mapa de altura suave a partir de la máscara, para que
       el objeto tenga volumen real al girar (paralaje en los bordes, sombreado, borde). */
    _inflate(geo, image, depth) {
      const S = 96;
      const cv = document.createElement('canvas');
      cv.width = S; cv.height = S;
      const ctx = cv.getContext('2d');
      ctx.drawImage(image, 0, 0, S, S);
      const d = ctx.getImageData(0, 0, S, S).data;
      let h = new Float32Array(S * S);
      for (let i = 0; i < S * S; i++) {
        const l = Math.max(d[i * 4], d[i * 4 + 1], d[i * 4 + 2]) / 255;
        h[i] = smoothstep(0.03, 0.14, l);
      }
      const mask = h.slice();
      // desenfoque separable repetido ≈ distancia al borde, suavizada
      const r = 5;
      let tmp = new Float32Array(S * S);
      for (let pass = 0; pass < 4; pass++) {
        for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
          let acc = 0, n = 0;
          for (let k = -r; k <= r; k++) { const xx = x + k; if (xx >= 0 && xx < S) { acc += h[y * S + xx]; n++; } }
          tmp[y * S + x] = acc / n;
        }
        for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
          let acc = 0, n = 0;
          for (let k = -r; k <= r; k++) { const yy = y + k; if (yy >= 0 && yy < S) { acc += tmp[yy * S + x]; n++; } }
          h[y * S + x] = acc / n;
        }
      }
      const pos = geo.attributes.position;
      const seg = Math.round(Math.sqrt(pos.count)) - 1;
      for (let i = 0; i < pos.count; i++) {
        const u = pos.getX(i) + 0.5, v = 0.5 - pos.getY(i);
        const x = Math.min(S - 1, Math.max(0, Math.round(u * (S - 1))));
        const y = Math.min(S - 1, Math.max(0, Math.round(v * (S - 1))));
        const k = h[y * S + x] * mask[y * S + x];
        pos.setZ(i, Math.pow(k, 0.75) * depth);
      }
      pos.needsUpdate = true;
      geo.computeVertexNormals();
      return seg;
    }

    _buildObjects() {
      const loader = new THREE.TextureLoader();
      OBJECTS.forEach((o, i) => {
        const geo = new THREE.PlaneGeometry(1, 1, 80, 80);
        const cfg = this.mobile ? o.m : o.d;
        const f = this.frame[i];
        const base = local(f, cfg.ahead, cfg.side, cfg.up);
        const u = this._fogged({
          uMap: { value: null }, uTime: { value: 0 }, uAlpha: { value: 0 }, uSweep: { value: -0.5 }, uSweepAmt: { value: 1 },
          uTint: { value: this.colors[i].clone() }, uTintAmt: { value: 0.6 }, uGain: { value: i === 8 ? 1.45 : 1.15 },
          uVolume: { value: 1 }
        });
        const mat = new THREE.ShaderMaterial({ uniforms: u, vertexShader: IMG_VERT, fragmentShader: IMG_FRAG, transparent: true, depthWrite: false });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.copy(base);
        mesh.scale.setScalar(cfg.size);
        mesh.frustumCulled = false;
        mesh.renderOrder = 10;
        mesh.visible = false;
        this.scene.add(mesh);
        const obj = { mesh, u, base, size: cfg.size, phase: i * 1.7, sweepT: -4 + i * 0.9, loaded: false, i, gain: i === 8 ? 1.45 : 1.15, hover: 0, hot: false, morph: 0, particles: null };
        this.objects.push(obj);
        loader.load(o.src, tex => {
          tex.minFilter = THREE.LinearMipmapLinearFilter; tex.magFilter = THREE.LinearFilter;
          tex.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
          tex.generateMipmaps = true;
          u.uMap.value = tex;
          try { this._inflate(geo, tex.image, 0.2); } catch (e) { u.uVolume.value = 0; }
          try { this._buildParticles(obj, tex.image); } catch (e) { obj.particles = null; }
          obj.loaded = true;
          obj.T = f.T.clone();
        });
      });
    }

    /* Partículas: puntos de luz muestreados del render; nacen dispersos y se reúnen en la forma */
    _buildParticles(obj, image) {
      const N = this.mobile ? 2200 : 4200;
      const S = 192;
      const cv = document.createElement('canvas');
      cv.width = S; cv.height = S;
      const ctx = cv.getContext('2d');
      ctx.drawImage(image, 0, 0, S, S);
      const d = ctx.getImageData(0, 0, S, S).data;
      const px = [];
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        const i = (y * S + x) * 4;
        const l = Math.max(d[i], d[i + 1], d[i + 2]) / 255;
        if (l > 0.1) px.push(x, y, d[i] / 255, d[i + 1] / 255, d[i + 2] / 255, l);
      }
      if (px.length < 60) return;
      const nP = px.length / 6;
      const rng = mulberry32(100 + obj.i);
      const target = new Float32Array(N * 3), scatter = new Float32Array(N * 3), color = new Float32Array(N * 3), seed = new Float32Array(N);
      for (let k = 0; k < N; k++) {
        // muestreo sesgado hacia los píxeles brillantes
        let j = Math.floor(rng() * nP);
        if (px[j * 6 + 5] < rng()) j = Math.floor(rng() * nP);
        const x = px[j * 6], y = px[j * 6 + 1];
        target[k * 3] = x / (S - 1) - 0.5 + (rng() - 0.5) * 0.004;
        target[k * 3 + 1] = 0.5 - y / (S - 1) + (rng() - 0.5) * 0.004;
        target[k * 3 + 2] = 0.04 + rng() * 0.08;
        const a = rng() * Math.PI * 2, b = Math.acos(2 * rng() - 1), r = 0.3 + rng() * 0.75;
        scatter[k * 3] = Math.sin(b) * Math.cos(a) * r;
        scatter[k * 3 + 1] = Math.sin(b) * Math.sin(a) * r * 0.8;
        scatter[k * 3 + 2] = Math.cos(b) * r * 0.6 + 0.35;
        const g = 0.6 + px[j * 6 + 5] * 0.9;
        color[k * 3] = Math.pow(px[j * 6 + 2], 2.2) * g + 0.05;
        color[k * 3 + 1] = Math.pow(px[j * 6 + 3], 2.2) * g + 0.05;
        color[k * 3 + 2] = Math.pow(px[j * 6 + 4], 2.2) * g + 0.06;
        seed[k] = rng();
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(target.slice(), 3));
      geo.setAttribute('aTarget', new THREE.BufferAttribute(target, 3));
      geo.setAttribute('aScatter', new THREE.BufferAttribute(scatter, 3));
      geo.setAttribute('aColor', new THREE.BufferAttribute(color, 3));
      geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
      const u = this._fogged({ uMorph: { value: 0 }, uTime: { value: 0 }, uPixelRatio: { value: this.pr }, uSize: { value: this.mobile ? 1.5 : 1.7 } });
      const mat = new THREE.ShaderMaterial({ uniforms: u, vertexShader: MAT_VERT, fragmentShader: MAT_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
      const pts = new THREE.Points(geo, mat);
      pts.frustumCulled = false;
      pts.renderOrder = 11;
      obj.mesh.add(pts);
      obj.particles = pts;
      obj.pU = u;
      obj.morph = 0;
    }

    _updateObjects(t, s) {
      const cam = this.camera;
      const sweepEvery = 7.0;
      this.objects.forEach(o => {
        if (!o.loaded) return;
        const rel = s - o.i;                 // <0: todavía no llegamos; >0: ya lo pasamos
        const dist = Math.abs(rel);
        if (dist > 1.2) { o.mesh.visible = false; return; }
        o.mesh.visible = true;
        const near = 1 - smoothstep(0.0, 1.2, dist);
        const bob = this.reduced ? 0 : Math.sin(t * 0.55 + o.phase) * 0.06;
        // acompaña a la cámara mientras se lee el capítulo (se aleja más despacio que ella)
        const follow = rel > 0 ? rel * 10.1 : rel * 1.2;
        o.mesh.position.copy(o.base).addScaledVector(o.T, follow);
        o.mesh.position.y += bob;
        let sc = o.size * (0.9 + 0.1 * near);
        if (o.i === 4) sc *= 1 + this.audioLevel * 0.1;   // multimedia late con la música
        o.mesh.scale.setScalar(sc);
        // materialización: al acercarse, las partículas se reúnen y el render aparece; al irse, se disuelve
        const want = dist < 0.9 ? 1 : 0;
        const rate = this.reduced ? 20 : (want ? 1.9 : 2.6);
        o.morph += (want - o.morph) * (1 - Math.exp(-rate * this.dt));
        const fade = 1 - smoothstep(0.45, 0.95, dist);
        o.u.uAlpha.value = fade * smoothstep(0.55, 1.0, o.morph);
        if (o.particles) {
          o.pU.uMorph.value = o.morph;
          o.pU.uTime.value = t;
          o.particles.visible = o.morph > 0.01 && o.morph < 0.995;
        }
        // de frente a la cámara, pero gira con el scroll y con el puntero: muestra su volumen
        o.mesh.quaternion.copy(cam.quaternion);
        const idle = this.reduced ? 0 : Math.sin(t * 0.3 + o.phase) * 0.08;
        let tiltY = this.par.x * 0.7 + rel * 0.95 + idle;
        let tiltX = -this.par.y * 0.5 + (this.reduced ? 0 : Math.sin(t * 0.4 + o.phase) * 0.04) - rel * 0.12;
        // el puntero atrae al objeto: se gira hacia él y se enciende
        const ndc = this._ndc.copy(o.mesh.position).project(cam);
        const dx = this.mouse.x - ndc.x, dy = -this.mouse.y - ndc.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        const k = this.mobile ? 0 : 1 - smoothstep(0.12, 0.5, d);
        o.hover = (o.hover || 0) + (k - (o.hover || 0)) * 0.08;
        tiltY += dx * 0.55 * o.hover;
        tiltX -= dy * 0.45 * o.hover;
        o.u.uGain.value = o.gain * (1 + 0.3 * o.hover);
        if (k > 0.6 && !o.hot) { o.hot = true; o.sweepT = t; } else if (k < 0.2) o.hot = false;
        o.mesh.rotateY(tiltY);
        o.mesh.rotateX(tiltX);
        // destello que recorre el vidrio cada tantos segundos
        const cycle = ((t - o.sweepT) % sweepEvery + sweepEvery) % sweepEvery;
        o.u.uSweep.value = cycle < 1.6 ? -0.3 + cycle / 1.6 * 1.9 : -2.0;
        o.u.uSweepAmt.value = this.reduced ? 0 : near;
        o.u.uTime.value = t;
      });
    }

    _updateAudio() {
      let has = false;
      if (this.audio) has = this.audio.waveform(this.waveIn);
      let lvl = 0;
      if (has) {
        let acc = 0;
        for (let i = 0; i < 256; i += 4) { const v = (this.waveIn[i] - 128) / 128; acc += v * v; }
        lvl = Math.min(1, Math.sqrt(acc / 64) * 4);
      } else {
        lvl = 0.3 + 0.3 * Math.sin(this.time * 1.7);
      }
      this.audioLevel += (lvl - this.audioLevel) * 0.2;
    }

    /* --- post: HDR + bloom + ACES --- */
    _buildPost() {
      const size = new THREE.Vector2();
      this.renderer.getDrawingBufferSize(size);
      const w = Math.max(1, size.x), h = Math.max(1, size.y);
      const type = this.hdr ? THREE.HalfFloatType : THREE.UnsignedByteType;
      const params = { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: true, stencilBuffer: false, type };
      if (this.gl2 && !this.mobile && THREE.WebGLMultisampleRenderTarget) {
        this.rt = new THREE.WebGLMultisampleRenderTarget(w, h, params);
        this.rt.samples = 4;
      } else {
        this.rt = new THREE.WebGLRenderTarget(w, h, params);
      }
      const bw = Math.max(1, Math.round(w / 4)), bh = Math.max(1, Math.round(h / 4));
      const bp = { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false, stencilBuffer: false, type };
      this.bloomA = new THREE.WebGLRenderTarget(bw, bh, bp);
      this.bloomB = new THREE.WebGLRenderTarget(bw, bh, bp);

      this.abBase = 0.0011;
      this.postU = {
        tDiffuse: { value: this.rt.texture }, tBloom: { value: this.bloomB.texture }, uRes: { value: new THREE.Vector2(w, h) }, uTime: { value: 0 },
        uAberration: { value: this.abBase }, uVel: { value: 0 }, uVignette: { value: 0.58 }, uGrain: { value: 0.03 },
        uBloom: { value: 0.7 }, uExposure: { value: 1.0 }, uTint: { value: this.colors[0].clone() }, uShock: { value: -1 }
      };
      this.brightU = { tDiffuse: { value: this.rt.texture }, uThreshold: { value: 0.8 } };
      this.blurU = { tDiffuse: { value: null }, uDir: { value: new THREE.Vector2(1 / bw, 0) } };
      const mk = (frag, uniforms) => new THREE.ShaderMaterial({ uniforms, vertexShader: QUAD_VERT, fragmentShader: frag, depthTest: false, depthWrite: false });
      this.postMat = mk(POST_FRAG, this.postU);
      this.brightMat = mk(BRIGHT_FRAG, this.brightU);
      this.blurMat = mk(BLUR_FRAG, this.blurU);
      this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.postMat);
      this.postScene = new THREE.Scene();
      this.postScene.add(this.quad);
      this.postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
      this.bloomSize = new THREE.Vector2(bw, bh);
    }

    _renderPost() {
      const r = this.renderer;
      this.quad.material = this.brightMat;
      r.setRenderTarget(this.bloomA); r.render(this.postScene, this.postCam);
      this.quad.material = this.blurMat;
      const bw = this.bloomSize.x, bh = this.bloomSize.y;
      for (let i = 0; i < 2; i++) {
        this.blurU.tDiffuse.value = this.bloomA.texture; this.blurU.uDir.value.set((1 + i) / bw, 0);
        r.setRenderTarget(this.bloomB); r.render(this.postScene, this.postCam);
        this.blurU.tDiffuse.value = this.bloomB.texture; this.blurU.uDir.value.set(0, (1 + i) / bh);
        r.setRenderTarget(this.bloomA); r.render(this.postScene, this.postCam);
      }
      this.postU.tBloom.value = this.bloomA.texture;
      this.quad.material = this.postMat;
      r.setRenderTarget(null); r.render(this.postScene, this.postCam);
    }

    /* ---------------- API pública ---------------- */

    attachAudio(audio) { this.audio = audio; }

    playIntro() {
      if (this.reduced) {
        this.trazoU.uDraw.value = 1; this.drawP = 1;
        this.setCamera(this.stationT[0]);
        return 0.4;
      }
      this.introActive = true;
      this.introT = 0;
      this.drawP = 0;
      this.postU.uAberration.value = 0.016;
      this.postU.uGrain.value = 0.16;
      this.postU.uExposure.value = 0.35;
      tween(this, { introT: this.stationT[0] }, { duration: 3.4, ease: Ease.inOutCubic, onComplete: () => { this.introActive = false; } });
      tween(this, { drawP: 1 }, { duration: 3.1, ease: Ease.outExpo });
      tween(this.postU.uAberration, { value: this.abBase }, { duration: 3.0, ease: Ease.outExpo });
      tween(this.postU.uGrain, { value: 0.03 }, { duration: 2.4, ease: Ease.outCubic });
      tween(this.postU.uExposure, { value: 1.0 }, { duration: 2.6, ease: Ease.outCubic });
      return 3.4;
    }

    setScroll(sceneT, velNorm) { this.targetT = clamp(sceneT, 0, STATIONS - 1); this.velN = velNorm || 0; }
    setPointer(x, y) { this.mouse.x = x; this.mouse.y = y; }
    setProcess(p) { this.process = clamp(p, 0, 1); }
    /* al pasar sobre los datos de contacto, un destello recorre la cordillera */
    ripple() { const o = this.objects[8]; if (o) o.sweepT = this.time; }
    settle() { this.sceneT = this.targetT; this.introActive = false; this.drawP = 1; }
    pulse(strength) { this.abKick = Math.max(this.abKick, 0.007 * (strength || 1)); this.shockAt = this.time; }

    setCamera(t) {
      const f = frameAt(this.rail, clamp(t, 0, 1));
      this.camera.position.copy(f.p);
      this.camera.lookAt(f.p.clone().add(f.T));
    }

    resize() {
      const w = window.innerWidth, h = window.innerHeight;
      this.renderer.setSize(w, h, false);
      this.camera.aspect = w / h;
      this.baseFov = (this.mobile || w < h) ? 62 : 48;
      this.camera.fov = this.baseFov;
      this.camera.updateProjectionMatrix();
      const size = new THREE.Vector2();
      this.renderer.getDrawingBufferSize(size);
      this.rt.setSize(Math.max(1, size.x), Math.max(1, size.y));
      const bw = Math.max(1, Math.round(size.x / 4)), bh = Math.max(1, Math.round(size.y / 4));
      this.bloomA.setSize(bw, bh); this.bloomB.setSize(bw, bh);
      this.bloomSize.set(bw, bh);
      this.postU.uRes.value.set(size.x, size.y);
    }

    _railT() {
      if (this.introActive) return this.introT;
      const s = clamp(this.sceneT, 0, STATIONS - 1);
      const i = Math.min(Math.floor(s), STATIONS - 2);
      const f = s - i;
      return lerp(this.stationT[i], this.stationT[i + 1], f);
    }

    _loop() {
      if (!this.running) return;
      requestAnimationFrame(this._loop);
      if (document.hidden) return;
      const dt = Math.min(this.clock.getDelta(), 0.05);
      this.dt = dt;
      this.time += dt * (this.reduced ? 0.35 : 1);
      const t = this.time;

      this.frames++; this.frameAcc += dt;
      if (this.frames >= 90) {
        const avg = this.frameAcc / this.frames;
        if (avg > 0.03 && this.pr > 1) { this.pr = 1; this.renderer.setPixelRatio(1); this.resize(); this.dustU.uPixelRatio.value = 1; }
        this.frames = 0; this.frameAcc = 0;
      }

      this.sceneT = damp(this.sceneT, this.targetT, 5.5, dt);
      const s = clamp(this.sceneT, 0, STATIONS - 1);

      const ci = Math.floor(s), cf = s - ci;
      this.accent.copy(this.colors[ci]).lerp(this.colors[Math.min(ci + 1, STATIONS - 1)], smoothstep(0.55, 1, cf));
      this.trazoU.uColor.value.copy(this.accent);
      this.postU.uTint.value.copy(this.accent);

      // cámara sobre el riel: paralaje del puntero, balanceo suave e inclinación en las curvas
      const rt = this._railT();
      const f = frameAt(this.rail, rt);
      const kp = 1 - Math.exp(-dt * 3);
      this.par.x += (this.mouse.x * 0.3 - this.par.x) * kp;
      this.par.y += (-this.mouse.y * 0.18 - this.par.y) * kp;
      const sway = this.reduced ? 0 : Math.sin(t * 0.37) * 0.035;
      const pos = f.p.clone().addScaledVector(f.R, this.par.x).addScaledVector(f.U, this.par.y + sway);
      const look = rt < 0.985 ? this.rail.getPointAt(rt + 0.014) : f.p.clone().addScaledVector(f.T, 1.2);
      look.addScaledVector(f.R, this.par.x * 0.4);
      this.camera.position.copy(pos);
      this.camera.lookAt(look);
      if (!this.reduced) {
        const ahead = this.rail.getTangentAt(clamp(rt + 0.02, 0, 1));
        const bank = clamp(ahead.sub(f.T).dot(f.R) * -2.2, -0.14, 0.14);
        this.camera.rotateZ(bank * (this.introActive ? 0 : 1));
        const fov = this.baseFov + this.velN * 5;
        if (Math.abs(fov - this.camera.fov) > 0.05) { this.camera.fov += (fov - this.camera.fov) * 0.1; this.camera.updateProjectionMatrix(); }
      }

      const speed = Math.abs(this.targetT - this.sceneT);
      this.trazoU.uTime.value = t;
      this.trazoU.uFlow.value = 4.5 + this.velN * 14;
      this.trazoU.uDraw.value = this.drawP;
      this.dustU.uTime.value = t;
      this._updateAudio();
      this._updateObjects(t, s);

      const abT = this.abBase + clamp(speed * 0.012 + this.velN * 0.003, 0, 0.0055) + this.abKick;
      this.abKick *= Math.exp(-dt * 4);
      const u = this.postU;
      if (!this.introActive) u.uAberration.value += (abT - u.uAberration.value) * (1 - Math.exp(-dt * 8));
      u.uVel.value += ((this.reduced ? 0 : this.velN) - u.uVel.value) * (1 - Math.exp(-dt * 6));
      u.uShock.value = this.reduced ? -1 : t - this.shockAt;
      u.uTime.value = t;

      this.renderer.setRenderTarget(this.rt);
      this.renderer.render(this.scene, this.camera);
      this._renderPost();
    }
  }

  window.GEGHScene = GEGHScene;
})();
