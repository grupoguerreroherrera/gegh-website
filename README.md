# GEGH — Experiencia élite (v3)

Rediseño de `grupoguerreroherrera.com` al nivel de los sitios premiados en Awwwards. Un solo archivo `index.html`, listo para reemplazar el actual en tu repositorio de GitHub Pages. Esta versión integra todo lo de la v2 **más cuatro novedades**: el dock 3D de contacto, el asistente conversacional, la sección de colaboración sin precios y la música generativa.

## Novedades de la v3

**Dock 3D de contacto — siempre visible**
- Dos orbes flotantes abajo a la derecha: **WhatsApp** (logo oficial sobre disco de oro metálico que gira; se tiñe de verde al pasar el cursor) y el **Asistente GEGH**.
- Cada orbe levita, proyecta sombra real, tiene un anillo que pulsa y **se inclina en 3D siguiendo tu cursor**, con un brillo especular que recorre su superficie. Tooltip al hover, punto verde de "en línea" en WhatsApp.

**Asistente GEGH — funciona en GitHub Pages**
- Panel de cristal (blur + borde dorado) con cabecera "En línea · Bucaramanga", orbe que respira y puntos de escritura.
- **Cerebro 100% local**: sin backend ni API keys. Responde sobre servicios, método de 7 días, gobernanza ISO 42001, ubicación, contacto e **inversión** (sin dar cifras: explica el modelo a la medida e invita al diagnóstico gratuito).
- Chips de sugerencia tras cada respuesta y **handoff a WhatsApp**: si la pregunta se sale del guion, la deja lista para enviar al equipo con un toque.

**Colaboración a la medida (adiós a los precios)**
- Los tres planes siguen existiendo como *formas de trabajar* (Esencial / Profesional / Premium IA) pero ahora dicen **"A la medida — definida contigo en el diagnóstico"**.
- Texto editorial: *"No publicamos tarifas, y es deliberado: cada proyecto tiene su propia escala, su propia ambición y su propio presupuesto."*
- Cierre de sección: **"Contáctanos. Nos ajustamos a tu medida."** + botón "Agendar diagnóstico →" directo a WhatsApp.

**Música generativa "ORO" (WebAudio, sin archivos)**
- Pieza ambiental en Re menor compuesta en tiempo real: pads cálidos, campanas FM con eco, sub grave y aire — nunca suena igual dos veces y no pesa ni un KB.
- **Elección en el loader**: al llegar a 100, el visitante decide "Entrar con sonido" o "En silencio" (las tiendas de premios aman este patrón y los navegadores lo exigen).
- Toggle **SONIDO** en la nav con ecualizador animado; la música **se excita con la velocidad del scroll** junto al organismo 3D. Ticks de hover y "thock" de clic.

## Lo que ya traía la v2 (intacto)

Scroll inercial Lenis · loader 000→100 con doble cortina dorada · título hero letra a letra en 3D · manifiesto pinneado con marca de agua GEGH de 38vw · skew por velocidad · organismo-joya con especular dorado, fresnel, dos anillos orbitales, aurora fbm y polvo dorado · cada servicio inyecta su color al organismo con etiqueta que sigue el cursor · HUD con coordenadas de Bucaramanga y reloj GMT-5 en vivo · tipografía variable que respira bajo el cursor en "HABLEMOS AHORA →".

## Publicar en GitHub Pages

1. Reemplaza el `index.html` de tu repositorio por este archivo.
2. Commit + push. En 1–2 minutos está en vivo. Sin build, sin npm.
3. CDNs: Three.js r128, GSAP 3.12 (cdnjs) y Lenis 1.1 (jsDelivr). Si alguno falla, el sitio degrada con elegancia.

## Personalización rápida

- **Colores**: variables `--oro`, `--negro`, `--hueso` al inicio del CSS.
- **WhatsApp**: busca `573025280632` (número y mensajes prellenados, también en el cerebro del asistente).
- **Respuestas del asistente**: array `CEREBRO` en el script — cada entrada tiene su expresión regular, su respuesta y sus chips.
- **Música**: módulo `Sonido` — acordes en `ACORDES`, volúmenes y filtro al inicio del módulo.
- **Organismo**: objeto `PHASES` (amplitud, colores, posición y escala por capítulo); destellos por servicio en `data-glow`.

## Notas

- Accesible: `prefers-reduced-motion` respetado (sin pin, sin skew, escena 3D apagada), foco visible, ARIA en orbes y asistente, contenido visible sin JS.
- El asistente y el formulario siguen siendo WhatsApp directo — GitHub Pages no tiene backend, y así nada se rompe.

## Créditos

Three.js (MIT) · GSAP + ScrollTrigger (uso gratuito) · Lenis (MIT) · Fuentes: Archivo, Instrument Sans, Space Mono (OFL).

© 2026 Grupo Empresarial Guerrero Herrera S.A.S. Diseño y desarrollo: **Juan Felipe Guerrero Urueña**.
