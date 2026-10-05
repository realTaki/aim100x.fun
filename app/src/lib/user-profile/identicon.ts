import { keccak256, stringToHex } from "viem";

/** Symmetric 8×8 identicon as an SVG data URL (deterministic from seed string). */
export function identiconDataUrl(seed: string): string {
  const hash = keccak256(stringToHex(seed.toLowerCase()));
  const bytes: number[] = [];
  for (let i = 2; i < hash.length; i += 2) {
    bytes.push(Number.parseInt(hash.slice(i, i + 2), 16));
  }

  const hue = (bytes[0]! * 360) / 255;
  const fg = `hsl(${hue.toFixed(1)} 62% 52%)`;
  const bg = `hsl(${hue.toFixed(1)} 38% 18%)`;

  const grid = 8;
  let rects = "";
  for (let y = 0; y < grid; y++) {
    for (let x = 0; x < Math.ceil(grid / 2); x++) {
      const byte = bytes[(y * Math.ceil(grid / 2) + x) % bytes.length]!;
      if (byte % 2 !== 0) {
        const mirror = grid - 1 - x;
        const cols = x === mirror ? [x] : [x, mirror];
        for (const col of cols) {
          rects += `<rect x="${col}" y="${y}" width="1" height="1" fill="${fg}"/>`;
        }
      }
    }
  }

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8" shape-rendering="crispEdges">` +
    `<rect width="8" height="8" fill="${bg}"/>${rects}</svg>`;

  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
