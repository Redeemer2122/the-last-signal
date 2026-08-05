import type { SequenceVariant } from "./types";

type ProgressListener = (loaded: number, failed: number) => void;
type TransferListener = (loadedBytes: number, totalBytes: number) => void;

export interface FrameResource {
  source: CanvasImageSource;
  width: number;
  height: number;
}

export interface FrameCandidate {
  frameIndex: number;
  resource: FrameResource;
  exact: true;
}

interface PreloaderOptions {
  cacheKey: string;
  retryAttempts: number;
}

interface PackEntry {
  frameIndex: number;
  offset: number;
  length: number;
}

interface PackTransfer {
  loaded: number;
  total: number;
}

const PACK_MAGIC = "TLSFPK01";
const PACK_VERSION = 1;
const PACK_HEADER_SIZE = 20;
const PACK_ENTRY_SIZE = 8;
const DECODE_WORKERS_PER_PACK = 16;

export function versionedAssetUrl(url: string, cacheKey: string) {
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}v=${encodeURIComponent(cacheKey)}`;
}

export class SequencePreloader {
  private frames: Array<HTMLImageElement | undefined>;
  private progressListeners = new Set<ProgressListener>();
  private transferListeners = new Set<TransferListener>();
  private transfers = new Map<number, PackTransfer>();
  private controllers = new Set<AbortController>();
  private preloadPromise?: Promise<{ loaded: number; failed: number }>;
  private loadedFrames = 0;
  private failedFrames = 0;
  private destroyed = false;

  constructor(
    private variant: SequenceVariant,
    private frameCount: number,
    private options: PreloaderOptions,
  ) {
    this.frames = new Array(frameCount + 1);
  }

  onProgress(listener: ProgressListener) {
    this.progressListeners.add(listener);
    return () => this.progressListeners.delete(listener);
  }

  onTransfer(listener: TransferListener) {
    this.transferListeners.add(listener);
    return () => this.transferListeners.delete(listener);
  }

  preloadAll() {
    if (this.preloadPromise) return this.preloadPromise;

    this.preloadPromise = Promise.all(
      Array.from({ length: this.variant.packCount }, (_, index) => this.loadPackWithRetry(index + 1)),
    ).then(() => ({ loaded: this.loadedFrames, failed: this.failedFrames }));

    return this.preloadPromise;
  }

  getExact(index: number): FrameCandidate | undefined {
    const frameIndex = this.clamp(index);
    const image = this.frames[frameIndex];
    if (!image?.complete || !image.naturalWidth) return undefined;

    return {
      frameIndex,
      resource: {
        source: image,
        width: image.naturalWidth,
        height: image.naturalHeight,
      },
      exact: true,
    };
  }

  destroy() {
    this.destroyed = true;
    this.progressListeners.clear();
    this.transferListeners.clear();
    for (const controller of this.controllers) controller.abort();
    this.controllers.clear();
    this.frames.length = 0;
  }

  private async loadPackWithRetry(packIndex: number) {
    for (let attempt = 0; attempt < this.options.retryAttempts; attempt += 1) {
      try {
        const buffer = await this.fetchPack(packIndex);
        if (this.destroyed) return;
        await this.decodePack(buffer, packIndex);
        return;
      } catch (error) {
        if (this.destroyed) return;
        if (attempt + 1 === this.options.retryAttempts) {
          this.markPackFailed(packIndex);
          console.error(`Sequence pack failed: ${this.packUrl(packIndex)}`, error);
          return;
        }
      }
    }
  }

  private async fetchPack(packIndex: number) {
    const controller = new AbortController();
    this.controllers.add(controller);
    try {
      const response = await fetch(this.packUrl(packIndex), {
        cache: "force-cache",
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`Frame pack request returned ${response.status}`);

      const contentLength = Number(response.headers.get("content-length")) || 0;
      if (!response.body) {
        const buffer = await response.arrayBuffer();
        this.updateTransfer(packIndex, buffer.byteLength, buffer.byteLength);
        return buffer;
      }

      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let loaded = 0;
      this.updateTransfer(packIndex, 0, contentLength);
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        loaded += value.byteLength;
        if (contentLength) this.updateTransfer(packIndex, loaded, contentLength);
      }

      const bytes = new Uint8Array(loaded);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
      }
      this.updateTransfer(packIndex, loaded, contentLength || loaded);
      return bytes.buffer;
    } finally {
      this.controllers.delete(controller);
    }
  }

  private async decodePack(buffer: ArrayBuffer, packIndex: number) {
    const entries = this.parsePack(buffer, packIndex);
    let nextEntry = 0;
    const workerCount = Math.min(DECODE_WORKERS_PER_PACK, entries.length);

    await Promise.all(Array.from({ length: workerCount }, async () => {
      while (!this.destroyed) {
        const entry = entries[nextEntry];
        nextEntry += 1;
        if (!entry) return;

        const image = await this.decodeFrame(buffer, entry);
        if (this.destroyed) return;
        if (image) {
          if (!this.frames[entry.frameIndex]) {
            this.frames[entry.frameIndex] = image;
            this.loadedFrames += 1;
          }
        } else {
          this.failedFrames += 1;
        }
        this.emitProgress();
      }
    }));
  }

  private parsePack(buffer: ArrayBuffer, packIndex: number) {
    if (buffer.byteLength < PACK_HEADER_SIZE) throw new Error("Frame pack header is truncated");
    const bytes = new Uint8Array(buffer);
    const magic = String.fromCharCode(...bytes.subarray(0, 8));
    if (magic !== PACK_MAGIC) throw new Error("Frame pack magic is invalid");

    const view = new DataView(buffer);
    if (view.getUint32(8, true) !== PACK_VERSION) throw new Error("Frame pack version is unsupported");

    const startFrame = view.getUint32(12, true);
    const packFrameCount = view.getUint32(16, true);
    const framesPerPack = Math.ceil(this.frameCount / this.variant.packCount);
    const expectedStart = (packIndex - 1) * framesPerPack + 1;
    const expectedCount = Math.min(framesPerPack, this.frameCount - expectedStart + 1);
    if (startFrame !== expectedStart || packFrameCount !== expectedCount) {
      throw new Error(`Frame pack ${packIndex} has an unexpected frame range`);
    }

    const tableEnd = PACK_HEADER_SIZE + packFrameCount * PACK_ENTRY_SIZE;
    if (tableEnd > buffer.byteLength) throw new Error("Frame pack table is truncated");

    const entries: PackEntry[] = [];
    for (let index = 0; index < packFrameCount; index += 1) {
      const entryOffset = PACK_HEADER_SIZE + index * PACK_ENTRY_SIZE;
      const offset = view.getUint32(entryOffset, true);
      const length = view.getUint32(entryOffset + 4, true);
      if (offset < tableEnd || length === 0 || offset + length > buffer.byteLength) {
        throw new Error(`Frame pack entry ${index + 1} is invalid`);
      }
      entries.push({ frameIndex: startFrame + index, offset, length });
    }
    return entries;
  }

  private async decodeFrame(buffer: ArrayBuffer, entry: PackEntry) {
    const frameBytes = new Uint8Array(buffer, entry.offset, entry.length);
    for (let attempt = 0; attempt < this.options.retryAttempts; attempt += 1) {
      const objectUrl = URL.createObjectURL(new Blob([frameBytes], { type: "image/webp" }));
      try {
        const image = await this.loadImage(objectUrl);
        return image;
      } catch {
        if (attempt + 1 === this.options.retryAttempts && import.meta.env.DEV) {
          console.warn(`Packed sequence frame failed: ${entry.frameIndex}`);
        }
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
    }
    return undefined;
  }

  private loadImage(url: string) {
    return new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.decoding = "async";
      image.onload = () => {
        image.onload = null;
        image.onerror = null;
        resolve(image);
      };
      image.onerror = () => {
        image.onload = null;
        image.onerror = null;
        reject(new Error("Packed image decode failed"));
      };
      image.src = url;
    });
  }

  private markPackFailed(packIndex: number) {
    const framesPerPack = Math.ceil(this.frameCount / this.variant.packCount);
    const startFrame = (packIndex - 1) * framesPerPack + 1;
    const count = Math.max(0, Math.min(framesPerPack, this.frameCount - startFrame + 1));
    this.failedFrames += count;
    this.emitProgress();
  }

  private packUrl(index: number) {
    const path = this.variant.packPath.replace("{pack}", String(index).padStart(3, "0"));
    return versionedAssetUrl(path, this.options.cacheKey);
  }

  private clamp(index: number) {
    return Math.max(1, Math.min(this.frameCount, Math.round(index)));
  }

  private updateTransfer(packIndex: number, loaded: number, total: number) {
    this.transfers.set(packIndex, { loaded, total });
    let completedPacks = 0;
    for (let index = 1; index <= this.variant.packCount; index += 1) {
      const transfer = this.transfers.get(index);
      if (transfer?.total) completedPacks += Math.min(1, transfer.loaded / transfer.total);
    }
    for (const listener of this.transferListeners) listener(completedPacks, this.variant.packCount);
  }

  private emitProgress() {
    for (const listener of this.progressListeners) {
      listener(this.loadedFrames, this.failedFrames);
    }
  }
}
