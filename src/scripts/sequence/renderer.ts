import type { SequencePreloader } from "./preloader";

export class CanvasSequenceRenderer {
  private context: CanvasRenderingContext2D;
  private poster?: HTMLImageElement;
  private requestedFrame = 1;
  private renderedFrame = 0;
  private raf = 0;

  constructor(private canvas: HTMLCanvasElement, private preloader: SequencePreloader) {
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
    if (image.complete && image.naturalWidth) this.poster = image;
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
      this.renderedFrame = 0;
      this.request(this.requestedFrame);
    }
  };

  request(frame: number) {
    this.requestedFrame = Math.round(frame);
    if (this.raf) return;
    this.raf = requestAnimationFrame(() => {
      this.raf = 0;
      if (this.renderedFrame === this.requestedFrame) return;
      const image = this.preloader.get(this.requestedFrame) ?? this.preloader.getNearest(this.requestedFrame) ?? this.poster;
      if (image) {
        this.drawCover(image);
        this.renderedFrame = this.requestedFrame;
      }
    });
  }

  destroy() {
    cancelAnimationFrame(this.raf);
  }

  private drawCover(image: CanvasImageSource & { width: number; height: number }) {
    const canvasWidth = this.canvas.width;
    const canvasHeight = this.canvas.height;
    const scale = Math.max(canvasWidth / image.width, canvasHeight / image.height);
    const width = image.width * scale;
    const height = image.height * scale;
    this.context.drawImage(image, (canvasWidth - width) / 2, (canvasHeight - height) / 2, width, height);
  }
}
