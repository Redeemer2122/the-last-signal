import Lenis from "lenis";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

export function createLenis() {
  const lenis = new Lenis({ lerp: 0.08, smoothWheel: true, syncTouch: false, wheelMultiplier: 0.9 });
  const update = () => ScrollTrigger.update();
  const tick = (time: number) => lenis.raf(time * 1000);
  lenis.on("scroll", update);
  gsap.ticker.add(tick);
  gsap.ticker.lagSmoothing(0);
  return {
    instance: lenis,
    destroy() {
      gsap.ticker.remove(tick);
      lenis.off("scroll", update);
      lenis.destroy();
    },
  };
}
