import { detectCapabilities } from "./capabilities";
import { SEQUENCE_CONFIG } from "./config";
import { createLenis } from "./lenis";
import { SequencePreloader } from "./preloader";
import { CanvasSequenceRenderer } from "./renderer";
import { createSequenceTimeline } from "./timeline";
import type { SequenceManifest } from "./types";

async function initialize(stage: HTMLElement) {
  const loader = stage.querySelector<HTMLElement>("[data-sequence-loader]");
  const loaderCount = stage.querySelector<HTMLElement>("[data-loader-count]");
  const viewport = stage.querySelector<HTMLElement>("[data-sequence-viewport]");
  const canvas = stage.querySelector<HTMLCanvasElement>("canvas");
  const capability = detectCapabilities();
  stage.dataset.mode = capability.fullMotion ? "loading" : "fallback";
  stage.dataset.fallbackReason = capability.reason;
  if (!capability.fullMotion || !viewport || !canvas) return;

  document.documentElement.classList.add("sequence-loading");

  let manifest: SequenceManifest;
  try {
    const response = await fetch(SEQUENCE_CONFIG.manifestUrl);
    if (!response.ok) throw new Error(`Manifest request returned ${response.status}`);
    manifest = await response.json() as SequenceManifest;
  } catch (error) {
    console.error("Sequence manifest unavailable", error);
    stage.dataset.mode = "fallback";
    document.documentElement.classList.remove("sequence-loading");
    if (loader) loader.hidden = true;
    return;
  }

  const mobile = window.matchMedia(SEQUENCE_CONFIG.mobileQuery).matches;
  const variant = mobile ? manifest.mobile : manifest.desktop;
  const poster = mobile ? manifest.poster.mobile : manifest.poster.desktop;
  const preloader = new SequencePreloader(variant, manifest.frameCount, {
    cacheKey: manifest.cacheKey,
    retryAttempts: SEQUENCE_CONFIG.retryAttempts,
  });
  const renderer = new CanvasSequenceRenderer(canvas, preloader);
  let currentFrame = 1;

  if (loaderCount) {
    loaderCount.textContent = `000 / ${String(manifest.frameCount).padStart(3, "0")}`;
  }

  await renderer.setPoster(poster);
  renderer.resize();
  renderer.request(1);

  let transferRatio = 0;
  let decodeRatio = 0;
  const updateLoaderProgress = () => {
    const percentage = Math.min(100, transferRatio * 80 + decodeRatio * 20);
    loader?.style.setProperty("--loader-progress", `${percentage}%`);
  };
  const removeTransferProgress = preloader.onTransfer((loadedBytes, totalBytes) => {
    transferRatio = totalBytes > 0 ? loadedBytes / totalBytes : 0;
    updateLoaderProgress();
  });
  const removeProgress = preloader.onProgress((loaded, failed) => {
    const complete = loaded + failed;
    decodeRatio = complete / manifest.frameCount;
    updateLoaderProgress();
    if (loaderCount) {
      loaderCount.textContent = `${String(complete).padStart(3, "0")} / ${String(manifest.frameCount).padStart(3, "0")}`;
    }
    if (loader) {
      loader.setAttribute("aria-label", `${loaded} of ${manifest.frameCount} sequence frames loaded${failed ? `, ${failed} failed` : ""}`);
    }
  });

  const result = await preloader.preloadAll();
  if (result.failed > 0) {
    console.error(`Sequence preload failed for ${result.failed} frame(s)`);
    stage.dataset.mode = "fallback";
    document.documentElement.classList.remove("sequence-loading");
    if (loader) loader.hidden = true;
    removeTransferProgress();
    removeProgress();
    renderer.destroy();
    preloader.destroy();
    return;
  }

  renderer.activate();
  renderer.request(currentFrame);
  stage.dataset.mode = "active";
  if (loader) loader.dataset.ready = "true";
  document.documentElement.classList.remove("sequence-loading");

  const lenis = createLenis();
  const destroyTimeline = createSequenceTimeline({
    stage,
    viewport,
    chapters: manifest.chapters,
    samplingFps: manifest.samplingFps,
    renderFrame(frame) {
      currentFrame = Math.round(frame);
      renderer.request(currentFrame);
      const progress = stage.querySelector<HTMLElement>("[data-frame-progress]");
      if (progress) progress.textContent = `${String(currentFrame).padStart(3, "0")} / ${String(manifest.frameCount).padStart(3, "0")}`;
    },
  });

  const recall = document.querySelector<HTMLElement>("[data-recall-signal]");
  const recallHandler = () => {
    const finalChapter = manifest.chapters.at(-1);
    if (!finalChapter) return;
    const distance = stage.offsetHeight - window.innerHeight;
    const target = stage.offsetTop + distance * (finalChapter.frameFocus / manifest.frameCount);
    lenis.instance.scrollTo(target, { duration: 1.8 });
  };
  const visibilityHandler = () => {
    if (document.hidden) lenis.instance.stop(); else lenis.instance.start();
  };

  recall?.addEventListener("click", recallHandler);
  window.addEventListener("resize", renderer.resize, { passive: true });
  document.addEventListener("visibilitychange", visibilityHandler);

  window.addEventListener("pagehide", () => {
    document.documentElement.classList.remove("sequence-loading");
    removeTransferProgress();
    removeProgress();
    recall?.removeEventListener("click", recallHandler);
    window.removeEventListener("resize", renderer.resize);
    document.removeEventListener("visibilitychange", visibilityHandler);
    destroyTimeline();
    lenis.destroy();
    renderer.destroy();
    preloader.destroy();
  }, { once: true });
}

for (const stage of document.querySelectorAll<HTMLElement>("[data-sequence]")) {
  void initialize(stage);
}
