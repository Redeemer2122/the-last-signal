export const NARRATIVE_CHAPTERS = [
  {
    id: "opening",
    eyebrow: "Transmission 07-16",
    title: "THE LAST SIGNAL",
    body: "A signal was received. No source was found. The transmission continues.",
    align: "left",
  },
  {
    id: "contact",
    eyebrow: "01 — CONTACT",
    title: "Unknown source",
    body: "At 03:17, the station received a transmission from an unknown source.",
    align: "right",
  },
  {
    id: "threshold",
    eyebrow: "02 — THRESHOLD",
    title: "The door remained open",
    body: "The facility was abandoned. The signal was still active.",
    align: "left",
  },
  {
    id: "origin",
    eyebrow: "03 — ORIGIN",
    title: "No registered frequency",
    body: "No satellite. No aircraft. No registered frequency.",
    align: "right",
  },
  {
    id: "message",
    eyebrow: "04 — THE MESSAGE",
    title: "It was answering us.",
    body: "It was not calling for help.",
    align: "center",
  },
] as const;

export const SEQUENCE_CONFIG = {
  manifestUrl: "/sequences/the-last-signal/manifest.json",
  mobileQuery: "(max-width: 767px)",
  desktop: {
    preloadConcurrency: 12,
  },
  mobile: {
    preloadConcurrency: 8,
  },
  retryAttempts: 3,
} as const;
