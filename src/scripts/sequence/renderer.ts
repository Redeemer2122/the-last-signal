import type { FrameResource, SequencePreloader } from "./preloader";

export class CanvasSequenceRenderer {
  private context: CanvasRenderingContext2D;
  private poster?: FrameResource;
  private requestedFrame = 1;
  private displayedFrame = -1;
  private raf = 0;

  constructor(
    private canvas: HTMLCanvasElement,
    private preloader: SequencePreloader,
  ) {
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("Canvas 2D context is unavailable");
    this.context = context;
  }

  async setPoster(url: string) {
    const image = new Image();
    image.decoding = "async";
    image.src = url;
    await new Promise<void>((resolve) => {
      image.onload = () => resolve();
      image.onerror = () => resolve();
    });
    if (image.complete && image.naturalWidth) {
      this.poster = { source: image, width: image.naturalWidth, height: image.naturalHeight };
    }
  }

  resize = () => {
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const backingWidth = Math.round(width * dpr);
    const backingHeight = Math.round(height * dpr);
    if (this.canvas.width !== backingWidth || this.canvas.height !== backingHeight) {
      this.canvas.width = backingWidth;
      this.canvas.height = backingHeight;
      this.displayedFrame = -1;
      this.request(this.requestedFrame);
    }
  };

  request(frame: number) {
    const requested = Math.round(frame);
    const changed = requested !== this.requestedFrame;
    this.requestedFrame = requested;
    this.canvas.dataset.requestedFrame = String(requested);
    if (changed || !this.preloader.getCandidate(requested)?.exact) {
      this.preloader.prioritize(requested);
    }
    this.scheduleRender();
  }

  destroy() {
    cancelAnimationFrame(this.raf);
  }

  private scheduleRender() {
    if (this.raf) return;
    this.raf = requestAnimationFrame(() => {
      this.raf = 0;
      const candidate = this.preloader.getCandidate(this.requestedFrame);
      if (candidate) {
        if (candidate.frameIndex === this.displayedFrame) return;
        this.drawCover(candidate.resource);
        this.displayedFrame = candidate.frameIndex;
        this.canvas.dataset.displayedFrame = String(candidate.frameIndex);
        return;
      }
      if (this.poster && this.displayedFrame !== 0) {
        this.drawCover(this.poster);
        this.displayedFrame = 0;
        this.canvas.dataset.displayedFrame = "poster";
      }
    });
  }

  private drawCover(resource: FrameResource) {
    const canvasWidth = this.canvas.width;
    const canvasHeight = this.canvas.height;
    const scale = Math.max(canvasWidth / resource.width, canvasHeight / resource.height);
    const width = resource.width * scale;
    const height = resource.height * scale;
    this.context.drawImage(resource.source, (canvasWidth - width) / 2, (canvasHeight - height) / 2, width, height);
  }
}
