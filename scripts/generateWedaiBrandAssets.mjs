import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

const require = createRequire(import.meta.url);
const sharp = require('sharp');

const root = process.cwd();
const source = path.join(root, 'public/brand/cq-logo-original.png');
const brandDir = path.join(root, 'public/brand');
const publicDir = path.join(root, 'public');

// The supplied artwork has generous decorative whitespace. This crop keeps the complete CQ
// glyph and its original light backdrop without introducing hard crop edges.
const artworkCrop = { height: 900, left: 170, top: 190, width: 900 };
const lightBackground = { alpha: 1, b: 248, g: 247, r: 249 };

const renderSquare = (size, paddingRatio = 0) => {
  const innerSize = Math.round(size * (1 - paddingRatio * 2));
  const padding = Math.floor((size - innerSize) / 2);
  const pipeline = sharp(source).extract(artworkCrop).resize(innerSize, innerSize);

  if (padding === 0) return pipeline.png();

  return pipeline
    .extend({
      background: lightBackground,
      bottom: size - innerSize - padding,
      left: padding,
      right: size - innerSize - padding,
      top: padding,
    })
    .png();
};

const statusBadge = (color, size) => {
  const radius = Math.max(3, Math.round(size * 0.14));
  const center = size - radius - Math.max(1, Math.round(size * 0.05));
  const stroke = Math.max(1, Math.round(size * 0.035));

  return Buffer.from(`
    <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
      <circle cx="${center}" cy="${center}" r="${radius}" fill="${color}" stroke="#ffffff" stroke-width="${stroke}" />
    </svg>
  `);
};

const writeStatusPng = async (target, size, color) => {
  const icon = await renderSquare(size).toBuffer();
  await sharp(icon).composite([{ input: statusBadge(color, size) }]).png().toFile(target);
};

const convertToIco = (input, output) => {
  execFileSync('sips', ['-s', 'format', 'ico', input, '--out', output], { stdio: 'ignore' });
};

await mkdir(brandDir, { recursive: true });

await renderSquare(1024).toFile(path.join(brandDir, 'cq-logo.png'));
for (const size of [512, 256, 128, 64, 32]) {
  await renderSquare(size).toFile(path.join(brandDir, `cq-logo-${size}.png`));
}

await sharp(source)
  .extract({ height: 585, left: 70, top: 280, width: 1114 })
  .resize(1200, 630, { background: lightBackground, fit: 'cover', position: 'centre' })
  .png()
  .toFile(path.join(brandDir, 'cq-og.png'));

await renderSquare(180).toFile(path.join(publicDir, 'apple-touch-icon.png'));
await renderSquare(64).toFile(path.join(publicDir, 'favicon.png'));
await renderSquare(192).toFile(path.join(publicDir, 'icons/icon-192x192.png'));
await renderSquare(512).toFile(path.join(publicDir, 'icons/icon-512x512.png'));
await renderSquare(192, 0.2).toFile(path.join(publicDir, 'icons/icon-192x192.maskable.png'));
await renderSquare(512, 0.2).toFile(path.join(publicDir, 'icons/icon-512x512.maskable.png'));

const faviconVariants = [
  { names: ['favicon.ico', 'favicon-32x32.ico'] },
  { color: '#8b5cf6', names: ['favicon-dev.ico', 'favicon-32x32-dev.ico'] },
  {
    color: '#22c55e',
    names: [
      'favicon-done.ico',
      'favicon-done-dev.ico',
      'favicon-32x32-done.ico',
      'favicon-32x32-done-dev.ico',
    ],
  },
  {
    color: '#ef4444',
    names: [
      'favicon-error.ico',
      'favicon-error-dev.ico',
      'favicon-32x-32-error.ico',
      'favicon-32x32-error-dev.ico',
    ],
  },
  {
    color: '#f59e0b',
    names: [
      'favicon-progress.ico',
      'favicon-progress-dev.ico',
      'favicon-32x32-progress.ico',
      'favicon-32x32-progress-dev.ico',
    ],
  },
];

const tempFaviconDir = await mkdtemp(path.join(os.tmpdir(), 'wedai-favicon-'));
for (const variant of faviconVariants) {
  for (const name of variant.names) {
    const size = name.includes('32x') ? 32 : 64;
    const png = path.join(tempFaviconDir, `${name}.png`);
    if (variant.color) await writeStatusPng(png, size, variant.color);
    else await renderSquare(size).toFile(png);
    convertToIco(png, path.join(publicDir, name));
  }
}
await rm(tempFaviconDir, { force: true, recursive: true });

console.log('Wedai CQ web brand assets generated.');
