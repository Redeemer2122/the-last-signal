import type { SequenceVariant } from "./types";

type ProgressListener = (loaded: number, failed: number) => void;
type TransferListener = (loaded: number, total: number) => void;

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
  concurrency: number;
  retryAttempts: number;
}

export function versionedAssetUrl(url: string, cacheKey: string) {
  if (url.startsWith("https://cdn.jsdelivr.net/gh/")) return url;
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}v=${encodeURIComponent(cacheKey)}`;
}

export class SequencePreloader {
  private frames: Array<HTMLImageElement | undefined>;
  private progressListeners = new Set<ProgressListener>();
  private transferListeners = new Set<TransferListener>();
  private controllers = new Set<AbortController>();
  private transferredFrames = new Set<number>();
  private preloadPromise?: Promise<{ loaded: number; failed: number }>;
  private loadedFrames = 0;
  private failedFrames = 0;
  private nextFrame = 1;
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

    const workerCount = Math.min(this.options.concurrency, this.frameCount);
    this.preloadPromise = Promise.all(Array.from({ length: workerCount }, () => this.loadNext()))
      .then(() => ({ loaded: this.loadedFrames, failed: this.failedFrames }));

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

  private async loadNext(): Promise<void> {
    while (!this.destroyed) {
      const frameIndex = this.nextFrame;
      this.nextFrame += 1;
      if (frameIndex > this.frameCount) return;

      const image = await this.loadFrameWithRetry(frameIndex);
      if (this.destroyed) return;
      if (image) {
        this.frames[frameIndex] = image;
        this.loadedFrames += 1;
      } else {
        this.failedFrames += 1;
        console.error(`Sequence frame failed: ${this.frameUrl(frameIndex)}`);
      }
      this.emitProgress();
    }
  }

  private async loadFrameWithRetry(frameIndex: number) {
    for (let attempt = 0; attempt < this.options.retryAttempts; attempt += 1) {
      const controller = new AbortController();
      this.controllers.add(controller);
      let objectUrl: string | undefined;
      try {
        const response = await fetch(this.frameUrl(frameIndex), {
          cache: "force-cache",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`Frame request returned ${response.status}`);

        const blob = await response.blob();
        this.markTransferred(frameIndex);
        objectUrl = URL.createObjectURL(blob);
        return await this.loadImage(objectUrl);
      } catch (error) {
        if (this.destroyed) return undefined;
        if (attempt + 1 === this.options.retryAttempts && import.meta.env.DEV) {
          console.warn(`Sequence frame ${frameIndex} failed`, error);
        }
      } finally {
        this.controllers.delete(controller);
        if (objectUrl) URL.revokeObjectURL(objectUrl);
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
        reject(new Error("Sequence image decode failed"));
      };
      image.src = url;
    });
  }

  private frameUrl(index: number) {
    const path = this.variant.path.replace("{frame}", String(index).padStart(4, "0"));
    return versionedAssetUrl(path, this.options.cacheKey);
  }

  private clamp(index: number) {
    return Math.max(1, Math.min(this.frameCount, Math.round(index)));
  }

  private markTransferred(frameIndex: number) {
    if (this.transferredFrames.has(frameIndex)) return;
    this.transferredFrames.add(frameIndex);
    for (const listener of this.transferListeners) {
      listener(this.transferredFrames.size, this.frameCount);
    }
  }

  private emitProgress() {
    for (const listener of this.progressListeners) {
      listener(this.loadedFrames, this.failedFrames);
    }
  }
}
