export const SEQUENCE_ID = "the-last-signal";
export const SEQUENCE_CACHE_KEY = "sequence-v2-20260804";
export const SEQUENCE_CDN_COMMIT = "eab486fdda6d524e772071791bf2429be65784e2";
export const SEQUENCE_CDN_BASE = `https://cdn.jsdelivr.net/gh/Redeemer2122/the-last-signal@${SEQUENCE_CDN_COMMIT}/public/sequences/${SEQUENCE_ID}`;
export const SAMPLE_FPS = 24;
export const TRANSITION_04_START = 24;
export const MASTER_DURATION = 32;
export const FRAME_REMOVAL_WINDOWS = [
  { startTime: 16, frameCount: 3 },
  { startTime: 24, frameCount: 5 },
];
export const FRAME_REMOVALS = FRAME_REMOVAL_WINDOWS.flatMap(({ startTime, frameCount }) => {
  const startFrame = Math.round(startTime * SAMPLE_FPS) + 1;
  return Array.from({ length: frameCount }, (_, index) => startFrame + index);
});

export const SOURCE_FILES = [
  "the-last-signal-transition-01.mp4",
  "the-last-signal-transition-02.mp4",
  "the-last-signal-transition-03.mp4",
  "the-last-signal-transition-04.mp4",
];

export function buildChapters(frameCount) {
  const at = (ratio) => Math.max(1, Math.min(frameCount, Math.round(frameCount * ratio)));
  return [
    {
      id: "opening", frameStart: 1, frameFocus: at(0.07), frameEnd: at(0.17),
      eyebrow: "Transmission 07-16", title: "THE LAST SIGNAL",
      body: "A signal was received. No source was found. The transmission continues.", align: "left",
    },
    {
      id: "contact", frameStart: at(0.17), frameFocus: at(0.25), frameEnd: at(0.34),
      eyebrow: "01 — CONTACT", title: "Unknown source",
      body: "At 03:17, the station received a transmission from an unknown source.", align: "right",
    },
    {
      id: "threshold", frameStart: at(0.34), frameFocus: at(0.44), frameEnd: at(0.49),
      eyebrow: "02 — THRESHOLD", title: "The door remained open",
      body: "The facility was abandoned. The signal was still active.", align: "left",
    },
    {
      id: "origin", frameStart: at(0.49), frameFocus: at(0.65), frameEnd: at(0.74),
      eyebrow: "03 — ORIGIN", title: "No registered frequency",
      body: "No satellite. No aircraft. No registered frequency.", align: "right",
    },
    {
      id: "message", frameStart: at(0.74), frameFocus: at(0.91), frameEnd: frameCount,
      eyebrow: "04 — THE MESSAGE", title: "It was answering us.",
      body: "It was not calling for help.", align: "center",
    },
  ];
}

export function buildManifest(frameCount) {
  return {
    version: 1,
    cacheKey: SEQUENCE_CACHE_KEY,
    frameCount,
    samplingFps: SAMPLE_FPS,
    desktop: {
      path: `${SEQUENCE_CDN_BASE}/desktop/frame-{frame}.webp`,
      width: 1920,
      height: 1080,
    },
    mobile: {
      path: `${SEQUENCE_CDN_BASE}/mobile/frame-{frame}.webp`,
      width: 1080,
      height: 1350,
    },
    poster: {
      desktop: "/sequences/the-last-signal/posters/poster-desktop.webp",
      mobile: "/sequences/the-last-signal/posters/poster-mobile.webp",
    },
    chapters: buildChapters(frameCount),
  };
}
