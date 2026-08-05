import type { SequenceVariant } from "./types";

type ProgressListener = (loaded: number, failed: number) => void;

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
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}v=${encodeURIComponent(cacheKey)}`;
}

export class SequencePreloader {
  private frames: Array<HTMLImageElement | undefined>;
  private progressListeners = new Set<ProgressListener>();
  private preloadPromise?: Promise<{ loaded: number; failed: number }>;
  private nextFrame = 1;
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

  preloadAll() {
    if (this.preloadPromise) return this.preloadPromise;

    const workerCount = Math.min(this.options.concurrency, this.frameCount);
    this.preloadPromise = Promise.all(
      Array.from({ length: workerCount }, () => this.runWorker()),
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
    this.frames.length = 0;
  }

  private async runWorker() {
    while (!this.destroyed) {
      const frameIndex = this.nextFrame;
      this.nextFrame += 1;
      if (frameIndex > this.frameCount) return;

      const image = await this.loadWithRetry(frameIndex);
      if (this.destroyed) return;

      if (image) {
        this.frames[frameIndex] = image;
        this.loadedFrames += 1;
      } else {
        this.failedFrames += 1;
      }
      this.emitProgress();
    }
  }

  private async loadWithRetry(frameIndex: number) {
    for (let attempt = 0; attempt < this.options.retryAttempts; attempt += 1) {
      try {
        return await this.load(frameIndex);
      } catch {
        if (attempt + 1 === this.options.retryAttempts && import.meta.env.DEV) {
          console.warn(`Sequence frame failed: ${this.frameUrl(frameIndex)}`);
        }
      }
    }
    return undefined;
  }

  private load(frameIndex: number) {
    return new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.decoding = "async";
      image.fetchPriority = frameIndex <= 24 ? "high" : "auto";
      image.onload = () => {
        image.onload = null;
        image.onerror = null;
        resolve(image);
      };
      image.onerror = () => {
        image.onload = null;
        image.onerror = null;
        reject(new Error("Image load failed"));
      };
      image.src = this.frameUrl(frameIndex);
    });
  }

  private frameUrl(index: number) {
    const path = this.variant.path.replace("{frame}", String(index).padStart(4, "0"));
    return versionedAssetUrl(path, this.options.cacheKey);
  }

  private clamp(index: number) {
    return Math.max(1, Math.min(this.frameCount, Math.round(index)));
  }

  private emitProgress() {
    for (const listener of this.progressListeners) {
      listener(this.loadedFrames, this.failedFrames);
    }
  }
}
