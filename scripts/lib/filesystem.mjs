import { mkdir, readdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));

export const fromRoot = (...parts) => path.join(ROOT, ...parts);

export async function ensureDirectory(directory) {
  await mkdir(directory, { recursive: true });
}

export async function resetDirectory(directory) {
  const relative = path.relative(ROOT, directory);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Refusing to reset directory outside the repository: ${directory}`);
  }
  await rm(directory, { recursive: true, force: true });
  await ensureDirectory(directory);
}

export async function fileExists(file) {
  try {
    return (await stat(file)).isFile();
  } catch {
    return false;
  }
}

export async function directorySize(directory) {
  let total = 0;
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    total += entry.isDirectory() ? await directorySize(target) : (await stat(target)).size;
  }
  return total;
}

export function formatBytes(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}
