import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import type { SequenceChapter } from "./types";

gsap.registerPlugin(ScrollTrigger);

interface TimelineOptions {
  stage: HTMLElement;
  viewport: HTMLElement;
  chapters: SequenceChapter[];
  samplingFps: number;
  renderFrame: (frame: number) => void;
}

export function createSequenceTimeline({ stage, viewport, chapters, samplingFps, renderFrame }: TimelineOptions) {
  const frameState = { current: 1 };
  const useCinematicClip = window.matchMedia("(min-width: 768px)").matches;
  const context = gsap.context(() => {
    const timeline = gsap.timeline({
      defaults: { ease: "none" },
      scrollTrigger: {
        trigger: stage,
        start: "top top",
        end: "bottom bottom",
        pin: viewport,
        pinSpacing: false,
        scrub: 0.55,
        anticipatePin: 1,
        invalidateOnRefresh: true,
      },
    });

    let previousFrame = 1;
    for (const chapter of chapters) {
      const element = stage.querySelector<HTMLElement>(`[data-chapter="${chapter.id}"]`);
      const eyebrow = element?.querySelector<HTMLElement>(".sequence-chapter__eyebrow");
      const title = element?.querySelector<HTMLElement>("h2");
      const body = element?.querySelector<HTMLElement>(":scope > p:last-child");
      const travelFrames = Math.max(1, chapter.frameFocus - previousFrame);
      if (chapter.id === "opening" && element) {
        timeline.set(element, { autoAlpha: 1, y: 0 });
        timeline.to({}, { duration: 0.4 });
      }
      timeline.to(frameState, {
        current: chapter.frameFocus,
        duration: Math.max(1.4, travelFrames / samplingFps),
        onUpdate: () => renderFrame(frameState.current),
      });
      if (element) {
        if (chapter.id !== "opening") {
          timeline.fromTo(element, { autoAlpha: 0, y: 24 }, { autoAlpha: 1, y: 0, duration: 0.6 });
          if (eyebrow) timeline.fromTo(eyebrow, { autoAlpha: 0, y: 8 }, { autoAlpha: 1, y: 0, duration: 0.34, ease: "power2.out" }, "<");
          if (title) timeline.fromTo(title, {
            autoAlpha: 0,
            clipPath: useCinematicClip ? "inset(0 0 100% 0)" : "inset(0 0 0% 0)",
            y: useCinematicClip ? 16 : 8,
          }, {
            autoAlpha: 1,
            clipPath: "inset(0 0 0% 0)",
            y: 0,
            duration: 0.55,
            ease: "power2.out",
          }, "<");
          if (body) timeline.fromTo(body, { autoAlpha: 0, y: 10 }, { autoAlpha: 1, y: 0, duration: 0.43, ease: "power2.out" }, "<0.12");
          timeline.to({}, { duration: chapter.id === "message" ? 1.6 : 1.2 });
        }
        timeline.to(element, { autoAlpha: chapter.id === "message" ? 1 : 0, y: chapter.id === "message" ? 0 : -18, duration: 0.5 });
      }
      const exitFrames = Math.max(1, chapter.frameEnd - chapter.frameFocus);
      timeline.to(frameState, {
        current: chapter.frameEnd,
        duration: Math.max(1, exitFrames / samplingFps),
        onUpdate: () => renderFrame(frameState.current),
      }, element ? "<" : ">");
      previousFrame = chapter.frameEnd;
    }
  }, stage);
  return () => context.revert();
}
