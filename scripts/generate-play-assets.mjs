import { copyFile, mkdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import sharp from "sharp";

const root = resolve(import.meta.dirname, "..");
const output = resolve(root, "docs", "play-store", "assets");
const iconSource = resolve(root, "public", "icon-512.png");

await mkdir(output, { recursive: true });
await copyFile(iconSource, resolve(output, "app-icon-512.png"));

const feature = Buffer.from(`
  <svg width="1024" height="500" viewBox="0 0 1024 500" xmlns="http://www.w3.org/2000/svg">
    <rect width="1024" height="500" fill="#fff"/>
    <rect x="0" y="0" width="22" height="500" fill="#e0382c"/>
    <circle cx="260" cy="250" r="176" fill="#fbe6e4"/>
    <g transform="translate(4 -10)">
      <path d="M256 96C190 96 150 150 155 230C150 330 190 416 256 416C322 416 362 330 357 230C362 150 322 96 256 96Z" fill="#1a1716"/>
      <circle cx="222" cy="240" r="21" fill="#fff"/>
      <circle cx="290" cy="240" r="21" fill="#fff"/>
      <circle cx="189" cy="278" r="15" fill="#b86f68"/>
      <circle cx="323" cy="278" r="15" fill="#b86f68"/>
      <path d="M231 285Q256 306 281 285" stroke="#fff" stroke-width="9" stroke-linecap="round" fill="none"/>
      <path d="M132 194C101 184 83 165 77 137M380 194C411 184 429 165 435 137" stroke="#f37348" stroke-width="12" stroke-linecap="round" fill="none"/>
      <path d="M350 151L365 181L399 186L374 210L380 244L350 228L319 244L325 210L300 186L335 181Z" fill="#f37348"/>
    </g>
    <path d="M720 70h234v18H720zM720 412h234v18H720z" fill="#f37348"/>
    <text x="490" y="206" font-family="Arial, sans-serif" font-size="108" font-weight="800" letter-spacing="-4" fill="#1a1a1a">ARU</text>
    <text x="496" y="272" font-family="Arial, sans-serif" font-size="31" font-weight="700" fill="#e0382c">K-BEAUTY, MADE PERSONAL</text>
    <text x="496" y="326" font-family="Arial, sans-serif" font-size="25" fill="#3d3d3d">Optional camera check + simple survey</text>
  </svg>
`);

await sharp(feature)
  .flatten({ background: "#ffffff" })
  .removeAlpha()
  .png({ compressionLevel: 9 })
  .toFile(resolve(output, "feature-graphic-1024x500.png"));

for (const name of [
  "phone-01-home.png",
  "phone-02-scan.png",
  "phone-03-report.png",
  "phone-04-routine.png",
]) {
  const path = resolve(output, name);
  const screenshot = await readFile(path);
  await sharp(screenshot)
    .resize(1080, 2160, { fit: "fill", kernel: sharp.kernel.lanczos3 })
    .png({ compressionLevel: 9 })
    .toFile(path);
}

console.log(`Generated Play assets in ${output}`);
