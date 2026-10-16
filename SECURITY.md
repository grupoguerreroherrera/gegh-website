# Política de seguridad

Sitio: [www.grupoguerreroherrera.com](https://www.grupoguerreroherrera.com/) · Grupo Empresarial Guerrero Herrera S.A.S.

## Reportar una vulnerabilidad

Si encuentras un problema de seguridad en el sitio, escríbenos **antes** de publicarlo:

- Correo: direccioncomercial@grupoguerreroherrera.com
- WhatsApp: +57 302 528 0632

Incluye los pasos para reproducirlo y, si puedes, una captura. Respondemos en un máximo de 5 días hábiles y acordamos contigo la fecha de divulgación. No se necesita cuenta ni autorización previa para reportar. El mismo contacto está publicado en `/.well-known/security.txt` (RFC 9116).

## Alcance y superficie

Este sitio es **estático**: no tiene servidor propio, base de datos, cuentas de usuario, formularios ni API. No almacena datos personales de los visitantes ni usa cookies ni analítica de terceros. Todo lo que se descarga (HTML, CSS, JS, imágenes y tipografías) sale del mismo dominio.

Lo que sí está protegido y cómo:

| Medida | Dónde |
|---|---|
| Content-Security-Policy estricta (solo scripts propios, sin eval, Trusted Types) | `vercel.json` |
| HSTS, `X-Frame-Options: DENY`, `nosniff`, Referrer-Policy, Permissions-Policy, COOP/CORP | `vercel.json` |
| HTTPS forzado y certificado automático | Vercel |
| Sin dependencias remotas: Three.js y las tipografías se sirven desde el propio dominio | `assets/` |
| Verificación automática en cada cambio (sin secretos, sin scripts inline, sin `http://`) | `.github/workflows/verificacion.yml` |

## Fuera de alcance

- Ataques que requieran acceso físico al equipo del visitante o a la cuenta de GitHub/Vercel.
- Reportes de escáneres automáticos sin prueba de impacto.
- Ingeniería social contra el equipo de GEGH.
