export interface SequenceVariant {
  path: string;
  packPath: string;
  packCount: number;
  width: number;
  height: number;
}

export interface SequenceChapter {
  id: string;
  frameStart: number;
  frameFocus: number;
  frameEnd: number;
  eyebrow: string;
  title: string;
  body: string;
  align: "left" | "right" | "center";
}

export interface SequenceManifest {
  version: number;
  cacheKey: string;
  frameCount: number;
  samplingFps: number;
  desktop: SequenceVariant;
  mobile: SequenceVariant;
  poster: { desktop: string; mobile: string };
  chapters: SequenceChapter[];
}

export interface CapabilityResult {
  fullMotion: boolean;
  reason: "enabled" | "reduced-motion" | "save-data" | "weak-device" | "no-canvas";
}
