import type { SequenceVariant } from "./types";

type ProgressListener = (loaded: number, failed: number) => void;

export class SequencePreloader {
  private cache = new Map<number, HTMLImageElement>();
  private requests = new Map<number, Promise<HTMLImageElement | null>>();
  private progressListeners = new Set<ProgressListener>();
  loaded = 0;
  failed = 0;

  constructor(private variant: SequenceVariant, private frameCount: number) {}

  onProgress(listener: ProgressListener) {
    this.progressListeners.add(listener);
    return () => this.progressListeners.delete(listener);
  }

  get(index: number) {
    return this.cache.get(this.clamp(index));
  }

  getNearest(index: number) {
    const target = this.clamp(index);
    if (this.cache.has(target)) return this.cache.get(target);
    for (let offset = 1; offset < this.frameCount; offset += 1) {
      const before = target - offset;
      const after = target + offset;
      if (before >= 1 && this.cache.has(before)) return this.cache.get(before);
      if (after <= this.frameCount && this.cache.has(after)) return this.cache.get(after);
    }
    return undefined;
  }

  async load(index: number): Promise<HTMLImageElement | null> {
    const frame = this.clamp(index);
    const cached = this.cache.get(frame);
    if (cached) return cached;
    const existing = this.requests.get(frame);
    if (existing) return existing;

    const request = new Promise<HTMLImageElement | null>((resolve) => {
      const image = new Image();
      image.decoding = "async";
      image.onload = async () => {
        try { await image.decode(); } catch { /* onload still guarantees a drawable image. */ }
        this.cache.set(frame, image);
        this.loaded += 1;
        this.emitProgress();
        resolve(image);
      };
      image.onerror = () => {
        this.failed += 1;
        this.emitProgress();
        if (import.meta.env.DEV) console.warn(`Sequence frame failed: ${image.src}`);
        resolve(null);
      };
      image.src = this.frameUrl(frame);
    });
    this.requests.set(frame, request);
    return request;
  }

  async loadMany(indices: number[], concurrency: number) {
    const queue = [...new Set(indices.map((index) => this.clamp(index)))];
    const workers = Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
      while (queue.length) {
        const next = queue.shift();
        if (next !== undefined) await this.load(next);
      }
    });
    await Promise.all(workers);
  }

  private frameUrl(index: number) {
    return this.variant.path.replace("{frame}", String(index).padStart(4, "0"));
  }

  private clamp(index: number) {
    return Math.max(1, Math.min(this.frameCount, Math.round(index)));
  }

  private emitProgress() {
    for (const listener of this.progressListeners) listener(this.loaded, this.failed);
  }
}
