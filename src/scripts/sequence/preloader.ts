import type { SequenceVariant } from "./types";

type ProgressListener = (loaded: number, failed: number) => void;

export interface FrameResource {
  source: CanvasImageSource;
  width: number;
  height: number;
  close?: () => void;
}

export interface FrameCandidate {
  frameIndex: number;
  resource: FrameResource;
  exact: boolean;
}

interface PreloaderOptions {
  cacheKey: string;
  concurrency: number;
  cacheSize: number;
  behindWindow: number;
  aheadWindow: number;
}

interface FrameTask {
  frameIndex: number;
  priority: number;
  basePriority: number;
  distance: number;
  directionMatch: boolean;
  order: number;
}

interface DeferredFrame {
  promise: Promise<FrameResource | null>;
  resolve: (resource: FrameResource | null) => void;
}

const PRIORITY_EXACT = 0;
const PRIORITY_WINDOW = 1;

export const FRAME_PRIORITY = {
  runway: 2,
  chapter: 3,
  background: 4,
} as const;

export function versionedAssetUrl(url: string, cacheKey: string) {
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}v=${encodeURIComponent(cacheKey)}`;
}

export class SequencePreloader {
  private cache = new Map<number, FrameResource>();
  private queue = new Map<number, FrameTask>();
  private inFlight = new Set<number>();
  private deferred = new Map<number, DeferredFrame>();
  private progressListeners = new Set<ProgressListener>();
  private loadedFrames = new Set<number>();
  private failedFrames = new Set<number>();
  private failureCounts = new Map<number, number>();
  private protectedFrames = new Set<number>();
  private targetFrame = 1;
  private taskOrder = 0;
  private destroyed = false;

  constructor(
    private variant: SequenceVariant,
    private frameCount: number,
    private options: PreloaderOptions,
  ) {}

  get loaded() {
    return this.loadedFrames.size;
  }

  get failed() {
    return this.failedFrames.size;
  }

  onProgress(listener: ProgressListener) {
    this.progressListeners.add(listener);
    return () => this.progressListeners.delete(listener);
  }

  getCandidate(index: number): FrameCandidate | undefined {
    const target = this.clamp(index);
    const exact = this.take(target);
    if (exact) return { frameIndex: target, resource: exact, exact: true };

    for (let offset = 1; offset < this.frameCount; offset += 1) {
      const before = target - offset;
      const after = target + offset;
      const beforeResource = before >= 1 ? this.take(before) : undefined;
      if (beforeResource) return { frameIndex: before, resource: beforeResource, exact: false };
      const afterResource = after <= this.frameCount ? this.take(after) : undefined;
      if (afterResource) return { frameIndex: after, resource: afterResource, exact: false };
    }
    return undefined;
  }

  prioritize(index: number) {
    const target = this.clamp(index);
    const direction = Math.sign(target - this.targetFrame);
    this.targetFrame = target;

    const before = direction < 0 ? this.options.aheadWindow : this.options.behindWindow;
    const after = direction < 0 ? this.options.behindWindow : this.options.aheadWindow;
    const windowFrames = this.range(target - before, target + after);
    this.protectedFrames = new Set(windowFrames);

    for (const task of this.queue.values()) {
      if (task.priority <= PRIORITY_WINDOW && !this.protectedFrames.has(task.frameIndex)) {
        task.priority = task.basePriority;
      }
    }

    void this.enqueue(target, PRIORITY_EXACT, 0, true, false);
    for (const frame of windowFrames) {
      if (frame === target) continue;
      const delta = frame - target;
      const directionMatch = direction === 0 || Math.sign(delta) === direction;
      void this.enqueue(frame, PRIORITY_WINDOW, Math.abs(delta), directionMatch, false);
    }

    this.evict();
  }

  async preloadRange(start: number, end: number, priority = FRAME_PRIORITY.runway) {
    const anchor = this.clamp(start);
    const tasks = this.range(start, end).map((frame) =>
      this.enqueue(frame, priority, Math.abs(frame - anchor), frame >= anchor, true),
    );
    await Promise.all(tasks);
  }

  async preloadFrames(indices: number[], priority = FRAME_PRIORITY.chapter) {
    const tasks = [...new Set(indices.map((index) => this.clamp(index)))].map((frame) =>
      this.enqueue(frame, priority, Math.abs(frame - this.targetFrame), frame >= this.targetFrame, true),
    );
    await Promise.all(tasks);
  }

  async ensureWindow(index: number, before: number, after: number) {
    const target = this.clamp(index);
    const tasks = this.range(target - before, target + after).map((frame) =>
      this.enqueue(frame, frame === target ? PRIORITY_EXACT : PRIORITY_WINDOW, Math.abs(frame - target), frame >= target, true),
    );
    await Promise.all(tasks);
  }

  destroy() {
    this.destroyed = true;
    this.queue.clear();
    this.progressListeners.clear();
    for (const deferred of this.deferred.values()) deferred.resolve(null);
    this.deferred.clear();
    for (const resource of this.cache.values()) resource.close?.();
    this.cache.clear();
  }

  private enqueue(frameIndex: number, priority: number, distance: number, directionMatch: boolean, persistent: boolean) {
    const frame = this.clamp(frameIndex);
    const cached = this.take(frame);
    if (cached) return Promise.resolve(cached);
    const failureCount = this.failureCounts.get(frame) ?? 0;
    if (failureCount >= 2 || (failureCount > 0 && priority > PRIORITY_WINDOW)) {
      return Promise.resolve(null);
    }

    let deferred = this.deferred.get(frame);
    if (!deferred) {
      let resolve!: (resource: FrameResource | null) => void;
      const promise = new Promise<FrameResource | null>((complete) => { resolve = complete; });
      deferred = { promise, resolve };
      this.deferred.set(frame, deferred);
    }

    const queued = this.queue.get(frame);
    if (queued) {
      if (persistent) queued.basePriority = Math.min(queued.basePriority, priority);
      if (priority < queued.priority) queued.priority = priority;
      queued.distance = Math.min(queued.distance, distance);
      queued.directionMatch ||= directionMatch;
    } else if (!this.inFlight.has(frame)) {
      this.queue.set(frame, {
        frameIndex: frame,
        priority,
        basePriority: persistent ? priority : FRAME_PRIORITY.background,
        distance,
        directionMatch,
        order: this.taskOrder++,
      });
    }

    this.pump();
    return deferred.promise;
  }

  private pump() {
    if (this.destroyed) return;
    while (this.inFlight.size < this.options.concurrency && this.queue.size) {
      const task = this.nextTask();
      if (!task) return;
      this.queue.delete(task.frameIndex);
      this.inFlight.add(task.frameIndex);
      void this.runTask(task);
    }
  }

  private nextTask() {
    return [...this.queue.values()].sort((a, b) =>
      a.priority - b.priority
      || Number(b.directionMatch) - Number(a.directionMatch)
      || a.distance - b.distance
      || a.order - b.order,
    )[0];
  }

  private async runTask(task: FrameTask) {
    let resource: FrameResource | null = null;
    try {
      resource = await this.decodeWithRetry(task.frameIndex, task.priority <= PRIORITY_WINDOW ? 1 : 0);
      if (resource && !this.destroyed) {
        this.failedFrames.delete(task.frameIndex);
        this.failureCounts.delete(task.frameIndex);
        this.loadedFrames.add(task.frameIndex);
        this.store(task.frameIndex, resource);
      } else if (resource) {
        resource.close?.();
        resource = null;
      }
    } catch {
      this.failedFrames.add(task.frameIndex);
      this.failureCounts.set(task.frameIndex, (this.failureCounts.get(task.frameIndex) ?? 0) + 1);
      if (import.meta.env.DEV) console.warn(`Sequence frame failed: ${this.frameUrl(task.frameIndex)}`);
    } finally {
      this.inFlight.delete(task.frameIndex);
      const deferred = this.deferred.get(task.frameIndex);
      this.deferred.delete(task.frameIndex);
      deferred?.resolve(resource);
      this.emitProgress();
      this.pump();
    }
  }

  private async decodeWithRetry(frameIndex: number, retries: number) {
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      try {
        return await this.decode(frameIndex);
      } catch (error) {
        if (attempt === retries) throw error;
      }
    }
    return null;
  }

  private async decode(frameIndex: number): Promise<FrameResource> {
    const url = this.frameUrl(frameIndex);
    if (typeof createImageBitmap === "function") {
      const response = await fetch(url, { cache: "force-cache" });
      if (!response.ok) throw new Error(`Frame request returned ${response.status}`);
      const bitmap = await createImageBitmap(await response.blob());
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        close: () => bitmap.close(),
      };
    }

    const image = new Image();
    image.decoding = "async";
    image.src = url;
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("Image decode failed"));
    });
    try { await image.decode(); } catch { /* onload guarantees a drawable image. */ }
    return { source: image, width: image.naturalWidth, height: image.naturalHeight };
  }

  private store(frameIndex: number, resource: FrameResource) {
    const previous = this.cache.get(frameIndex);
    if (previous && previous !== resource) previous.close?.();
    this.cache.delete(frameIndex);
    this.cache.set(frameIndex, resource);
    this.evict();
  }

  private take(frameIndex: number) {
    const resource = this.cache.get(frameIndex);
    if (!resource) return undefined;
    this.cache.delete(frameIndex);
    this.cache.set(frameIndex, resource);
    return resource;
  }

  private evict() {
    while (this.cache.size > this.options.cacheSize) {
      let candidate: number | undefined;
      for (const frame of this.cache.keys()) {
        if (!this.protectedFrames.has(frame)) {
          candidate = frame;
          break;
        }
      }
      if (candidate === undefined) return;
      const resource = this.cache.get(candidate);
      this.cache.delete(candidate);
      resource?.close?.();
    }
  }

  private frameUrl(index: number) {
    const path = this.variant.path.replace("{frame}", String(index).padStart(4, "0"));
    return versionedAssetUrl(path, this.options.cacheKey);
  }

  private range(start: number, end: number) {
    const first = this.clamp(Math.min(start, end));
    const last = this.clamp(Math.max(start, end));
    return Array.from({ length: last - first + 1 }, (_, offset) => first + offset);
  }

  private clamp(index: number) {
    return Math.max(1, Math.min(this.frameCount, Math.round(index)));
  }

  private emitProgress() {
    for (const listener of this.progressListeners) listener(this.loaded, this.failed);
  }
}
