/**
 * Serves the built client (dist/) over plain HTTP: correct MIME types, index.html for any path
 * that is not a file (and for "/"), no directory traversal, long caching for hashed assets.
 */
import { createReadStream, statSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';

const MIME: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.wasm': 'application/wasm',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
};

export function mimeType(path: string): string {
  return MIME[extname(path).toLowerCase()] ?? 'application/octet-stream';
}

const NOT_BUILT = `<!doctype html><meta charset="utf-8"><title>Wickwatch server</title>
<body style="background:#0D0B12;color:#EDE3CC;font-family:Georgia,serif;padding:3rem;line-height:1.5">
<h1 style="color:#F4B942">Wickwatch</h1><p>The game server is running, but the client has not been built.</p>
<p>Run <code>npm run build</code>, then restart <code>npm run server</code>.</p></body>`;

function isFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

/**
 * The file under `root` for a URL path, or null when it escapes the root or is malformed.
 * Exported for tests.
 */
export function resolveStaticPath(root: string, urlPath: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(urlPath.split('?')[0].split('#')[0]);
  } catch {
    return null;
  }
  if (decoded.includes('\0')) return null;
  const base = resolve(root);
  const target = resolve(base, `.${sep}${normalize(decoded).replace(/^([/\\])+/, '')}`);
  if (target !== base && !target.startsWith(base + sep)) return null;
  return target;
}

export function createStaticHandler(distDir: string): (req: IncomingMessage, res: ServerResponse) => void {
  const root = resolve(distDir);
  const index = join(root, 'index.html');
  return (req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { Allow: 'GET, HEAD', 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Method not allowed');
      return;
    }
    const target = resolveStaticPath(root, req.url ?? '/');
    if (target === null) {
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Bad path');
      return;
    }
    let file = target;
    if (!isFile(file)) {
      // Missing assets are real 404s; anything else is the single-page app.
      if (/\.[a-z0-9]{1,8}$/i.test(file) && !file.endsWith('.html')) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Not found');
        return;
      }
      file = index;
    }
    if (!isFile(file)) {
      res.writeHead(503, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(req.method === 'HEAD' ? undefined : NOT_BUILT);
      return;
    }
    const hashed = /[/\\]assets[/\\]/.test(file);
    const size = statSync(file).size;
    res.writeHead(200, {
      'Content-Type': mimeType(file),
      'Content-Length': size,
      'Cache-Control': hashed ? 'public, max-age=31536000, immutable' : 'no-cache',
      'X-Content-Type-Options': 'nosniff',
    });
    if (req.method === 'HEAD') {
      res.end();
      return;
    }
    const stream = createReadStream(file);
    stream.on('error', () => res.destroy());
    stream.pipe(res);
  };
}
