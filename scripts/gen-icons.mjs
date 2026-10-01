// Generates the Android launcher icons and the web favicon from the OpenCode mark.
// Usage: node scripts/gen-icons.mjs
import sharp from "sharp";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const res = join(root, "android", "app", "src", "main", "res");
const publicDir = join(root, "public");

// The OpenCode mark: a blocky square "O" (outer ring, inner hole via evenodd).
// Original geometry: x 0..65.7143, y 16.4287..98.5716  (65.71 x 82.14).
const MARK_W = 65.7143;
const MARK_H = 82.1429;
const MARK = `<path fill-rule="evenodd" clip-rule="evenodd" d="M49.2857 32.8573H16.4286V82.143H49.2857V32.8573ZM65.7143 98.5716H0V16.4287H65.7143V98.5716Z" fill="currentColor"/>`;

const BG = "#111214";
const FG = "#ffffff";

function markGroup(size, markHeight, color) {
  const scale = markHeight / MARK_H;
  const w = MARK_W * scale;
  const tx = (size - w) / 2;
  const ty = (size - markHeight) / 2;
  return `<g transform="translate(${tx} ${ty}) scale(${scale}) translate(0 -16.4287)" color="${color}">${MARK}</g>`;
}

function legacySvg(size) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <rect width="${size}" height="${size}" rx="${size * 0.22}" fill="${BG}"/>
    ${markGroup(size, size * 0.56, FG)}
  </svg>`;
}

function roundSvg(size) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="${BG}"/>
    ${markGroup(size, size * 0.56, FG)}
  </svg>`;
}

function foregroundSvg(size) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    ${markGroup(size, size * 0.52, FG)}
  </svg>`;
}

const densities = [
  { dir: "mipmap-mdpi", legacy: 48, fg: 108 },
  { dir: "mipmap-hdpi", legacy: 72, fg: 162 },
  { dir: "mipmap-xhdpi", legacy: 96, fg: 216 },
  { dir: "mipmap-xxhdpi", legacy: 144, fg: 324 },
  { dir: "mipmap-xxxhdpi", legacy: 192, fg: 432 },
];

async function render(svg, out) {
  mkdirSync(dirname(out), { recursive: true });
  await sharp(Buffer.from(svg), { density: 384 }).png().toFile(out);
}

for (const d of densities) {
  const dir = join(res, d.dir);
  await render(legacySvg(d.legacy), join(dir, "ic_launcher.png"));
  await render(roundSvg(d.legacy), join(dir, "ic_launcher_round.png"));
  await render(foregroundSvg(d.fg), join(dir, "ic_launcher_foreground.png"));
}

// Web favicon / apple touch icon.
mkdirSync(publicDir, { recursive: true });
await render(legacySvg(512), join(publicDir, "icon-512.png"));
await render(legacySvg(192), join(publicDir, "icon-192.png"));
await render(legacySvg(180), join(publicDir, "apple-touch-icon.png"));

// Adaptive icon background colour.
writeFileSync(
  join(res, "values", "ic_launcher_background.xml"),
  `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">${BG}</color>\n</resources>\n`,
);

console.log("Icons generated.");
