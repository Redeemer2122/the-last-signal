import { readFile } from "node:fs/promises";
import { buildFramePacks } from "./lib/frame-packs.mjs";
import { formatBytes, fromRoot } from "./lib/filesystem.mjs";
import { SEQUENCE_ID } from "./lib/manifest.mjs";

const manifestPath = fromRoot("public", "sequences", SEQUENCE_ID, "manifest.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const packs = await buildFramePacks(manifest.frameCount);

for (const variant of ["desktop", "mobile"]) {
  const total = packs[variant].reduce((sum, pack) => sum + pack.byteLength, 0);
  console.log(`${variant}: ${packs[variant].length} packs, ${formatBytes(total)}`);
}
