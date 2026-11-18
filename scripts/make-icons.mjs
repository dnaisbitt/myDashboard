// Renders the PWA icons from SVG using the installed Edge browser.
// Run: node scripts/make-icons.mjs
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";

// "Today's three": three lines, the first under the highlighter.
const svg = (size, pad) => {
  const s = size;
  const inner = s - pad * 2;
  const x = pad + inner * 0.2;
  const w = inner * 0.6;
  const h = inner * 0.09;
  const gap = inner * 0.17;
  const y0 = s / 2 - gap - h / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">
  <rect width="${s}" height="${s}" fill="#15171a"/>
  <rect x="${x}" y="${y0}" width="${w * 0.78}" height="${h}" rx="${h / 2}" fill="#f2c14e"/>
  <rect x="${x}" y="${y0 + gap}" width="${w}" height="${h}" rx="${h / 2}" fill="#f3f4f1"/>
  <rect x="${x}" y="${y0 + gap * 2}" width="${w * 0.55}" height="${h}" rx="${h / 2}" fill="#f3f4f1" opacity="0.55"/>
</svg>`;
};

mkdirSync("public/icons", { recursive: true });
const browser = await chromium.launch({ channel: "msedge" });
const page = await browser.newPage();
for (const [name, size, pad] of [
  ["icon-192.png", 192, 0],
  ["icon-512.png", 512, 0],
  ["maskable-512.png", 512, 64],
  ["apple-touch-icon.png", 180, 0],
]) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0">${svg(size, pad)}</body></html>`);
  const buf = await page.screenshot({ omitBackground: false });
  writeFileSync(`public/icons/${name}`, buf);
  console.log("wrote", name);
}
writeFileSync("src/app/icon.svg", svg(64, 0));
await browser.close();
