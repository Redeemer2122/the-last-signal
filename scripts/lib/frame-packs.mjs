import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { ensureDirectory, fromRoot, resetDirectory } from "./filesystem.mjs";
import { FRAME_PACK_COUNT, SEQUENCE_ID } from "./manifest.mjs";

export const FRAME_PACK_MAGIC = "TLSFPK01";
export const FRAME_PACK_VERSION = 1;
export const FRAME_PACK_HEADER_SIZE = 20;
export const FRAME_PACK_ENTRY_SIZE = 8;

function packName(index) {
  return `pack-${String(index).padStart(3, "0")}.tlsp`;
}

export async function buildFramePacks(frameCount) {
  const sequenceDirectory = fromRoot("public", "sequences", SEQUENCE_ID);
  const packsDirectory = path.join(sequenceDirectory, "packs");
  await resetDirectory(packsDirectory);

  const framesPerPack = Math.ceil(frameCount / FRAME_PACK_COUNT);
  const results = {};

  for (const variant of ["desktop", "mobile"]) {
    const sourceDirectory = path.join(sequenceDirectory, variant);
    const targetDirectory = path.join(packsDirectory, variant);
    await ensureDirectory(targetDirectory);
    const frameFiles = (await readdir(sourceDirectory))
      .filter((name) => /^frame-\d{4}\.webp$/.test(name))
      .sort();

    if (frameFiles.length !== frameCount) {
      throw new Error(`${variant}: expected ${frameCount} source frames, found ${frameFiles.length}`);
    }

    const packFiles = [];
    for (let packIndex = 0; packIndex < FRAME_PACK_COUNT; packIndex += 1) {
      const startOffset = packIndex * framesPerPack;
      const files = frameFiles.slice(startOffset, startOffset + framesPerPack);
      if (!files.length) continue;

      const frameBuffers = await Promise.all(files.map((file) => readFile(path.join(sourceDirectory, file))));
      const header = Buffer.alloc(FRAME_PACK_HEADER_SIZE + frameBuffers.length * FRAME_PACK_ENTRY_SIZE);
      header.write(FRAME_PACK_MAGIC, 0, "ascii");
      header.writeUInt32LE(FRAME_PACK_VERSION, 8);
      header.writeUInt32LE(startOffset + 1, 12);
      header.writeUInt32LE(frameBuffers.length, 16);

      let byteOffset = header.length;
      for (const [index, frame] of frameBuffers.entries()) {
        const entryOffset = FRAME_PACK_HEADER_SIZE + index * FRAME_PACK_ENTRY_SIZE;
        header.writeUInt32LE(byteOffset, entryOffset);
        header.writeUInt32LE(frame.length, entryOffset + 4);
        byteOffset += frame.length;
      }

      const fileName = packName(packIndex + 1);
      const output = Buffer.concat([header, ...frameBuffers], byteOffset);
      await writeFile(path.join(targetDirectory, fileName), output);
      packFiles.push({ fileName, byteLength: output.length, frameCount: frameBuffers.length });
    }
    results[variant] = packFiles;
  }

  return results;
}

export function parseFramePack(buffer) {
  if (buffer.length < FRAME_PACK_HEADER_SIZE) throw new Error("Frame pack header is truncated");
  if (buffer.toString("ascii", 0, 8) !== FRAME_PACK_MAGIC) throw new Error("Frame pack magic is invalid");
  if (buffer.readUInt32LE(8) !== FRAME_PACK_VERSION) throw new Error("Frame pack version is unsupported");

  const startFrame = buffer.readUInt32LE(12);
  const frameCount = buffer.readUInt32LE(16);
  const tableEnd = FRAME_PACK_HEADER_SIZE + frameCount * FRAME_PACK_ENTRY_SIZE;
  if (tableEnd > buffer.length) throw new Error("Frame pack table is truncated");

  const entries = [];
  for (let index = 0; index < frameCount; index += 1) {
    const entryOffset = FRAME_PACK_HEADER_SIZE + index * FRAME_PACK_ENTRY_SIZE;
    const offset = buffer.readUInt32LE(entryOffset);
    const length = buffer.readUInt32LE(entryOffset + 4);
    if (offset < tableEnd || length === 0 || offset + length > buffer.length) {
      throw new Error(`Frame pack entry ${index + 1} is invalid`);
    }
    entries.push({ frameIndex: startFrame + index, offset, length });
  }

  return { startFrame, frameCount, entries };
}
