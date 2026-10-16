#!/usr/bin/env python3
"""Verificación del sitio antes de publicar (se ejecuta en GitHub Actions y se puede correr local).

    python3 scripts/verificar.py

Comprueba lo que la política de seguridad del sitio da por sentado:
  - vercel.json es JSON válido y conserva las cabeceras de seguridad.
  - index.html no tiene scripts inline ni manejadores on*= (la CSP los bloquearía),
    ni enlaces http:// ni recursos de otros dominios.
  - Ningún archivo del repositorio parece contener secretos (claves, tokens, llaves privadas).
  - No hay archivos .env ni llaves privadas versionados.
  - /.well-known/security.txt sigue vigente (Expires en el futuro).
  - Existen robots.txt, sitemap.xml y los recursos que index.html referencia.

Diseño y desarrollo: Grupo Empresarial Guerrero Herrera (GEGH), Bucaramanga.
"""
import datetime as dt
import json
import os
import re
import sys

RAIZ = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
errores, avisos = [], []

def err(m): errores.append(m)
def aviso(m): avisos.append(m)

def leer(rel):
    with open(os.path.join(RAIZ, rel), encoding='utf-8', errors='replace') as f:
        return f.read()

# ---------- vercel.json ----------
try:
    vj = json.loads(leer('vercel.json'))
    cab = {}
    for regla in vj.get('headers', []):
        if regla.get('source') == '/(.*)':
            for h in regla.get('headers', []):
                cab[h['key'].lower()] = h['value']
    for k in ('content-security-policy', 'strict-transport-security', 'x-frame-options',
              'x-content-type-options', 'referrer-policy', 'permissions-policy'):
        if k not in cab:
            err(f'vercel.json: falta la cabecera {k}')
    csp = cab.get('content-security-policy', '')
    if "script-src 'self'" not in csp or "'unsafe-eval'" in csp or re.search(r"script-src[^;]*'unsafe-inline'", csp):
        err('vercel.json: la CSP debe mantener script-src \'self\' sin unsafe-inline ni unsafe-eval')
except FileNotFoundError:
    err('falta vercel.json')
except json.JSONDecodeError as e:
    err(f'vercel.json no es JSON válido: {e}')

# ---------- index.html ----------
html = leer('index.html')
for m in re.finditer(r'<script\b([^>]*)>', html, re.I):
    attrs = m.group(1)
    if 'src=' not in attrs and 'application/ld+json' not in attrs:
        err('index.html: hay un <script> inline; la CSP solo permite scripts en assets/js')
if re.search(r'\son[a-z]+\s*=', html, re.I):
    err('index.html: hay manejadores on*= inline; muévelos a assets/js/app.js')
if re.search(r'javascript:', html, re.I):
    err('index.html: hay URLs javascript:')
for m in re.finditer(r'(?:src|href)=["\'](https?://[^"\']+)', html, re.I):
    url = m.group(1)
    if url.startswith('http://') and not url.startswith('http://www.w3.org/'):
        err(f'index.html: recurso sin HTTPS: {url}')
    if re.search(r'\bfonts\.(googleapis|gstatic)\.com', url):
        err('index.html: vuelve a cargar tipografías de Google; usa assets/fonts')
for m in re.finditer(r'<(script|link)\b([^>]*)>', html, re.I):
    tag, attrs = m.group(1).lower(), m.group(2)
    remoto = re.search(r'(?:src|href)=["\'](https?://[^"\']+)', attrs, re.I)
    if not remoto:
        continue
    es_recurso = tag == 'script' or re.search(r'rel=["\'][^"\']*(?:stylesheet|preload|modulepreload)', attrs, re.I)
    if es_recurso:
        err(f'index.html: script, hoja de estilo o preload de otro dominio (la CSP lo bloquea): {remoto.group(1)}')
for m in re.finditer(r'target=["\']_blank["\']', html, re.I):
    ini = html.rfind('<a', 0, m.start())
    etiqueta = html[ini:html.find('>', m.end()) + 1]
    if 'noopener' not in etiqueta:
        err('index.html: enlace target="_blank" sin rel="noopener"')
# recursos locales referenciados
for m in re.finditer(r'(?:src|href)=["\'](assets/[^"\'#?]+)', html):
    if not os.path.exists(os.path.join(RAIZ, m.group(1))):
        err(f'index.html referencia un archivo que no existe: {m.group(1)}')
for m in re.finditer(r'url\((assets/[^)\'"]+)\)', html):
    if not os.path.exists(os.path.join(RAIZ, m.group(1))):
        err(f'index.html (CSS) referencia un archivo que no existe: {m.group(1)}')

# ---------- secretos y archivos sensibles ----------
PATRONES = [
    (r'AKIA[0-9A-Z]{16}', 'clave de acceso AWS'),
    (r'AIza[0-9A-Za-z_\-]{35}', 'clave de API de Google'),
    (r'sk_(?:live|test)_[0-9A-Za-z]{10,}', 'clave de Stripe'),
    (r'gh[pousr]_[0-9A-Za-z]{30,}', 'token de GitHub'),
    (r'xox[baprs]-[0-9A-Za-z\-]{10,}', 'token de Slack'),
    (r'-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----', 'llave privada'),
    (r'(?i)(?:password|contrase[ñn]a|secret|api[_-]?key)\s*[:=]\s*["\'][^"\']{6,}["\']', 'credencial escrita en el código'),
]
OMITIR_DIR = {'.git', 'node_modules', '.vercel'}
BINARIOS = ('.png', '.webp', '.jpg', '.jpeg', '.woff2', '.woff', '.ico', '.zip')
for carpeta, dirs, archivos in os.walk(RAIZ):
    dirs[:] = [d for d in dirs if d not in OMITIR_DIR]
    for nombre in archivos:
        rel = os.path.relpath(os.path.join(carpeta, nombre), RAIZ)
        if nombre == '.env' or nombre.startswith('.env.') or nombre.endswith(('.pem', '.key', '.p12')):
            err(f'archivo sensible versionado: {rel}')
            continue
        if nombre.endswith(BINARIOS) or rel == 'scripts/verificar.py':
            continue
        try:
            texto = leer(rel)
        except (UnicodeDecodeError, OSError):
            continue
        for patron, que in PATRONES:
            if re.search(patron, texto):
                err(f'{rel}: parece contener {que}')

# ---------- security.txt ----------
try:
    st = leer('.well-known/security.txt')
    m = re.search(r'^Expires:\s*(\S+)', st, re.M)
    if not m:
        err('security.txt: falta Expires')
    else:
        exp = dt.datetime.fromisoformat(m.group(1).replace('Z', '+00:00'))
        restante = exp - dt.datetime.now(dt.timezone.utc)
        if restante.days < 0:
            err('security.txt: la fecha Expires ya pasó; actualízala')
        elif restante.days < 30:
            aviso(f'security.txt: Expires vence en {restante.days} días; actualízala pronto')
    if 'Contact:' not in st:
        err('security.txt: falta Contact')
except FileNotFoundError:
    err('falta .well-known/security.txt')

# ---------- archivos básicos ----------
for rel in ('robots.txt', 'sitemap.xml', 'assets/favicon.svg', 'assets/og.png', 'assets/js/three.r128.min.js'):
    if not os.path.exists(os.path.join(RAIZ, rel)):
        err(f'falta {rel}')

# ---------- resultado ----------
for a in avisos:
    print('AVISO  ', a)
for e in errores:
    print('ERROR  ', e)
if errores:
    print(f'\n{len(errores)} error(es).')
    sys.exit(1)
print('Verificación correcta: sin secretos, CSP respetada, recursos presentes.')
