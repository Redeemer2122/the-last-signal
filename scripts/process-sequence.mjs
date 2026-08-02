import { copyFile, readdir, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { assertFfmpeg, run } from "./lib/ffmpeg.mjs";
import { directorySize, ensureDirectory, fileExists, formatBytes, fromRoot, resetDirectory } from "./lib/filesystem.mjs";
import {
  buildManifest,
  FRAME_REMOVALS,
  FRAME_REPLACEMENTS,
  MASTER_DURATION,
  SAMPLE_FPS,
  SEQUENCE_ID,
  SOURCE_FILES,
  TRANSITION_04_START,
} from "./lib/manifest.mjs";

const { ffmpeg } = assertFfmpeg();
const sourceDirectory = fromRoot("source-assets", "video");
const outputDirectory = fromRoot("output");
const normalizedDirectory = path.join(outputDirectory, "normalized");
const masterDirectory = path.join(outputDirectory, "master");
const sequenceDirectory = fromRoot("public", "sequences", SEQUENCE_ID);
const desktopDirectory = path.join(sequenceDirectory, "desktop");
const mobileDirectory = path.join(sequenceDirectory, "mobile");
const postersDirectory = path.join(sequenceDirectory, "posters");

for (const name of SOURCE_FILES) {
  const source = path.join(sourceDirectory, name);
  if (!(await fileExists(source))) throw new Error(`Missing source video: ${source}`);
}

await resetDirectory(normalizedDirectory);
await resetDirectory(masterDirectory);
await resetDirectory(sequenceDirectory);
await ensureDirectory(desktopDirectory);
await ensureDirectory(mobileDirectory);
await ensureDirectory(postersDirectory);

const normalizedFiles = [];
for (const [index, name] of SOURCE_FILES.entries()) {
  const source = path.join(sourceDirectory, name);
  const target = path.join(normalizedDirectory, `transition-${String(index + 1).padStart(2, "0")}.mp4`);
  const args = ["-hide_banner", "-loglevel", "warning", "-y", "-i", source];
  args.push(
    "-map", "0:v:0", "-an",
    "-vf", "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,fps=24",
    "-c:v", "libx264", "-preset", "slow", "-crf", "15", "-pix_fmt", "yuv420p",
    "-movflags", "+faststart", target,
  );
  console.log(`Normalizing ${name}`);
  await run(ffmpeg, args);
  normalizedFiles.push(target);
}

const concatFile = path.join(normalizedDirectory, "concat.txt");
const concatText = normalizedFiles.map((file) => `file '${file.replaceAll("'", "'\\''")}'`).join("\n");
await writeFile(concatFile, `${concatText}\n`);
const masterFile = path.join(masterDirectory, `${SEQUENCE_ID}-master.mp4`);
await run(ffmpeg, [
  "-hide_banner", "-loglevel", "warning", "-y", "-f", "concat", "-safe", "0", "-i", concatFile,
  "-c", "copy", "-movflags", "+faststart", masterFile,
]);

console.log("Generating desktop WebP sequence");
await run(ffmpeg, [
  "-hide_banner", "-loglevel", "warning", "-y", "-i", masterFile,
  "-vf", `fps=${SAMPLE_FPS},scale=1920:1080:flags=lanczos`,
  "-c:v", "libwebp", "-quality", "38", "-compression_level", "6", "-start_number", "1",
  path.join(desktopDirectory, "frame-%04d.webp"),
]);

console.log("Generating mobile WebP sequence");
await run(ffmpeg, [
  "-hide_banner", "-loglevel", "warning", "-y", "-i", masterFile,
  "-vf", `fps=${SAMPLE_FPS},crop=864:1080:x='if(gte(t,${TRANSITION_04_START}),360,528)':y=0,scale=1080:1350:flags=lanczos`,
  "-c:v", "libwebp", "-quality", "18", "-compression_level", "6", "-start_number", "1",
  path.join(mobileDirectory, "frame-%04d.webp"),
]);

for (const { target, source } of FRAME_REPLACEMENTS) {
  const targetName = `frame-${String(target).padStart(4, "0")}.webp`;
  const sourceName = `frame-${String(source).padStart(4, "0")}.webp`;
  await copyFile(path.join(desktopDirectory, sourceName), path.join(desktopDirectory, targetName));
  await copyFile(path.join(mobileDirectory, sourceName), path.join(mobileDirectory, targetName));
}

async function removeAndCompactFrames(directory) {
  const frames = (await readdir(directory)).filter((name) => /^frame-\d{4}\.webp$/.test(name)).sort();
  for (const frame of FRAME_REMOVALS) {
    await unlink(path.join(directory, `frame-${String(frame).padStart(4, "0")}.webp`));
  }
  const remaining = frames.filter((name) => !FRAME_REMOVALS.some((frame) => name === `frame-${String(frame).padStart(4, "0")}.webp`));
  for (const [index, name] of remaining.entries()) {
    const target = `frame-${String(index + 1).padStart(4, "0")}.webp`;
    if (name !== target) await rename(path.join(directory, name), path.join(directory, target));
  }
}

await removeAndCompactFrames(desktopDirectory);
await removeAndCompactFrames(mobileDirectory);

const desktopFrames = (await readdir(desktopDirectory)).filter((name) => /^frame-\d{4}\.webp$/.test(name)).sort();
const mobileFrames = (await readdir(mobileDirectory)).filter((name) => /^frame-\d{4}\.webp$/.test(name)).sort();
if (!desktopFrames.length || desktopFrames.length !== mobileFrames.length) {
  throw new Error(`Generated frame count mismatch: desktop ${desktopFrames.length}, mobile ${mobileFrames.length}`);
}

await copyFile(path.join(desktopDirectory, desktopFrames[0]), path.join(postersDirectory, "poster-desktop.webp"));
await copyFile(path.join(mobileDirectory, mobileFrames[0]), path.join(postersDirectory, "poster-mobile.webp"));

const manifest = buildManifest(desktopFrames.length);
await writeFile(path.join(sequenceDirectory, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

const desktopSize = await directorySize(desktopDirectory);
const mobileSize = await directorySize(mobileDirectory);
const chapterRows = manifest.chapters.map((chapter) => `| ${chapter.id} | ${chapter.frameStart} | ${chapter.frameFocus} | ${chapter.frameEnd} |`).join("\n");
await ensureDirectory(fromRoot("docs"));
await writeFile(fromRoot("docs", "sequence-manifest.md"), `# Sequence manifest

Generated by \`npm run sequence:build\`.

- Master duration: ${MASTER_DURATION.toFixed(3)} seconds
- Sampling rate: ${SAMPLE_FPS} fps
- Frame count: ${manifest.frameCount}
- Desktop sequence: ${formatBytes(desktopSize)}
- Mobile sequence: ${formatBytes(mobileSize)}
- Desktop dimensions: 1920×1080
- Mobile dimensions: 1080×1350

| Chapter | Start | Focus | End |
| --- | ---: | ---: | ---: |
${chapterRows}

The mobile variant uses an 864×1080 source crop scaled to 1080×1350. It is centered for transitions 01–03, then shifts left from master time ${TRANSITION_04_START.toFixed(3)} seconds so the circular control-room display remains visible. Representative framing is checked during visual QA.

The source footage contains dense snow, fog, rain, and fine texture that compress poorly. WebP qualities 38 (desktop) and 18 (mobile) were selected after full-resolution A/B inspection to fit the requested transfer envelope without visible blocking at the intended viewport sizes.
`);

console.log(`Built ${manifest.frameCount} frames per variant.`);
console.log(`Desktop: ${formatBytes(desktopSize)}; mobile: ${formatBytes(mobileSize)}`);
