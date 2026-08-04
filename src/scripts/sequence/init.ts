import { detectCapabilities } from "./capabilities";
import { SEQUENCE_CONFIG } from "./config";
import { createLenis } from "./lenis";
import { FRAME_PRIORITY, SequencePreloader } from "./preloader";
import { CanvasSequenceRenderer } from "./renderer";
import { createSequenceTimeline } from "./timeline";
import type { SequenceManifest } from "./types";

function chapterPriority(manifest: SequenceManifest) {
  const frames = new Set<number>();
  for (const chapter of manifest.chapters) {
    for (let offset = -2; offset <= 2; offset += 1) frames.add(chapter.frameFocus + offset);
  }
  return [...frames].filter((frame) => frame >= 1 && frame <= manifest.frameCount);
}

async function initialize(stage: HTMLElement) {
  const loader = stage.querySelector<HTMLElement>("[data-sequence-loader]");
  const loaderCount = stage.querySelector<HTMLElement>("[data-loader-count]");
  const viewport = stage.querySelector<HTMLElement>("[data-sequence-viewport]");
  const canvas = stage.querySelector<HTMLCanvasElement>("canvas");
  const capability = detectCapabilities();
  stage.dataset.mode = capability.fullMotion ? "loading" : "fallback";
  stage.dataset.fallbackReason = capability.reason;
  if (!capability.fullMotion || !viewport || !canvas) return;

  let manifest: SequenceManifest;
  try {
    const response = await fetch(SEQUENCE_CONFIG.manifestUrl);
    if (!response.ok) throw new Error(`Manifest request returned ${response.status}`);
    manifest = await response.json() as SequenceManifest;
  } catch (error) {
    console.error("Sequence manifest unavailable", error);
    stage.dataset.mode = "fallback";
    if (loader) loader.hidden = true;
    return;
  }

  const mobile = window.matchMedia(SEQUENCE_CONFIG.mobileQuery).matches;
  const profile = mobile ? SEQUENCE_CONFIG.mobile : SEQUENCE_CONFIG.desktop;
  const variant = mobile ? manifest.mobile : manifest.desktop;
  const poster = mobile ? manifest.poster.mobile : manifest.poster.desktop;
  const preloader = new SequencePreloader(variant, manifest.frameCount, {
    cacheKey: manifest.cacheKey,
    concurrency: profile.preloadConcurrency,
    cacheSize: profile.cacheSize,
    behindWindow: profile.behindWindow,
    aheadWindow: profile.aheadWindow,
  });
  const renderer = new CanvasSequenceRenderer(canvas, preloader);
  let currentFrame = 1;

  await renderer.setPoster(poster);
  renderer.resize();
  renderer.request(1);

  const removeProgress = preloader.onProgress((loaded, failed) => {
    if (loaderCount) loaderCount.textContent = `${String(loaded).padStart(3, "0")} / ${String(manifest.frameCount).padStart(3, "0")}`;
    if (loader) loader.setAttribute("aria-label", `${loaded} sequence frames loaded${failed ? `, ${failed} failed` : ""}`);
    renderer.request(currentFrame);
  });

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

  await preloader.preloadRange(1, Math.min(profile.initialFrameCount, manifest.frameCount), FRAME_PRIORITY.runway);

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const target = currentFrame;
    await preloader.ensureWindow(target, mobile ? 3 : 4, mobile ? 6 : 10);
    if (Math.abs(currentFrame - target) <= 3) break;
  }

  stage.dataset.mode = "active";
  if (loader) loader.dataset.ready = "true";
  renderer.request(currentFrame);

  const runwayEnd = Math.min(96, manifest.frameCount);
  void preloader.preloadRange(profile.initialFrameCount + 1, runwayEnd, FRAME_PRIORITY.runway);
  void preloader.preloadFrames(chapterPriority(manifest), FRAME_PRIORITY.chapter);

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
