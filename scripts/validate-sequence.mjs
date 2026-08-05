import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { assertFfmpeg, probeJson, run } from "./lib/ffmpeg.mjs";
import { directorySize, fileExists, formatBytes, fromRoot } from "./lib/filesystem.mjs";
import { SEQUENCE_ID } from "./lib/manifest.mjs";

const { ffmpeg, ffprobe } = assertFfmpeg();
const root = fromRoot("public", "sequences", SEQUENCE_ID);
const manifestPath = path.join(root, "manifest.json");
if (!(await fileExists(manifestPath))) throw new Error(`Missing manifest: ${manifestPath}`);
const manifest = JSON.parse(await (await import("node:fs/promises")).readFile(manifestPath, "utf8"));

async function validateVariant(name, config) {
  const directory = path.join(root, name);
  const files = (await readdir(directory)).filter((file) => file.endsWith(".webp")).sort();
  if (files.length !== manifest.frameCount) throw new Error(`${name}: expected ${manifest.frameCount} frames, found ${files.length}`);
  for (let index = 1; index <= files.length; index += 1) {
    const expected = `frame-${String(index).padStart(4, "0")}.webp`;
    if (files[index - 1] !== expected) throw new Error(`${name}: missing or discontinuous frame ${expected}`);
    if ((await stat(path.join(directory, expected))).size === 0) throw new Error(`${name}: zero-byte frame ${expected}`);
  }
  const first = path.join(directory, files[0]);
  const last = path.join(directory, files.at(-1));
  for (const file of [first, last]) {
    const result = await probeJson(ffprobe, file, "stream=width,height,codec_name");
    const stream = result.streams[0];
    if (stream.width !== config.width || stream.height !== config.height || stream.codec_name !== "webp") {
      throw new Error(`${name}: invalid image ${file}`);
    }
  }
  await run(ffmpeg, [
    "-hide_banner", "-loglevel", "error", "-framerate", String(manifest.samplingFps),
    "-i", path.join(directory, "frame-%04d.webp"), "-f", "null", "-",
  ], { quiet: true });
  return { count: files.length, size: await directorySize(directory) };
}

for (const chapter of manifest.chapters) {
  for (const field of ["frameStart", "frameFocus", "frameEnd"]) {
    if (!Number.isInteger(chapter[field]) || chapter[field] < 1 || chapter[field] > manifest.frameCount) {
      throw new Error(`Chapter ${chapter.id} has invalid ${field}: ${chapter[field]}`);
    }
  }
}

for (const poster of Object.values(manifest.poster)) {
  if (!(await fileExists(fromRoot("public", poster.replace(/^\//, ""))))) throw new Error(`Missing poster: ${poster}`);
}

const desktop = await validateVariant("desktop", manifest.desktop);
const mobile = await validateVariant("mobile", manifest.mobile);
if (desktop.count !== mobile.count) throw new Error("Desktop/mobile counts do not match");
console.log(`Sequence valid: ${manifest.frameCount} frames at ${manifest.samplingFps} fps.`);
console.log(`Desktop ${formatBytes(desktop.size)}; mobile ${formatBytes(mobile.size)}.`);
