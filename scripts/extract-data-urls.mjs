import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectDirectory = dirname(scriptDirectory);
const htmlPath = join(projectDirectory, "index.html");
const outputDirectory = join(projectDirectory, "assets", "media");
const shouldWrite = process.argv.includes("--write");

const extensions = new Map([
  ["image/png", ".png"],
  ["image/jpeg", ".jpg"],
  ["image/jpg", ".jpg"],
  ["image/webp", ".webp"],
  ["image/gif", ".gif"],
  ["image/svg+xml", ".svg"],
  ["audio/mpeg", ".mp3"],
  ["audio/mp3", ".mp3"],
  ["audio/wav", ".wav"],
  ["audio/x-wav", ".wav"],
  ["audio/ogg", ".ogg"],
  ["video/mp4", ".mp4"],
  ["video/webm", ".webm"],
  ["application/octet-stream", ".bin"],
]);

const html = readFileSync(htmlPath, "utf8");
const dataUrlPattern = /data:([^;,\s"']+)(?:;charset=[^;,]+)?;base64,([A-Za-z0-9+/=]+)/g;
const assets = new Map();
const occurrencesByMime = new Map();
let occurrenceCount = 0;

const optimizedHtml = html.replace(dataUrlPattern, (dataUrl, mime, payload) => {
  occurrenceCount += 1;
  const normalizedMime = mime.toLowerCase();
  const bytes = Buffer.from(payload, "base64");
  const hash = createHash("sha256").update(bytes).digest("hex");
  const extension = extensions.get(normalizedMime) ?? extname(normalizedMime) ?? ".bin";
  const filename = `${hash.slice(0, 20)}${extension}`;
  const key = `${hash}:${extension}`;

  if (!assets.has(key)) {
    assets.set(key, { bytes, filename, mime: normalizedMime });
  }

  const mimeStats = occurrencesByMime.get(normalizedMime) ?? { count: 0, bytes: 0 };
  mimeStats.count += 1;
  mimeStats.bytes += bytes.length;
  occurrencesByMime.set(normalizedMime, mimeStats);

  return `assets/media/${filename}`;
});

const uniqueBytes = [...assets.values()].reduce((sum, asset) => sum + asset.bytes.length, 0);
const largestAssets = [...assets.values()]
  .sort((left, right) => right.bytes.length - left.bytes.length)
  .slice(0, 10)
  .map((asset) => ({ file: asset.filename, mime: asset.mime, bytes: asset.bytes.length }));

console.log(JSON.stringify({
  mode: shouldWrite ? "write" : "analyze",
  htmlBytesBefore: Buffer.byteLength(html),
  htmlBytesAfter: Buffer.byteLength(optimizedHtml),
  occurrences: occurrenceCount,
  uniqueAssets: assets.size,
  uniqueAssetBytes: uniqueBytes,
  byMime: Object.fromEntries(occurrencesByMime),
  largestAssets,
}, null, 2));

if (shouldWrite) {
  mkdirSync(outputDirectory, { recursive: true });
  for (const asset of assets.values()) {
    writeFileSync(join(outputDirectory, asset.filename), asset.bytes);
  }
  writeFileSync(htmlPath, optimizedHtml, "utf8");
  console.log(`Extracted media to ${relative(projectDirectory, outputDirectory)} and updated index.html.`);
}
