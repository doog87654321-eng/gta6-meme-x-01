// gta6-meme-x-01 — main.ts
//
// A deterministic meme generator for the make.fun "Post a GTA 6 meme on X"
// bounty. It draws one 1080x1080 PNG with pure Node.js standard library
// (no network, no installed packages, no random wall-clock input):
//
//   "WAITED 13 YEARS FOR GTA VI"
//   ... a Vice City synthwave sunset, the make.fun ghost in sunglasses
//   leaning on a sports car with a bag of cash ...
//   "MY AGENT BEAT IT DAY ONE — AND MAKE.FUN PAID $500"
//
// The joke: GTA VI launched 19 November 2026 after a 13-year wait. The
// player is still stuck in the download queue; their AI agent finished
// the game on launch day and make.fun paid it $500 in bounties.
//
// Run:  node main.ts            (writes meme.png to ./output, or to
//                                $MAKEFUN_OUTPUT_DIR when set)
// The grader runs it as `node /bot/main.ts` with /output writable and
// no network; the output bytes are identical on every run.

import { mkdirSync, writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { join } from "node:path";

const W = 1080;
const H = 1080;

// ---------------------------------------------------------------- image ---
type RGB = [number, number, number];

const px = Buffer.alloc(W * H * 4); // RGBA, row-major

function setPixel(x: number, y: number, c: RGB, a = 255): void {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 4;
  px[i] = c[0];
  px[i + 1] = c[1];
  px[i + 2] = c[2];
  px[i + 3] = a;
}

function fillRect(x: number, y: number, w: number, h: number, c: RGB): void {
  const x0 = Math.max(0, Math.floor(x));
  const y0 = Math.max(0, Math.floor(y));
  const x1 = Math.min(W, Math.ceil(x + w));
  const y1 = Math.min(H, Math.ceil(y + h));
  for (let yy = y0; yy < y1; yy++) {
    for (let xx = x0; xx < x1; xx++) setPixel(xx, yy, c);
  }
}

function fillCircle(cx: number, cy: number, r: number, c: RGB): void {
  const r2 = r * r;
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy <= r2) setPixel(x, y, c);
    }
  }
}

function fillEllipse(cx: number, cy: number, rx: number, ry: number, c: RGB): void {
  for (let dy = -Math.floor(ry); dy <= Math.floor(ry); dy++) {
    const t = 1 - (dy * dy) / (ry * ry);
    if (t < 0) continue;
    const dx = Math.floor(rx * Math.sqrt(t));
    fillRect(cx - dx, cy + dy, dx * 2 + 1, 1, c);
  }
}

// Thick line: walk the segment stamping small discs along it.
function thickLine(x0: number, y0: number, x1: number, y1: number, t: number, c: RGB): void {
  const steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0));
  for (let i = 0; i <= steps; i++) {
    const s = steps === 0 ? 0 : i / steps;
    fillCircle(x0 + (x1 - x0) * s, y0 + (y1 - y0) * s, t / 2, c);
  }
}

// Even-odd scanline fill for a simple polygon (car body, cabin, roof).
function fillPolygon(points: Array<[number, number]>, c: RGB): void {
  let minY = H;
  let maxY = 0;
  for (const [, y] of points) {
    minY = Math.min(minY, Math.floor(y));
    maxY = Math.max(maxY, Math.ceil(y));
  }
  for (let y = Math.max(0, minY); y <= Math.min(H - 1, maxY); y++) {
    const xs: number[] = [];
    for (let i = 0; i < points.length; i++) {
      const [ax, ay] = points[i];
      const [bx, by] = points[(i + 1) % points.length];
      if ((ay <= y && by > y) || (by <= y && ay > y)) {
        xs.push(ax + ((y - ay) / (by - ay)) * (bx - ax));
      }
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      fillRect(Math.floor(xs[k]), y, Math.ceil(xs[k + 1]) - Math.floor(xs[k]), 1, c);
    }
  }
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function mix(c1: RGB, c2: RGB, t: number): RGB {
  return [
    Math.round(lerp(c1[0], c2[0], t)),
    Math.round(lerp(c1[1], c2[1], t)),
    Math.round(lerp(c1[2], c2[2], t)),
  ];
}

// Fixed-seed generator: every run draws the exact same picture.
let rngState = 1337;
function rnd(): number {
  rngState = (rngState * 1664525 + 1013904223) >>> 0;
  return rngState / 4294967296;
}
function rndInt(n: number): number {
  return Math.floor(rnd() * n);
}

// ------------------------------------------------------------------ font ---
// A tiny 5x7 bitmap font, written out by hand for this meme. Each glyph
// is 7 rows; each row is 5 bits, bit 4 = the leftmost pixel. Only the
// characters the meme's four lines need are included.
const FONT: Record<string, number[]> = {
  A: [14, 17, 17, 31, 17, 17, 17],
  B: [30, 17, 17, 30, 17, 17, 30],
  C: [14, 17, 16, 16, 16, 17, 14],
  D: [30, 17, 17, 17, 17, 17, 30],
  E: [31, 16, 16, 30, 16, 16, 31],
  F: [31, 16, 16, 30, 16, 16, 16],
  G: [14, 17, 16, 23, 17, 17, 15],
  H: [17, 17, 17, 31, 17, 17, 17],
  I: [14, 4, 4, 4, 4, 4, 14],
  J: [7, 2, 2, 2, 2, 18, 12],
  K: [17, 18, 20, 24, 20, 18, 17],
  L: [16, 16, 16, 16, 16, 16, 31],
  M: [17, 27, 21, 21, 17, 17, 17],
  N: [17, 25, 21, 19, 17, 17, 17],
  O: [14, 17, 17, 17, 17, 17, 14],
  P: [30, 17, 17, 30, 16, 16, 16],
  Q: [14, 17, 17, 17, 21, 18, 13],
  R: [30, 17, 17, 30, 20, 18, 17],
  S: [15, 16, 16, 14, 1, 1, 30],
  T: [31, 4, 4, 4, 4, 4, 4],
  U: [17, 17, 17, 17, 17, 17, 14],
  V: [17, 17, 17, 17, 17, 10, 4],
  W: [17, 17, 17, 21, 21, 27, 17],
  X: [17, 17, 10, 4, 10, 17, 17],
  Y: [17, 17, 10, 4, 4, 4, 4],
  Z: [31, 1, 2, 4, 8, 16, 31],
  "0": [14, 17, 19, 21, 25, 17, 14],
  "1": [4, 12, 4, 4, 4, 4, 14],
  "2": [14, 17, 1, 6, 8, 16, 31],
  "3": [31, 2, 4, 2, 1, 17, 14],
  "4": [2, 6, 10, 18, 31, 2, 2],
  "5": [31, 16, 30, 1, 1, 17, 14],
  "6": [6, 8, 16, 30, 17, 17, 14],
  "7": [31, 1, 2, 4, 8, 8, 8],
  "8": [14, 17, 17, 14, 17, 17, 14],
  "9": [14, 17, 17, 15, 1, 2, 12],
  " ": [0, 0, 0, 0, 0, 0, 0],
  ".": [0, 0, 0, 0, 0, 12, 12],
  $: [4, 15, 20, 14, 5, 30, 4],
  "-": [0, 0, 0, 14, 0, 0, 0],
  "!": [4, 4, 4, 4, 4, 0, 4],
  ":": [0, 12, 12, 0, 12, 12, 0],
};

function textWidth(text: string, scale: number): number {
  if (text.length === 0) return 0;
  return text.length * (6 * scale + scale) - scale;
}

function drawTextRaw(text: string, x: number, y: number, scale: number, c: RGB): void {
  let cx = x;
  for (const ch of text) {
    const glyph = FONT[ch] ?? FONT[" "];
    for (let row = 0; row < 7; row++) {
      const bits = glyph[row];
      for (let col = 0; col < 5; col++) {
        if (bits & (16 >> col)) {
          fillRect(cx + col * scale, y + row * scale, scale, scale, c);
        }
      }
    }
    cx += 6 * scale + scale;
  }
}

// Bold meme text: an outline stamped in 8 directions, then the fill.
function drawText(text: string, x: number, y: number, scale: number, fill: RGB, outline: RGB): void {
  const d = Math.max(2, Math.floor(scale / 3));
  for (const [ox, oy] of [
    [-d, 0], [d, 0], [0, -d], [0, d],
    [-d, -d], [d, -d], [-d, d], [d, d],
  ] as Array<[number, number]>) {
    drawTextRaw(text, x + ox, y + oy, scale, outline);
  }
  drawTextRaw(text, x, y, scale, fill);
}

function drawTextCentered(text: string, y: number, scale: number, fill: RGB, outline: RGB): void {
  const x = Math.floor((W - textWidth(text, scale)) / 2);
  drawText(text, x, y, scale, fill, outline);
}

// ------------------------------------------------------------------- png ---
// Minimal PNG writer: raw RGBA scanlines (filter 0), zlib, CRC32.
const CRC_TABLE: number[] = (() => {
  const table: number[] = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table.push(c >>> 0);
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const head = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(head), 0);
  return Buffer.concat([len, head, crc]);
}

function encodePNG(): Buffer {
  const raw = Buffer.alloc((W * 4 + 1) * H);
  for (let y = 0; y < H; y++) {
    raw[y * (W * 4 + 1)] = 0; // filter: none
    px.copy(raw, y * (W * 4 + 1) + 1, y * W * 4, (y + 1) * W * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

// ----------------------------------------------------------------- scene ---
const SKY_TOP: RGB = [27, 15, 59];
const SKY_MID: RGB = [184, 50, 128];
const SKY_LOW: RGB = [255, 122, 69];
const HORIZON: RGB = [255, 196, 107];
const DARK: RGB = [26, 11, 46];
const SUN_UP: RGB = [255, 224, 102];
const SUN_DOWN: RGB = [255, 138, 61];
const WHITE: RGB = [255, 255, 255];
const BLACK: RGB = [12, 8, 20];
const GOLD: RGB = [255, 210, 63];
const ASPHALT: RGB = [35, 35, 46];
const ASPHALT_LOW: RGB = [23, 23, 31];

function skyColor(y: number): RGB {
  const t = y / 660;
  if (t < 0.45) return mix(SKY_TOP, SKY_MID, t / 0.45);
  if (t < 0.8) return mix(SKY_MID, SKY_LOW, (t - 0.45) / 0.35);
  return mix(SKY_LOW, HORIZON, (t - 0.8) / 0.2);
}

function drawSky(): void {
  for (let y = 0; y < 660; y++) fillRect(0, y, W, 1, skyColor(y));
  // Stars in the upper sky.
  for (let i = 0; i < 70; i++) {
    const x = rndInt(W);
    const y = rndInt(250);
    const s = rnd() < 0.25 ? 3 : 2;
    fillRect(x, y, s, s, WHITE);
  }
}

function drawSun(): void {
  const cx = 540;
  const cy = 380;
  const r = 170;
  // Two-tone disc: bright top, orange bottom.
  for (let y = cy - r; y <= cy + r; y++) {
    const dy = y - cy;
    const half = Math.floor(Math.sqrt(Math.max(0, r * r - dy * dy)));
    const t = (y - (cy - r)) / (2 * r);
    fillRect(cx - half, y, half * 2 + 1, 1, mix(SUN_UP, SUN_DOWN, t));
  }
  // Synthwave slits across the lower half, widening downward.
  for (let i = 0; i < 5; i++) {
    const y = cy + 18 + i * 27;
    const h = 6 + i * 3;
    const dy = y - cy;
    const half = Math.floor(Math.sqrt(Math.max(0, r * r - dy * dy)));
    fillRect(cx - half - 8, y, half * 2 + 17, h, skyColor(y));
  }
}

function drawSkyline(): void {
  let x = -20;
  while (x < W + 20) {
    const bw = 60 + rndInt(80);
    const bh = 60 + rndInt(150);
    const top = 660 - bh;
    fillRect(x, top, bw, bh, DARK);
    // Lit windows, deterministic.
    for (let wy = top + 12; wy < 650; wy += 22) {
      for (let wx = x + 10; wx < x + bw - 10; wx += 18) {
        if (rnd() < 0.35) fillRect(wx, wy, 7, 10, GOLD);
      }
    }
    x += bw + 8 + rndInt(20);
  }
}

function drawPalm(baseX: number, lean: number): void {
  const topX = baseX + lean;
  const topY = 440;
  // Trunk: a gentle curve of stamped discs, thicker at the base.
  for (let i = 0; i <= 24; i++) {
    const s = i / 24;
    const x = baseX + (topX - baseX) * s + Math.sin(s * 2.2) * 14;
    const y = 660 - s * (660 - topY);
    fillCircle(x, y, 10 - s * 3, DARK);
  }
  // Seven fronds: each arcs out from the crown and droops at the tip.
  const fronds: Array<[number, number]> = [
    [-120, -10], [-95, -55], [-55, -85], [0, -92], [55, -82], [95, -50], [118, -5],
  ];
  for (const [dx, dy] of fronds) {
    const mx = topX + dx * 0.55;
    const my = topY + dy * 0.75;
    const tx = topX + dx;
    const ty = topY + dy;
    thickLine(topX, topY, mx, my, 9, DARK);
    thickLine(mx, my, tx, ty + 34, 7, DARK);
  }
  // Coconuts.
  fillCircle(topX - 12, topY + 8, 8, DARK);
  fillCircle(topX + 10, topY + 10, 8, DARK);
}

function drawRoad(): void {
  for (let y = 660; y < H; y++) {
    fillRect(0, y, W, 1, mix(ASPHALT, ASPHALT_LOW, (y - 660) / (H - 660)));
  }
  fillRect(0, 660, W, 26, [58, 58, 72]); // sidewalk strip
  // Lane dashes, below the caption.
  for (let x = 40; x < W; x += 130) {
    fillRect(x, 1052, 70, 8, GOLD);
  }
}

function drawCar(): void {
  // Low sports car, right side of the road.
  const body: RGB = [214, 38, 78];
  const darkBody: RGB = [158, 24, 56];
  fillPolygon(
    [[600, 848], [622, 792], [700, 772], [880, 766], [958, 792], [1010, 812], [1010, 848]],
    body,
  );
  fillPolygon(
    [[716, 772], [756, 730], [884, 730], [924, 766]],
    [150, 205, 235],
  );
  // Cabin roof + window split.
  fillPolygon([[756, 730], [884, 730], [872, 766], [770, 766]], [120, 180, 215]);
  thickLine(820, 730, 820, 766, 6, darkBody);
  // Side skirt shadow and headlight / taillight.
  fillRect(600, 836, 410, 12, darkBody);
  fillRect(996, 800, 14, 12, GOLD);
  fillRect(600, 800, 10, 12, [255, 60, 60]);
  // Wheels.
  for (const wx of [692, 938]) {
    fillCircle(wx, 848, 36, BLACK);
    fillCircle(wx, 848, 16, [180, 180, 190]);
    fillCircle(wx, 848, 7, [90, 90, 100]);
  }
}

function drawGhost(): void {
  const ghost: RGB = [250, 250, 252];
  const cx = 340;
  // Body: rounded head + straight sides + scalloped hem.
  fillCircle(cx, 742, 86, ghost);
  fillRect(cx - 86, 742, 172, 122, ghost);
  for (const bx of [283, 340, 397]) fillCircle(bx, 864, 28, ghost);
  // Arm reaching out to the money bag.
  thickLine(414, 800, 452, 828, 18, ghost);
  // Cool sunglasses.
  fillRect(292, 714, 40, 24, BLACK);
  fillRect(350, 714, 40, 24, BLACK);
  thickLine(332, 724, 350, 724, 6, BLACK);
  // Smile: a black crescent (white ellipse bites the top off a black one).
  fillEllipse(cx, 772, 24, 12, BLACK);
  fillEllipse(cx, 765, 24, 11, ghost);
  // Gold chain draped across the chest, pendant at the bottom of the arc.
  for (let a = 25; a <= 155; a += 2) {
    const rad = (a * Math.PI) / 180;
    const x = cx + Math.cos(rad) * 110;
    const y = 700 + Math.sin(rad) * 110;
    fillCircle(x, y, 4, GOLD);
  }
  fillRect(cx - 9, 806, 18, 24, GOLD);
  // Money bag in the ghost's hand.
  const bag: RGB = [217, 179, 128];
  fillCircle(468, 838, 46, bag);
  fillPolygon([[448, 800], [488, 800], [478, 776], [458, 776]], bag);
  fillRect(456, 772, 24, 8, [160, 120, 70]);
  drawText("$", 453, 820, 5, [90, 60, 20], [90, 60, 20]);
}

function drawScene(): void {
  drawSky();
  drawSun();
  drawSkyline();
  drawPalm(92, -34);
  drawPalm(992, 30);
  drawRoad();
  // Ground shadows under the car and the ghost.
  fillEllipse(805, 884, 220, 10, [18, 18, 26]);
  fillEllipse(340, 894, 105, 8, [18, 18, 26]);
  drawCar();
  drawGhost();
  // Meme text.
  drawTextCentered("WAITED 13 YEARS", 52, 7, WHITE, BLACK);
  drawTextCentered("FOR GTA VI", 118, 7, WHITE, BLACK);
  drawTextCentered("MY AGENT BEAT IT DAY ONE", 924, 6, WHITE, BLACK);
  drawTextCentered("AND MAKE.FUN PAID $500", 984, 6, GOLD, BLACK);
}

// ------------------------------------------------------------------ main ---
function main(): void {
  drawScene();
  const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? join(process.cwd(), "output");
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, "meme.png");
  writeFileSync(outPath, encodePNG());
  console.log(`wrote ${outPath} (1080x1080)`);
}

main();
