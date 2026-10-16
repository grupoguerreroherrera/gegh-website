# GEGH — Un solo trazo (v7)

Sitio de **Grupo Empresarial Guerrero Herrera S.A.S.** · [grupoguerreroherrera.com](https://www.grupoguerreroherrera.com/) · Bucaramanga.

Página estática, sin build ni npm. El dominio apunta a **Vercel**, que publica automáticamente lo que haya en la rama `main` del repositorio de GitHub: reemplaza los archivos del repositorio por los de esta carpeta (incluidos `vercel.json`, `.well-known/`, `.github/` y `.gitignore`), haz commit en `main` y Vercel despliega en un minuto. El archivo `vercel.json` es el que pone las cabeceras de seguridad; sin él, el sitio funciona igual pero sin esa capa.

## Concepto

Una línea luminosa (el trazo) recorre el espacio y el scroll empuja la cámara de capítulo en capítulo. En cada estación el trazo se convierte en algo:

| Capítulo | Objeto (render de Firefly, assets/img) |
|---|---|
| 00 Inicio | trazo de vidrio oscuro |
| 01 Manifiesto | tres hebras de vidrio trenzadas |
| 02 Diseño | cinta de vidrio violeta |
| 03 Software | cubo de cubos con luz cian |
| 04 Multimedia | onda de ámbar líquido (late con la música) |
| 05 Aprendizaje | plataformas de vidrio apiladas con luz menta |
| 06 Proceso | cinco esferas de vidrio |
| 07 Colaboración | tres cristales (el central, violeta) |
| 08 Contacto | cordillera de vidrio con un punto de luz |

Los objetos son renders (PNG de Firefly limpiados y convertidos a WebP, ~290 KB en total). En la escena tienen volumen (la silueta del render se infla en una malla, así al girar muestran profundidad, sombreado y borde), giran con el scroll, acompañan a la cámara mientras se lee el capítulo y se desvanecen al cambiar de capítulo; se inclinan con el puntero, un destello de luz los recorre cada pocos segundos, el color del capítulo se refleja en ellos y la niebla los funde con el fondo. Post: bloom HDR y tone mapping ACES.

Para cambiar un objeto: reemplaza el archivo en `assets/img/` (1024×1024, fondo negro puro) y, si hace falta, ajusta su posición en el arreglo `OBJECTS` al inicio de `scene.js` (adelante, lado, arriba, tamaño; valores distintos para escritorio `d` y móvil `m`). Las imágenes se guardan en caché una semana (`vercel.json`): si reemplazas una con el mismo nombre, los visitantes recientes pueden ver la anterior hasta siete días; cámbiale el nombre si quieres que se vea al instante.

Cada objeto se materializa: al llegar a su capítulo, miles de partículas de luz muestreadas del propio render se reúnen hasta formarlo, y al irse se disuelven (reversible con el scroll). Los títulos entran palabra por palabra; los botones son magnéticos; al tocar un objeto con el puntero suena una campana de vidrio.

En escritorio el scroll tiene inercia propia (la rueda mueve un objetivo y la página lo sigue con amortiguación); los textos de cada capítulo suben despacio y se despiden al final; al entrar en un capítulo hay una onda de choque sutil en la imagen; el puntero atrae a los objetos y los enciende.

La música es generativa (Web Audio, sin archivos): un acorde por capítulo en re menor, viento ligado a la velocidad del scroll, campanas ocasionales. Se activa con "Entrar con sonido" o con el botón **Sonido** de la barra.

## Archivos

```
index.html                 contenido, estilos, metadatos (SEO, Open Graph, JSON-LD)
vercel.json                cabeceras de seguridad y caché (las aplica Vercel)
assets/js/util.js          interpolación, easing, flags de dispositivo
assets/js/audio.js         partitura generativa
assets/js/scene.js         escena 3D (Three.js r128): riel, trazo, piezas por capítulo, post-proceso
assets/js/app.js           compuerta, scroll → riel, revelados, sonido, cursor, reloj, menú
assets/js/three.r128.min.js
assets/fonts/              tipografías propias (WOFF2, licencia OFL en LICENCIAS-OFL.txt)
assets/img/                objetos por capítulo
assets/favicon.svg · assets/og.png · robots.txt · sitemap.xml · google*.html
.well-known/security.txt   contacto para reportes de seguridad (RFC 9116)
SECURITY.md                política de seguridad (GitHub la muestra en la pestaña Security)
scripts/verificar.py       verificación previa a publicar (la corre GitHub Actions)
.github/workflows/         verificación automática en cada cambio
```

## Dónde tocar

- **Textos**: `index.html`, por capítulos (`#hero`, `#manifiesto`, `#servicios`, `#software`, `#multimedia`, `#proceso`, `#colaboracion`, `#contacto`).
- **WhatsApp**: busca `573025280632`; cada botón lleva un mensaje prellenado distinto.
- **Colores y tipografías**: variables al inicio del `<style>` (`--ink`, `--bone`, `--violeta`, `--cian`, `--ambar`, `--font-*`). Las tipografías se sirven desde `assets/fonts` (sin Google Fonts): para cambiar una, añade su WOFF2 ahí y su `@font-face` junto a los demás.
- **Música**: `audio.js`, arreglo `CHORDS` (un acorde por capítulo, notas MIDI).
- **Escena**: `scene.js`. Las estaciones están en `_buildPath` (puntos del riel); cada pieza en su `_build…`. En móvil las piezas se colocan arriba del texto; en escritorio, al lado contrario del texto.
- **Intro**: `app.js`, bloque "Compuerta"; `scene.playIntro()` controla la duración (3,2 s).
- **Regla de oro**: nada de `<script>` inline ni atributos `onclick` en el HTML (la CSP los bloquea); todo el JavaScript va en `assets/js`. `scripts/verificar.py` avisa si se rompe esta regla.

## Seguridad

El sitio es estático: no tiene servidor propio, base de datos, cuentas, formularios, API ni cookies, y no guarda datos de los visitantes. Eso deja fuera la mayoría de los riesgos clásicos (inyección SQL, contraseñas, tokens, subida de archivos, CORS de APIs, rate limiting). Lo que sí aplica está cubierto así:

| Medida | Dónde | Qué evita |
|---|---|---|
| **Content-Security-Policy** estricta: solo scripts del propio dominio, sin `eval`, sin iframes, sin objetos, `base-uri` y `form-action` cerrados, **Trusted Types** | `vercel.json` | XSS: aunque alguien lograra inyectar HTML, el navegador no ejecutaría su script |
| `frame-ancestors 'none'` + `X-Frame-Options: DENY` | `vercel.json` | clickjacking (meter el sitio en un iframe ajeno) |
| `X-Content-Type-Options: nosniff` | `vercel.json` | que el navegador "adivine" tipos de archivo |
| `Referrer-Policy: strict-origin-when-cross-origin` | `vercel.json` | filtrar la URL completa a terceros |
| `Permissions-Policy`: cámara, micrófono, geolocalización, sensores, pagos, USB y Topics desactivados | `vercel.json` | que cualquier código futuro pida esos permisos |
| HSTS (2 años, subdominios, preload) + HTTPS forzado | `vercel.json` + Vercel | degradar a HTTP |
| COOP / CORP `same-origin`; CORS acotado al dominio | `vercel.json` | que otros orígenes lean o embeban los recursos |
| **Sin terceros**: Three.js y las tipografías viven en `assets/` | `index.html` | dependencia y fuga de datos a CDNs/Google Fonts (relevante para visitantes europeos: RGPD) |
| `.well-known/security.txt` y `SECURITY.md` | raíz | que alguien que encuentre un fallo no sepa a quién avisar |
| `scripts/verificar.py` en GitHub Actions | `.github/` | subir secretos, archivos `.env`, scripts inline o recursos `http://` por descuido |
| `.gitignore` con `.env`, llaves y `.vercel/` | raíz | versionar secretos sin querer |

Three.js se incluye fijado en r128 (`assets/js/three.r128.min.js`); solo se usa para dibujar, sin cargar archivos de terceros ni entrada del usuario, así que no tiene superficie de ataque. Actualizarlo es opcional y un cambio de API, no de seguridad.

**Pendientes que no se hacen desde el código** (se configuran en las cuentas y el DNS):

- Activar verificación en dos pasos en GitHub y en Vercel, y en el correo de la empresa.
- En GitHub: *Settings → Code security* → activar *Secret scanning* y *Push protection*; opcionalmente proteger la rama `main` para que todo cambio entre por pull request.
- En el DNS (Namecheap): añadir **DMARC** (`_dmarc` TXT, empezar con `v=DMARC1; p=none; rua=mailto:direccioncomercial@grupoguerreroherrera.com`, y pasar a `p=quarantine` tras unas semanas), activar **DKIM** desde el panel de Private Email, y un registro **CAA** `0 issue "letsencrypt.org"` (Vercel emite con Let's Encrypt). Hoy existe SPF pero no DMARC ni DKIM, así que el dominio puede suplantarse en correos.
- Renovar la fecha `Expires` de `.well-known/security.txt` cada año (la verificación avisa 30 días antes).
- Opcional: enviar el dominio a hstspreload.org (una vez hecho, es muy difícil volver a HTTP).

## Accesibilidad y rendimiento

- `prefers-reduced-motion`: sin intro de cámara, sin revelados, movimiento mínimo.
- Sin WebGL: fondo estático y todo el contenido visible.
- Calidad adaptativa: si el equipo no da la talla, baja la densidad de píxeles.
- El contenido es HTML real (indexable); el 3D va detrás.
- Una sola conexión: todo sale de `www.grupoguerreroherrera.com` (sin DNS ni TLS extra hacia Google Fonts).

© 2026 Grupo Empresarial Guerrero Herrera S.A.S.
