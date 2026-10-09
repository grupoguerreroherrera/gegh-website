/* =====================================================================
   GEGH · Grupo Empresarial Guerrero Herrera · app.js
   Todo el código de la página. El 3D es WebGL puro, sin librerías:
   tres anillos de metal pulido (diseño, código, multimedia) iluminados
   por tres luces de color. Donde los anillos se cruzan, las luces se
   suman: tres disciplinas, un solo equipo.
   ===================================================================== */
(function () {
'use strict';

const $ = (s, c) => (c || document).querySelector(s);
const $$ = (s, c) => Array.prototype.slice.call((c || document).querySelectorAll(s));
const raiz = document.documentElement;
const limitar = (v, a, b) => Math.min(b, Math.max(a, v));
const suave = (t) => t * t * (3 - 2 * t);
const salidaQuinta = (t) => 1 - Math.pow(1 - t, 5);
const media = (q) => !!(window.matchMedia && window.matchMedia(q).matches);
const quieto = media('(prefers-reduced-motion: reduce)');
const WHATSAPP = '573025280632';

/* =====================================================================
   ÁLGEBRA MÍNIMA (matrices 4x4 en columnas, como las espera WebGL)
   ===================================================================== */
function m4ident() { return new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]); }
function m4mul(a, b) {
  const o = new Float32Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    o[c*4+r] = a[r]*b[c*4] + a[4+r]*b[c*4+1] + a[8+r]*b[c*4+2] + a[12+r]*b[c*4+3];
  }
  return o;
}
function m4persp(fov, asp, n, f) {
  const t = 1 / Math.tan(fov / 2), o = new Float32Array(16);
  o[0] = t / asp; o[5] = t; o[10] = (f + n) / (n - f); o[11] = -1; o[14] = 2 * f * n / (n - f);
  return o;
}
function m4lookAt(e, c, up) {
  let zx = e[0]-c[0], zy = e[1]-c[1], zz = e[2]-c[2]; let l = Math.hypot(zx, zy, zz); zx/=l; zy/=l; zz/=l;
  let xx = up[1]*zz - up[2]*zy, xy = up[2]*zx - up[0]*zz, xz = up[0]*zy - up[1]*zx; l = Math.hypot(xx, xy, xz); xx/=l; xy/=l; xz/=l;
  const yx = zy*xz - zz*xy, yy = zz*xx - zx*xz, yz = zx*xy - zy*xx;
  return new Float32Array([xx, yx, zx, 0, xy, yy, zy, 0, xz, yz, zz, 0,
    -(xx*e[0]+xy*e[1]+xz*e[2]), -(yx*e[0]+yy*e[1]+yz*e[2]), -(zx*e[0]+zy*e[1]+zz*e[2]), 1]);
}
function m4trs(p, r, s) { // traslación · rotaciónZ · rotaciónY · rotaciónX · escala
  const cx = Math.cos(r[0]), sx = Math.sin(r[0]), cy = Math.cos(r[1]), sy = Math.sin(r[1]), cz = Math.cos(r[2]), sz = Math.sin(r[2]);
  const o = new Float32Array(16);
  o[0] = cz*cy*s; o[1] = sz*cy*s; o[2] = -sy*s;
  o[4] = (cz*sy*sx - sz*cx)*s; o[5] = (sz*sy*sx + cz*cx)*s; o[6] = cy*sx*s;
  o[8] = (cz*sy*cx + sz*sx)*s; o[9] = (sz*sy*cx - cz*sx)*s; o[10] = cy*cx*s;
  o[12] = p[0]; o[13] = p[1]; o[14] = p[2]; o[15] = 1;
  return o;
}
function transformar(m, v) { return [m[0]*v[0]+m[4]*v[1]+m[8]*v[2]+m[12], m[1]*v[0]+m[5]*v[1]+m[9]*v[2]+m[13], m[2]*v[0]+m[6]*v[1]+m[10]*v[2]+m[14]]; }

/* =====================================================================
   GEOMETRÍA
   ===================================================================== */
function toro(R, r, nu, nv) {
  const pos = [], nor = [], idx = [];
  for (let i = 0; i <= nu; i++) {
    const u = i / nu * Math.PI * 2, cu = Math.cos(u), su = Math.sin(u);
    for (let j = 0; j <= nv; j++) {
      const v = j / nv * Math.PI * 2, cv = Math.cos(v), sv = Math.sin(v);
      pos.push((R + r*cv)*cu, (R + r*cv)*su, r*sv);
      nor.push(cv*cu, cv*su, sv);
    }
  }
  for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
    const a = i*(nv+1)+j, b = a+nv+1;
    idx.push(a, b, a+1, b, b+1, a+1);
  }
  return { pos: new Float32Array(pos), nor: new Float32Array(nor), idx: new Uint16Array(idx) };
}

/* =====================================================================
   SHADERS
   ===================================================================== */
const VS_ANILLO = `
attribute vec3 aPos; attribute vec3 aNor;
uniform mat4 uProj, uView, uModel;
varying vec3 vPos, vNor;
void main(){ vec4 w = uModel*vec4(aPos,1.0); vPos = w.xyz; vNor = normalize(mat3(uModel)*aNor); gl_Position = uProj*uView*w; }`;

const FS_ANILLO = `
precision highp float;
uniform vec3 uCam; uniform vec3 uLuzPos[3]; uniform vec3 uLuzCol[3];
uniform vec3 uBase; uniform float uRugo; uniform float uBrillo; /* uBrillo>0: pasada de resplandor */
uniform float uTiempo;
varying vec3 vPos, vNor;
/* entorno de estudio: fondo oscuro con dos softbox y un rebote de piso */
vec3 entorno(vec3 r){
  float arriba = r.y*0.5+0.5;
  vec3 base = mix(vec3(0.015,0.017,0.024), vec3(0.09,0.10,0.14), arriba);
  float s1 = smoothstep(0.80, 0.985, dot(r, normalize(vec3(-0.55, 0.75, 0.45))));
  float s2 = smoothstep(0.88, 0.995, dot(r, normalize(vec3(0.75, 0.25, -0.35))));
  float s3 = smoothstep(0.55, 0.92, dot(r, normalize(vec3(0.0, -1.0, 0.25))))*0.12;
  float s4 = smoothstep(0.93, 0.999, dot(r, normalize(vec3(0.1, 0.9, -0.9))))*0.6;
  return base + vec3(1.0,0.985,0.96)*s1*1.05 + vec3(0.88,0.93,1.0)*s2*0.75 + vec3(s3) + vec3(s4)*0.6;
}
void main(){
  vec3 N = normalize(vNor); vec3 V = normalize(uCam - vPos); vec3 R = reflect(-V, N);
  float NdV = max(dot(N, V), 0.0);
  vec3 F = uBase + (1.0 - uBase)*pow(1.0 - NdV, 5.0);
  vec3 col = entorno(R)*F;
  float a = uRugo*uRugo, a2 = a*a;
  for (int i = 0; i < 3; i++) {
    vec3 L = uLuzPos[i] - vPos; float d2 = dot(L, L); L = normalize(L);
    vec3 H = normalize(L + V); float NdH = max(dot(N, H), 0.0); float NdL = max(dot(N, L), 0.0);
    float den = NdH*NdH*(a2 - 1.0) + 1.0; float D = a2/(3.14159*den*den);
    float dif = NdL*0.14;
    col += uLuzCol[i]*(D*NdL*F*1.1 + dif)*(9.0/(1.0 + d2));
  }
  col = col/(col + 0.9);
  col = pow(col, vec3(1.0/2.2));
  if (uBrillo > 0.0) { col = max(col - vec3(0.6), 0.0)*uBrillo; }
  gl_FragColor = vec4(col, 1.0);
}`;

const VS_PUNTOS = `
attribute vec3 aPos; attribute float aSem;
uniform mat4 uProj, uView; uniform float uTiempo, uTam;
varying float vA;
void main(){
  vec3 p = aPos;
  p.y += sin(uTiempo*0.25 + aSem*6.28)*0.18;
  p.x += cos(uTiempo*0.18 + aSem*9.0)*0.14;
  vec4 e = uView*vec4(p, 1.0);
  gl_Position = uProj*e;
  float d = -e.z;
  gl_PointSize = uTam*(0.9 + aSem*1.6)/d;
  vA = (0.35 + 0.65*fract(aSem*7.31))*smoothstep(18.0, 6.0, d);
}`;

const FS_PUNTOS = `
precision mediump float;
varying float vA;
void main(){
  vec2 c = gl_PointCoord - 0.5; float d = dot(c, c);
  float a = smoothstep(0.25, 0.0, d)*vA;
  gl_FragColor = vec4(vec3(0.86, 0.9, 1.0)*a, a);
}`;

const VS_CUADRO = `attribute vec2 aPos; varying vec2 vUv; void main(){ vUv = aPos*0.5+0.5; gl_Position = vec4(aPos, 0.0, 1.0); }`;
const FS_DESENFOQUE = `
precision mediump float;
uniform sampler2D uTex; uniform vec2 uDir;
varying vec2 vUv;
void main(){
  vec4 s = texture2D(uTex, vUv)*0.227;
  s += (texture2D(uTex, vUv + uDir*1.0) + texture2D(uTex, vUv - uDir*1.0))*0.195;
  s += (texture2D(uTex, vUv + uDir*2.0) + texture2D(uTex, vUv - uDir*2.0))*0.122;
  s += (texture2D(uTex, vUv + uDir*3.0) + texture2D(uTex, vUv - uDir*3.0))*0.054;
  s += (texture2D(uTex, vUv + uDir*4.0) + texture2D(uTex, vUv - uDir*4.0))*0.016;
  gl_FragColor = s;
}`;
const FS_SUMA = `
precision mediump float;
uniform sampler2D uTex; uniform float uFuerza;
varying vec2 vUv;
void main(){ gl_FragColor = vec4(texture2D(uTex, vUv).rgb*uFuerza, 1.0); }`;

/* =====================================================================
   ESCENA
   ===================================================================== */
function crearEscena(canvas) {
  const gl = canvas.getContext('webgl', { antialias: true, alpha: false, depth: true, stencil: false, powerPreference: 'high-performance', preserveDrawingBuffer: false })
          || canvas.getContext('experimental-webgl', { antialias: true, alpha: false });
  if (!gl) return null;

  function programa(vs, fs) {
    const p = gl.createProgram();
    [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]].forEach(([tipo, src]) => {
      const s = gl.createShader(tipo); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error('Shader: ' + gl.getShaderInfoLog(s));
      gl.attachShader(p, s);
    });
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('Programa: ' + gl.getProgramInfoLog(p));
    const u = {}, a = {};
    const nu = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < nu; i++) { const inf = gl.getActiveUniform(p, i); const nombre = inf.name.replace('[0]', ''); u[nombre] = gl.getUniformLocation(p, inf.name); }
    const na = gl.getProgramParameter(p, gl.ACTIVE_ATTRIBUTES);
    for (let i = 0; i < na; i++) { const inf = gl.getActiveAttrib(p, i); a[inf.name] = gl.getAttribLocation(p, inf.name); }
    return { p, u, a };
  }
  function buffer(datos, tipo) { const b = gl.createBuffer(); gl.bindBuffer(tipo || gl.ARRAY_BUFFER, b); gl.bufferData(tipo || gl.ARRAY_BUFFER, datos, gl.STATIC_DRAW); return b; }

  const prAnillo = programa(VS_ANILLO, FS_ANILLO);
  const prPuntos = programa(VS_PUNTOS, FS_PUNTOS);
  const prBlur = programa(VS_CUADRO, FS_DESENFOQUE);
  const prSuma = programa(VS_CUADRO, FS_SUMA);

  /* anillos: uno solo en memoria; se dibuja tres veces con distinta matriz */
  const movil = Math.min(window.innerWidth, window.innerHeight) < 700;
  const geo = toro(1.0, 0.085, movil ? 110 : 180, movil ? 20 : 34);
  const bPos = buffer(geo.pos), bNor = buffer(geo.nor), bIdx = buffer(geo.idx, gl.ELEMENT_ARRAY_BUFFER);

  /* polvo en suspensión */
  const N_PUNTOS = movil ? 260 : 520;
  const puntos = new Float32Array(N_PUNTOS*3), semillas = new Float32Array(N_PUNTOS);
  for (let i = 0; i < N_PUNTOS; i++) { puntos[i*3] = (Math.random()-0.5)*14; puntos[i*3+1] = (Math.random()-0.5)*9; puntos[i*3+2] = (Math.random()-0.5)*10 - 2; semillas[i] = Math.random(); }
  const bPuntos = buffer(puntos), bSem = buffer(semillas);
  const bCuadro = buffer(new Float32Array([-1,-1, 1,-1, -1,1, 1,1]));

  /* texturas para el resplandor (a media resolución) */
  function objetivo(w, h) {
    const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fb = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    const rb = gl.createRenderbuffer(); gl.bindRenderbuffer(gl.RENDERBUFFER, rb);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, w, h);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, rb);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { tex, fb, rb, w, h };
  }
  let objA = null, objB = null, resplandor = !movil && !quieto;

  const estado = {
    dpr: 1, w: 1, h: 1, asp: 1,
    cam: [0, 0, 7.6], mira: [0, 0, 0],
    anillos: [ { pos: [0,0,0], rot: [0,0,0], esc: 1 }, { pos: [0,0,0], rot: [0,0,0], esc: 1 }, { pos: [0,0,0], rot: [0,0,0], esc: 1 } ],
    grupo: { pos: [0,0,0], rot: [0,0,0], esc: 1 },
    luces: [ [1.0, 0.33, 0.42], [0.42, 1.0, 0.56], [0.40, 0.60, 1.0] ],
    fuerza: 0.9, tiempo: 0
  };
  const BASE = [0.90, 0.91, 0.94];

  function medir() {
    const dprMax = movil ? 1.5 : 1.75;
    estado.dpr = Math.min(window.devicePixelRatio || 1, dprMax)*estado.calidad;
    estado.w = Math.max(1, Math.round(window.innerWidth*estado.dpr)); estado.h = Math.max(1, Math.round(window.innerHeight*estado.dpr));
    estado.asp = estado.w/estado.h;
    if (canvas.width !== estado.w || canvas.height !== estado.h) { canvas.width = estado.w; canvas.height = estado.h; }
    if (resplandor) {
      const w = Math.max(2, estado.w >> 1), h = Math.max(2, estado.h >> 1);
      [objA, objB].forEach((o) => { if (o) { gl.deleteTexture(o.tex); gl.deleteFramebuffer(o.fb); gl.deleteRenderbuffer(o.rb); } });
      objA = objetivo(w, h); objB = objetivo(w, h);
    }
  }
  estado.calidad = 1;

  function dibujarAnillos(proj, view, brillo) {
    gl.useProgram(prAnillo.p);
    gl.uniformMatrix4fv(prAnillo.u.uProj, false, proj); gl.uniformMatrix4fv(prAnillo.u.uView, false, view);
    gl.uniform3fv(prAnillo.u.uCam, estado.cam);
    gl.uniform3fv(prAnillo.u.uBase, BASE); gl.uniform1f(prAnillo.u.uRugo, 0.32); gl.uniform1f(prAnillo.u.uBrillo, brillo); gl.uniform1f(prAnillo.u.uTiempo, estado.tiempo);
    gl.uniform3fv(prAnillo.u.uLuzPos, estado.luzPos); gl.uniform3fv(prAnillo.u.uLuzCol, estado.luzCol);
    gl.bindBuffer(gl.ARRAY_BUFFER, bPos); gl.enableVertexAttribArray(prAnillo.a.aPos); gl.vertexAttribPointer(prAnillo.a.aPos, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, bNor); gl.enableVertexAttribArray(prAnillo.a.aNor); gl.vertexAttribPointer(prAnillo.a.aNor, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, bIdx);
    for (let i = 0; i < 3; i++) {
      const L = estado.luces[i], k = 0.22;
      gl.uniform3f(prAnillo.u.uBase, BASE[0]*(1-k) + L[0]*k, BASE[1]*(1-k) + L[1]*k, BASE[2]*(1-k) + L[2]*k);
      gl.uniformMatrix4fv(prAnillo.u.uModel, false, estado.modelos[i]); gl.drawElements(gl.TRIANGLES, geo.idx.length, gl.UNSIGNED_SHORT, 0);
    }
    gl.disableVertexAttribArray(prAnillo.a.aPos); gl.disableVertexAttribArray(prAnillo.a.aNor);
  }
  function cuadro(pr) {
    gl.bindBuffer(gl.ARRAY_BUFFER, bCuadro); gl.enableVertexAttribArray(pr.a.aPos); gl.vertexAttribPointer(pr.a.aPos, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); gl.disableVertexAttribArray(pr.a.aPos);
  }

  function dibujar() {
    const e = estado;
    /* matrices de los anillos y posición de sus luces (en el centro de cada anillo, un poco hacia la cámara) */
    const mg = m4trs(e.grupo.pos, e.grupo.rot, e.grupo.esc);
    e.modelos = []; e.luzPos = new Float32Array(9); e.luzCol = new Float32Array(9);
    for (let i = 0; i < 3; i++) {
      const a = e.anillos[i], m = m4mul(mg, m4trs(a.pos, a.rot, a.esc));
      e.modelos.push(m);
      const c = transformar(m, [0, 0, 0.45]);
      e.luzPos[i*3] = c[0]; e.luzPos[i*3+1] = c[1]; e.luzPos[i*3+2] = c[2];
      e.luzCol[i*3] = e.luces[i][0]*e.luzFuerza; e.luzCol[i*3+1] = e.luces[i][1]*e.luzFuerza; e.luzCol[i*3+2] = e.luces[i][2]*e.luzFuerza;
    }
    const proj = m4persp(0.52, e.asp, 0.5, 40), view = m4lookAt(e.cam, e.mira, [0, 1, 0]);

    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK); gl.disable(gl.BLEND);

    /* 1) pasada de brillo a media resolución */
    if (resplandor && objA) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, objA.fb); gl.viewport(0, 0, objA.w, objA.h);
      gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      dibujarAnillos(proj, view, 1.35);
      gl.disable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE);
      gl.useProgram(prBlur.p); gl.activeTexture(gl.TEXTURE0); gl.uniform1i(prBlur.u.uTex, 0);
      for (let k = 0; k < 3; k++) {
        const paso = 1.5 + k*1.6;
        gl.bindFramebuffer(gl.FRAMEBUFFER, objB.fb); gl.bindTexture(gl.TEXTURE_2D, objA.tex); gl.uniform2f(prBlur.u.uDir, paso/objA.w, 0); cuadro(prBlur);
        gl.bindFramebuffer(gl.FRAMEBUFFER, objA.fb); gl.bindTexture(gl.TEXTURE_2D, objB.tex); gl.uniform2f(prBlur.u.uDir, 0, paso/objA.h); cuadro(prBlur);
      }
      gl.enable(gl.DEPTH_TEST); gl.enable(gl.CULL_FACE);
    }

    /* 2) escena principal */
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, e.w, e.h);
    gl.clearColor(0.039, 0.047, 0.071, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    dibujarAnillos(proj, view, 0);

    /* polvo: aditivo, detrás de los anillos */
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE); gl.depthMask(false); gl.disable(gl.CULL_FACE);
    gl.useProgram(prPuntos.p);
    gl.uniformMatrix4fv(prPuntos.u.uProj, false, proj); gl.uniformMatrix4fv(prPuntos.u.uView, false, view);
    gl.uniform1f(prPuntos.u.uTiempo, e.tiempo); gl.uniform1f(prPuntos.u.uTam, 26*e.dpr);
    gl.bindBuffer(gl.ARRAY_BUFFER, bPuntos); gl.enableVertexAttribArray(prPuntos.a.aPos); gl.vertexAttribPointer(prPuntos.a.aPos, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, bSem); gl.enableVertexAttribArray(prPuntos.a.aSem); gl.vertexAttribPointer(prPuntos.a.aSem, 1, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.POINTS, 0, N_PUNTOS);
    gl.disableVertexAttribArray(prPuntos.a.aPos); gl.disableVertexAttribArray(prPuntos.a.aSem);

    /* 3) resplandor sumado encima */
    if (resplandor && objA) {
      gl.disable(gl.DEPTH_TEST);
      gl.useProgram(prSuma.p); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, objA.tex);
      gl.uniform1i(prSuma.u.uTex, 0); gl.uniform1f(prSuma.u.uFuerza, e.fuerza);
      cuadro(prSuma);
      gl.enable(gl.DEPTH_TEST);
    }
    gl.depthMask(true); gl.disable(gl.BLEND);
  }

  function bajarCalidad() {
    if (resplandor) { resplandor = false; medir(); return true; }
    if (estado.calidad > 0.7) { estado.calidad = 0.7; medir(); return true; }
    return false;
  }

  estado.luzFuerza = 1;
  medir();
  return { gl, estado, medir, dibujar, bajarCalidad, get resplandor() { return resplandor; } };
}

/* =====================================================================
   COREOGRAFÍA · un estado por sección; se interpola con el scroll
   ===================================================================== */
const SECCIONES = ['inicio', 'manifiesto', 'servicios', 'proceso', 'planes', 'contacto'];

function estados(ancho) {
  const estrecho = ancho < 900;
  return [
    /* 0 · portada: el nudo de tres anillos, a la derecha del titular (arriba del titular en el celular) */
    { grupo: { pos: estrecho ? [0, 1.25, 0] : [1.6, 0.12, 0], rot: [0.1, 0, 0], esc: estrecho ? 0.46 : 1.0 }, giro: 1.0, ejes: [1, 1, 1], luz: 1.0, fuerza: 0.85,
      anillos: [ { pos: [0,0,0], rot: [0.35, 0.65, 0.1], esc: 1 }, { pos: [0,0,0], rot: [1.62, 0.45, 0.35], esc: 1 }, { pos: [0,0,0], rot: [0.95, -1.05, 0.6], esc: 1 } ] },
    /* 1 · manifiesto: tres círculos que se cruzan; donde se cruzan, las luces se suman */
    { grupo: { pos: estrecho ? [0, 1.3, 0] : [1.75, 0.45, 0], rot: [0, 0, 0], esc: estrecho ? 0.42 : 0.62 }, giro: 0.35, ejes: [0.35, 0.35, 0], luz: 1.3, fuerza: 0.9,
      anillos: [ { pos: [-0.62, -0.1, 0], rot: [0.2, -0.3, 0], esc: 1 }, { pos: [0, 0.42, 0.05], rot: [0.25, 0, 0], esc: 1 }, { pos: [0.62, -0.1, 0], rot: [0.2, 0.3, 0], esc: 1 } ] },
    /* 2 · servicios: cada anillo sobre su columna, girando como una moneda */
    { grupo: { pos: [0, estrecho ? 1.35 : 1.2, 0], rot: [0, 0, 0], esc: estrecho ? 0.28 : 0.46 }, giro: 0.9, ejes: [0, 1, 0], luz: 1.15, fuerza: 0.85,
      anillos: [ { pos: [estrecho ? -1.7 : -3.6, 0, 0], rot: [0.3, 0, 0], esc: 1 }, { pos: [0, 0, 0], rot: [0.3, 0, 0], esc: 1 }, { pos: [estrecho ? 1.7 : 3.6, 0, 0], rot: [0.3, 0, 0], esc: 1 } ] },
    /* 3 · proceso: anillos concéntricos en un mismo plano, un solo centro */
    { grupo: { pos: estrecho ? [0, 1.35, 0] : [1.45, 1.12, 0], rot: [0.95, 0, 0], esc: estrecho ? 0.46 : 0.55 }, giro: 0.6, ejes: [0, 0, 1], luz: 0.9, fuerza: 0.8,
      anillos: [ { pos: [0,0,0], rot: [0, 0, 0], esc: 0.52 }, { pos: [0,0,0], rot: [0, 0, 0], esc: 0.76 }, { pos: [0,0,0], rot: [0, 0, 0], esc: 1.0 } ] },
    /* 4 · planes: esfera armilar, tres planos ortogonales */
    { grupo: { pos: estrecho ? [0, 1.35, 0] : [1.45, 1.12, 0], rot: [0.3, 0, 0], esc: estrecho ? 0.42 : 0.5 }, giro: 0.7, ejes: [1, 1, 1], luz: 1.0, fuerza: 0.85,
      anillos: [ { pos: [0,0,0], rot: [0, 0, 0], esc: 1 }, { pos: [0,0,0], rot: [1.5708, 0, 0], esc: 1 }, { pos: [0,0,0], rot: [0, 1.5708, 0], esc: 1 } ] },
    /* 5 · contacto: los tres anillos coinciden en uno; las tres luces se vuelven una luz blanca */
    { grupo: { pos: estrecho ? [0, 1.35, 0] : [0.2, 1.1, 0], rot: [0.55, 0, 0], esc: estrecho ? 0.46 : 0.52 }, giro: 0.4, ejes: [0, 0, 1], luz: 1.4, fuerza: 0.95,
      anillos: [ { pos: [0,0,0], rot: [0, 0, 0], esc: 1 }, { pos: [0,0,0], rot: [0, 0, 0], esc: 1 }, { pos: [0,0,0], rot: [0, 0, 0], esc: 1 } ] }
  ];
}
/* antes de entrar: los anillos están lejos y desordenados; al entrar se ensamblan */
const INTRO = { grupo: { pos: [0, 0, -3], rot: [0.6, 0.8, 0], esc: 1.2 }, giro: 0, ejes: [1, 1, 1], luz: 0.2, fuerza: 0.4,
  anillos: [ { pos: [-3.2, 1.6, -1], rot: [1.2, 2.1, 0.4], esc: 0.8 }, { pos: [2.8, -2.2, 0.5], rot: [-0.8, 0.5, 1.9], esc: 0.8 }, { pos: [0.5, 3.0, -2], rot: [2.4, -1.1, 0.2], esc: 0.8 } ] };

const lerp = (a, b, t) => a + (b - a)*t;
const lerp3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
function mezclarEstado(A, B, t) {
  return {
    grupo: { pos: lerp3(A.grupo.pos, B.grupo.pos, t), rot: lerp3(A.grupo.rot, B.grupo.rot, t), esc: lerp(A.grupo.esc, B.grupo.esc, t) },
    giro: lerp(A.giro, B.giro, t), ejes: lerp3(A.ejes, B.ejes, t), luz: lerp(A.luz, B.luz, t), fuerza: lerp(A.fuerza, B.fuerza, t),
    anillos: A.anillos.map((a, i) => ({ pos: lerp3(a.pos, B.anillos[i].pos, t), rot: lerp3(a.rot, B.anillos[i].rot, t), esc: lerp(a.esc, B.anillos[i].esc, t) }))
  };
}

/* =====================================================================
   PÁGINA
   ===================================================================== */
try {
  raiz.classList.add('cargando'); // sin scroll mientras se ve la pantalla de carga
  const calidadFija = /[?&]fijo\b/.test(location.search); // ?fijo: no baja la calidad aunque el equipo vaya lento
  const canvas = $('#escena');
  let escena = null;
  try { escena = crearEscena(canvas); } catch (e) { escena = null; if (window.console) console.warn('3D desactivado:', e && e.message); }
  if (!escena) raiz.classList.add('sin-webgl');

  /* ---------- carga ---------- */
  const carga = $('#carga'), cargaNum = $('#cargaNum');
  let cargaP = 0, cargaObj = 0.35, cargaLista = false, entro = false, reloj = performance.now();
  const fuentes = (document.fonts && document.fonts.ready) ? document.fonts.ready : Promise.resolve();
  fuentes.then(() => { cargaObj = Math.max(cargaObj, 0.8); });
  if (document.readyState === 'complete') cargaObj = 1; else window.addEventListener('load', () => { cargaObj = 1; });
  setTimeout(() => { cargaObj = 1; }, 2600);

  function entrar() {
    if (entro) return; entro = true;
    carga.classList.add('se-va'); raiz.classList.remove('cargando');
    setTimeout(() => { carga.hidden = true; }, 900);
    raiz.classList.add('lista');
    t0Intro = performance.now();
    contar();
  }

  /* ---------- contadores de la portada (tres disciplinas, cinco fases, cuatro idiomas) ---------- */
  function contar() {
    $$('[data-cuenta]').forEach((el) => {
      const fin = +el.dataset.cuenta, t0 = performance.now(), dur = 1400 + Math.random()*500;
      const paso = () => {
        const t = limitar((performance.now() - t0)/dur, 0, 1);
        el.textContent = String(Math.round(fin*salidaQuinta(t)));
        if (t < 1 && !quieto) requestAnimationFrame(paso); else el.textContent = String(fin);
      };
      if (quieto) el.textContent = String(fin); else paso();
    });
  }

  /* ---------- reloj local de Bucaramanga ---------- */
  const relojEl = $('#relojLocal');
  function hora() {
    if (!relojEl) return;
    try { relojEl.textContent = new Intl.DateTimeFormat('es-CO', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Bogota' }).format(new Date()); }
    catch (e) { relojEl.textContent = ''; }
  }
  hora(); setInterval(hora, 15000);

  /* ---------- barra y navegación ---------- */
  const barra = $('#barra'), menu = $('#menu'), botonMenu = $('#abrirMenu');
  function pintarBarra() { barra.classList.toggle('es-solida', window.scrollY > 40); }
  function cerrarMenu() { menu.hidden = true; botonMenu.setAttribute('aria-expanded', 'false'); raiz.classList.remove('con-menu'); }
  if (botonMenu && menu) {
    botonMenu.addEventListener('click', () => { const abrir = menu.hidden; if (!abrir) { cerrarMenu(); return; } menu.hidden = false; botonMenu.setAttribute('aria-expanded', 'true'); raiz.classList.add('con-menu'); const c = $('#cerrarMenu'); if (c && c.focus) c.focus(); });
    const cerrar = $('#cerrarMenu'); if (cerrar) cerrar.addEventListener('click', () => { cerrarMenu(); botonMenu.focus(); });
    $$('a', menu).forEach((a) => a.addEventListener('click', cerrarMenu));
    document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && !menu.hidden) { cerrarMenu(); botonMenu.focus(); } });
  }
  document.addEventListener('click', (ev) => {
    const a = ev.target.closest ? ev.target.closest('a[href^="#"]') : null;
    if (!a) return;
    const id = a.getAttribute('href').slice(1); if (!id) return;
    const el = document.getElementById(id); if (!el) return;
    ev.preventDefault();
    const top = el.getBoundingClientRect().top + window.scrollY - (id === 'inicio' ? 0 : 64);
    window.scrollTo({ top: Math.max(0, top), behavior: quieto ? 'auto' : 'smooth' });
    if (history.replaceState) history.replaceState(null, '', '#' + id);
  });

  /* ---------- servicio elegido desde "Cotizar" y formulario → WhatsApp ---------- */
  const formato = $('#formato'), estadoF = $('#formatoEstado');
  $$('[data-necesidad]').forEach((a) => a.addEventListener('click', () => {
    const sel = formato && formato.elements.necesidad; if (sel) sel.value = a.dataset.necesidad;
  }));
  if (formato) formato.addEventListener('submit', (ev) => {
    ev.preventDefault();
    if (formato.checkValidity && !formato.checkValidity()) { if (formato.reportValidity) formato.reportValidity(); return; }
    const d = new FormData(formato);
    const nombre = (d.get('nombre') || '').trim(), empresa = (d.get('empresa') || '').trim(), necesidad = d.get('necesidad') || '', detalle = (d.get('detalle') || '').trim();
    const mensaje = 'Hola, vengo de grupoguerreroherrera.com y quiero agendar el diagnóstico de 30 minutos.\n\n' +
      '*Nombre:* ' + nombre + '\n' + (empresa ? '*Empresa o proyecto:* ' + empresa + '\n' : '') +
      '*Necesito:* ' + necesidad + '\n' + (detalle ? '*Detalle:* ' + detalle + '\n' : '') + '\nQuedo atento(a).';
    const url = 'https://wa.me/' + WHATSAPP + '?text=' + encodeURIComponent(mensaje);
    const ventana = window.open(url, '_blank');
    if (ventana) { try { ventana.opener = null; } catch (e) { /* sin acceso */ } }
    estadoF.hidden = false; estadoF.textContent = 'Tu mensaje quedó listo en WhatsApp. ';
    const enlace = document.createElement('a'); enlace.href = url; enlace.target = '_blank'; enlace.rel = 'noopener';
    enlace.textContent = ventana ? 'Si no se abrió, ábrelo aquí.' : 'Toca aquí para abrirlo.';
    estadoF.appendChild(enlace);
  });

  /* ---------- scroll → progreso entre secciones ---------- */
  const seccionEls = SECCIONES.map((id) => document.getElementById(id));
  let tops = [];
  function medirTops() { tops = seccionEls.map((el) => el ? el.getBoundingClientRect().top + window.scrollY : 0); }
  function progreso() {
    /* el estado de una sección se mantiene puro mientras se lee; la transición a la siguiente
       ocurre mientras el inicio de la siguiente sube desde el borde inferior hasta el 40% de la pantalla */
    const vh = window.innerHeight, y = window.scrollY;
    let k = 0;
    for (let i = 0; i < tops.length; i++) if (tops[i] - y <= vh*0.4) k = i;
    if (k >= tops.length - 1) return k;
    const ySig = tops[k+1] - y;
    const t = limitar((vh - ySig)/(vh*0.6), 0, 1);
    return k + suave(t);
  }

  /* ---------- paralaje con el mouse ---------- */
  let objX = 0, objY = 0, curX = 0, curY = 0;
  window.addEventListener('pointermove', (ev) => { if (ev.pointerType === 'touch') return; objX = ev.clientX/window.innerWidth*2 - 1; objY = ev.clientY/window.innerHeight*2 - 1; }, { passive: true });

  /* ---------- bucle ---------- */
  let t0Intro = 0, ESTADOS = estados(window.innerWidth), ultimo = performance.now(), muestras = [], evaluado = false;
  function alCambiarTam() { ESTADOS = estados(window.innerWidth); if (escena) escena.medir(); medirTops(); }
  window.addEventListener('resize', alCambiarTam);
  window.addEventListener('orientationchange', () => setTimeout(alCambiarTam, 300));

  function cuadro(ahora) {
    requestAnimationFrame(cuadro);
    const dt = Math.min(0.05, (ahora - ultimo)/1000); ultimo = ahora;

    if (!cargaLista) {
      cargaP = quieto ? cargaObj : Math.min(cargaObj, cargaP + dt*0.55);
      if (cargaNum) cargaNum.textContent = String(Math.round(cargaP*100)).padStart(3, '0');
      carga.style.setProperty('--p', cargaP);
      if (cargaP >= 1) { cargaLista = true; setTimeout(entrar, 250); }
    }
    pintarBarra();
    if (!escena || document.hidden) return;

    const e = escena.estado;
    e.tiempo += dt;
    curX = lerp(curX, objX, 0.05); curY = lerp(curY, objY, 0.05);

    /* estado objetivo según el scroll */
    const p = progreso(), k = Math.floor(p), f = p - k;
    let obj = (k >= ESTADOS.length - 1) ? ESTADOS[ESTADOS.length - 1] : mezclarEstado(ESTADOS[k], ESTADOS[k+1], f);
    /* intro de ensamblaje */
    const ti = entro ? limitar((ahora - t0Intro)/1900, 0, 1) : 0;
    if (ti < 1) obj = mezclarEstado(INTRO, obj, quieto ? 1 : salidaQuinta(ti));

    /* giro continuo propio de cada anillo (se suma al estado) */
    const g = quieto ? 0 : obj.giro*e.tiempo;
    const ej = obj.ejes;
    const giros = [[g*0.21*ej[0], g*0.33*ej[1], g*0.12*ej[2]], [g*0.27*ej[0], -g*0.19*ej[1], g*0.3*ej[2]], [-g*0.15*ej[0], g*0.25*ej[1], -g*0.22*ej[2]]];
    const grupoRot = [obj.grupo.rot[0] + curY*0.14, obj.grupo.rot[1] + curX*0.22, obj.grupo.rot[2]];
    e.grupo = { pos: obj.grupo.pos, rot: grupoRot, esc: obj.grupo.esc };
    e.anillos = obj.anillos.map((a, i) => ({ pos: a.pos, rot: [a.rot[0] + giros[i][0], a.rot[1] + giros[i][1], a.rot[2] + giros[i][2]], esc: a.esc }));
    e.luzFuerza = obj.luz; e.fuerza = obj.fuerza;
    e.cam = [curX*0.25, 0.1 - curY*0.15, 7.6]; e.mira = [0, 0, 0];

    escena.dibujar();

    /* calidad: si el equipo no da, se apaga el resplandor y baja la resolución */
    if (!evaluado && entro && !calidadFija) {
      muestras.push(dt);
      if (muestras.length >= 90) {
        const prom = muestras.reduce((s, v) => s + v, 0)/muestras.length;
        if (prom > 0.024) { if (escena.bajarCalidad()) { muestras = []; return; } }
        evaluado = true;
      }
    }
  }
  medirTops();
  if (escena) escena.medir();
  requestAnimationFrame(cuadro);
  setTimeout(medirTops, 1200);
  fuentes.then(() => setTimeout(medirTops, 300));

  document.addEventListener('visibilitychange', () => { ultimo = performance.now(); });
  const anio = $('#anio'); if (anio) anio.textContent = String(new Date().getFullYear());

} catch (error) {
  document.documentElement.classList.remove('cargando');
  const tapa = document.getElementById('carga'); if (tapa) tapa.style.display = 'none';
  if (window.console) console.error(error);
}
})();
