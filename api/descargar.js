// Entrega los instaladores desde senabros.vercel.app: trae el archivo de GitHub Releases y lo pasa tal cual,
// así la descarga empieza en el mismo sitio y el jugador no ve otra dirección.
export const config = { runtime: 'edge' };
const REPO = 'CristianT71/senabros';
const FILES = { 'SenaBros-Setup.exe': 'application/vnd.microsoft.portable-executable', 'SenaBros.apk': 'application/vnd.android.package-archive' };

export default async function handler(req) {
  const name = new URL(req.url).searchParams.get('f') || '';
  if (!FILES[name]) return new Response('Archivo no encontrado', { status: 404 });
  const r = await fetch(`https://github.com/${REPO}/releases/latest/download/${name}`, { redirect: 'follow' });
  if (!r.ok || !r.body) return new Response('Todavía no hay una versión publicada', { status: 404 });
  const h = new Headers({ 'Content-Type': FILES[name], 'Content-Disposition': `attachment; filename="${name}"`, 'Cache-Control': 'public, max-age=300', 'X-Content-Type-Options': 'nosniff' });
  const len = r.headers.get('content-length'); if (len) h.set('Content-Length', len);
  return new Response(r.body, { headers: h });
}
