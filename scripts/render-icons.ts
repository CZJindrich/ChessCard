/**
 * Renders the app icons in public/icons/ (PNG) from public/favicon.svg with headless Chromium,
 * for the web manifest and the iOS home screen.
 *
 *   npx tsx scripts/render-icons.ts
 *
 * Uses the Chromium that `npx playwright install chromium` installed, or PLAYWRIGHT_CHROMIUM_PATH.
 */
import { mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT_DIR = `${ROOT}public/icons`;

interface IconSpec {
  file: string;
  size: number;
  /** A full-bleed night-ink field behind the medallion, or null for a transparent icon. */
  background: string | null;
  /** The medallion's share of the icon's side. */
  scale: number;
}

const ICONS: readonly IconSpec[] = [
  { file: 'icon-192.png', size: 192, background: null, scale: 1 },
  { file: 'icon-512.png', size: 512, background: null, scale: 1 },
  // Maskable: the platform crops to a circle or squircle, so the medallion stays inside the 80% safe zone.
  { file: 'icon-maskable-512.png', size: 512, background: '#0D0B12', scale: 0.72 },
  // iOS rounds the corners itself and shows transparency as black.
  { file: 'apple-touch-icon.png', size: 180, background: '#0D0B12', scale: 0.84 },
];

/** The favicon's drawing without its <svg> wrapper (its viewBox is 0 0 64 64). */
function faviconArt(): string {
  const svg = readFileSync(`${ROOT}public/favicon.svg`, 'utf8');
  return svg.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
}

function iconSvg(art: string, spec: IconSpec): string {
  const pad = (64 / spec.scale - 64) / 2;
  const side = 64 + pad * 2;
  const field = spec.background
    ? `<rect x="${-pad}" y="${-pad}" width="${side}" height="${side}" fill="${spec.background}"/><circle cx="32" cy="30" r="${30 + pad * 0.6}" fill="url(#halo)"/>`
    : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-pad} ${-pad} ${side} ${side}">
<defs><radialGradient id="halo" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#F4B942" stop-opacity="0.16"/><stop offset="1" stop-color="#F4B942" stop-opacity="0"/></radialGradient></defs>
${field}${art}</svg>`;
}

async function main(): Promise<void> {
  mkdirSync(OUT_DIR, { recursive: true });
  const art = faviconArt();
  const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH;
  const browser = await chromium.launch(executablePath ? { executablePath } : {});
  try {
    const page = await browser.newPage({ deviceScaleFactor: 1 });
    for (const spec of ICONS) {
      const data = Buffer.from(iconSvg(art, spec)).toString('base64');
      await page.setViewportSize({ width: spec.size, height: spec.size });
      await page.setContent(`<body style="margin:0;background:transparent"><img id="icon" width="${spec.size}" height="${spec.size}" src="data:image/svg+xml;base64,${data}"></body>`);
      await page.waitForFunction(() => document.querySelector<HTMLImageElement>('#icon')?.complete === true);
      await page.locator('#icon').screenshot({ path: `${OUT_DIR}/${spec.file}`, omitBackground: true });
      console.log(`public/icons/${spec.file} (${spec.size}×${spec.size})`);
    }
  } finally {
    await browser.close();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
