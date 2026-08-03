import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

type Cleanup = () => void;
type ScopeMode = "live" | "archive";
type MapMode = "topo" | "range" | "thermal";

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const cleanups: Cleanup[] = [];

function setupReveals(root: HTMLElement) {
  if (reduceMotion) return;

  const context = gsap.context(() => {
    for (const target of root.querySelectorAll<HTMLElement>("[data-reveal]")) {
      const rowDelay = target.parentElement?.classList.contains("signal-list")
        ? [...target.parentElement.children].indexOf(target) * 0.035
        : 0;

      gsap.fromTo(target, {
        autoAlpha: 0,
        y: target.classList.contains("section-heading") ? 20 : 28,
      }, {
        autoAlpha: 1,
        y: 0,
        duration: 0.9,
        delay: rowDelay,
        ease: "power2.out",
        scrollTrigger: {
          trigger: target,
          start: "top 88%",
          once: true,
        },
      });
    }

    const map = root.querySelector<HTMLElement>("[data-archive-section='location']");
    const contourPaths = map ? [...map.querySelectorAll<SVGPathElement>(".map-layer--topo path")] : [];
    if (map && contourPaths.length) {
      gsap.fromTo(contourPaths, {
        strokeDasharray: 1200,
        strokeDashoffset: 1200,
      }, {
        strokeDashoffset: 0,
        duration: 1.8,
        stagger: 0.14,
        ease: "power2.out",
        scrollTrigger: {
          trigger: map,
          start: "top 70%",
          once: true,
        },
      });
    }
  }, root);

  cleanups.push(() => context.revert());
}

function setupSectionAccents(root: HTMLElement) {
  if (reduceMotion) return;

  const scopeScreen = root.querySelector<HTMLElement>(".scope-screen");
  const location = root.querySelector<HTMLElement>("[data-archive-section='location']");
  const final = root.querySelector<HTMLElement>("[data-archive-section='final']");
  const media = gsap.matchMedia();
  const context = gsap.context(() => {
    if (scopeScreen) {
      gsap.fromTo(scopeScreen, {
        clipPath: "inset(0 50% 0 50%)",
      }, {
        clipPath: "inset(0 0% 0 0%)",
        duration: 1.05,
        ease: "power2.out",
        scrollTrigger: {
          trigger: scopeScreen,
          start: "top 86%",
          once: true,
        },
      });
    }

    media.add("(min-width: 768px)", () => {
      if (location) {
        ScrollTrigger.create({
          trigger: location,
          start: "top bottom",
          end: "bottom top",
          onUpdate: ({ progress }) => {
            const depth = progress - 0.5;
            location.style.setProperty("--map-y", `${(depth * 8).toFixed(2)}px`);
            location.style.setProperty("--map-grid-y", `${(depth * 5).toFixed(2)}px`);
            location.style.setProperty("--map-scale", (0.93 + progress * 0.014).toFixed(4));
          },
        });
      }

      if (final) {
        ScrollTrigger.create({
          trigger: final,
          start: "top bottom",
          end: "bottom top",
          onUpdate: ({ progress }) => {
            const depth = progress - 0.5;
            final.style.setProperty("--final-image-y", `${(depth * 18).toFixed(2)}px`);
            final.style.setProperty("--final-image-scale", (1.035 + progress * 0.015).toFixed(4));
          },
        });
      }

      return () => {
        for (const property of ["--map-y", "--map-grid-y", "--map-scale"]) location?.style.removeProperty(property);
        for (const property of ["--final-image-y", "--final-image-scale"]) final?.style.removeProperty(property);
      };
    });
  }, root);

  cleanups.push(() => {
    media.revert();
    context.revert();
    for (const property of ["--map-y", "--map-grid-y", "--map-scale"]) location?.style.removeProperty(property);
    for (const property of ["--final-image-y", "--final-image-scale"]) final?.style.removeProperty(property);
  });
}

function setupScope(root: HTMLElement) {
  const scope = root.querySelector<HTMLElement>("[data-signal-scope]");
  const canvas = scope?.querySelector<HTMLCanvasElement>("[data-scope-canvas]");
  const status = scope?.querySelector<HTMLElement>("[data-scope-status]");
  if (!scope || !canvas) return;

  const context = canvas.getContext("2d");
  if (!context) return;

  let mode: ScopeMode = "live";
  let visible = false;
  let frameRequest = 0;
  let lastDraw = 0;
  let cssWidth = 1;
  let cssHeight = 1;

  const resize = () => {
    const bounds = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    cssWidth = Math.max(1, bounds.width);
    cssHeight = Math.max(1, bounds.height);
    canvas.width = Math.round(cssWidth * dpr);
    canvas.height = Math.round(cssHeight * dpr);
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw(performance.now());
  };

  const trace = (time: number, echo = false) => {
    const center = cssHeight * (echo ? 0.58 : 0.48);
    const phase = time * 0.0015 - (echo ? 0.73 : 0);
    context.beginPath();

    for (let x = 0; x <= cssWidth; x += 2) {
      const normalized = x / cssWidth;
      const carrier = Math.sin(normalized * 46 + phase * 2.1) * 4;
      const envelope = Math.exp(-Math.pow((normalized - 0.52) * 8.5, 2));
      const pulse = Math.sin(normalized * 188 + phase * 8) * envelope * (echo ? 37 : 58);
      const interference = Math.sin(normalized * 17 - phase) * 2.5;
      const y = center + carrier + pulse + interference;
      if (x === 0) context.moveTo(x, y); else context.lineTo(x, y);
    }

    context.strokeStyle = echo ? "rgba(201, 162, 88, 0.78)" : "rgba(113, 187, 192, 0.92)";
    context.lineWidth = echo ? 1 : 1.35;
    context.stroke();
  };

  const draw = (time: number) => {
    context.clearRect(0, 0, cssWidth, cssHeight);
    context.fillStyle = "#071012";
    context.fillRect(0, 0, cssWidth, cssHeight);

    context.lineWidth = 1;
    context.strokeStyle = "rgba(113, 187, 192, 0.09)";
    for (let x = 0; x <= cssWidth; x += Math.max(38, cssWidth / 16)) {
      context.beginPath(); context.moveTo(x, 0); context.lineTo(x, cssHeight); context.stroke();
    }
    for (let y = 0; y <= cssHeight; y += Math.max(32, cssHeight / 8)) {
      context.beginPath(); context.moveTo(0, y); context.lineTo(cssWidth, y); context.stroke();
    }

    trace(time);
    if (mode === "archive") trace(time, true);

    const scanX = reduceMotion ? cssWidth * 0.52 : (time * 0.08) % cssWidth;
    const scanGradient = context.createLinearGradient(scanX - 30, 0, scanX + 10, 0);
    scanGradient.addColorStop(0, "rgba(113, 187, 192, 0)");
    scanGradient.addColorStop(1, "rgba(113, 187, 192, 0.36)");
    context.fillStyle = scanGradient;
    context.fillRect(scanX - 30, 0, 40, cssHeight);

    if (mode === "archive") {
      const gateCenter = cssWidth * 0.52;
      const gateWidth = Math.max(46, cssWidth * 0.055);
      const gatePulse = reduceMotion ? 0.5 : (Math.sin(time * 0.004) + 1) * 0.5;
      const gateGradient = context.createLinearGradient(gateCenter - gateWidth, 0, gateCenter + gateWidth, 0);
      gateGradient.addColorStop(0, "rgba(214, 75, 65, 0)");
      gateGradient.addColorStop(0.45, `rgba(214, 75, 65, ${0.07 + gatePulse * 0.05})`);
      gateGradient.addColorStop(0.55, `rgba(201, 162, 88, ${0.08 + gatePulse * 0.05})`);
      gateGradient.addColorStop(1, "rgba(201, 162, 88, 0)");
      context.fillStyle = gateGradient;
      context.fillRect(gateCenter - gateWidth, 18, gateWidth * 2, cssHeight - 50);

      context.save();
      context.setLineDash([4, 7]);
      context.strokeStyle = "rgba(214, 75, 65, 0.62)";
      context.lineWidth = 1;
      for (const edge of [gateCenter - gateWidth * 0.52, gateCenter + gateWidth * 0.52]) {
        context.beginPath();
        context.moveTo(edge, 24);
        context.lineTo(edge, cssHeight - 38);
        context.stroke();
      }
      context.restore();

      const markerY = cssHeight * 0.53;
      const markerX = gateCenter + Math.sin(time * 0.0028) * gateWidth * 0.32;
      context.strokeStyle = "rgba(201, 162, 88, 0.82)";
      context.beginPath();
      context.moveTo(gateCenter - gateWidth * 0.48, markerY);
      context.lineTo(gateCenter + gateWidth * 0.48, markerY);
      context.stroke();
      context.fillStyle = "rgba(214, 75, 65, 0.95)";
      context.beginPath();
      context.moveTo(markerX, markerY - 6);
      context.lineTo(markerX + 6, markerY);
      context.lineTo(markerX, markerY + 6);
      context.lineTo(markerX - 6, markerY);
      context.closePath();
      context.fill();
      context.strokeStyle = `rgba(214, 75, 65, ${0.38 + gatePulse * 0.38})`;
      context.beginPath();
      context.arc(markerX, markerY, 11 + gatePulse * 5, 0, Math.PI * 2);
      context.stroke();
    }
  };

  const tick = (time: number) => {
    if (!visible || reduceMotion) return;
    if (time - lastDraw >= 33) {
      draw(time);
      lastDraw = time;
    }
    frameRequest = requestAnimationFrame(tick);
  };

  const setMode = (nextMode: ScopeMode) => {
    mode = nextMode;
    scope.dataset.scopeState = mode;
    for (const button of scope.querySelectorAll<HTMLButtonElement>("[data-scope-mode]")) {
      button.setAttribute("aria-pressed", String(button.dataset.scopeMode === mode));
    }
    if (status) status.textContent = mode === "archive" ? "Archived echo isolated" : "Monitoring live carrier";
    draw(performance.now());
  };

  const buttonHandlers = new Map<HTMLButtonElement, EventListener>();
  for (const button of scope.querySelectorAll<HTMLButtonElement>("[data-scope-mode]")) {
    const handler = () => setMode(button.dataset.scopeMode === "archive" ? "archive" : "live");
    button.addEventListener("click", handler);
    buttonHandlers.set(button, handler);
  }

  const visibilityObserver = new IntersectionObserver(([entry]) => {
    visible = Boolean(entry?.isIntersecting);
    cancelAnimationFrame(frameRequest);
    if (visible && !reduceMotion) frameRequest = requestAnimationFrame(tick);
  }, { rootMargin: "160px 0px" });
  visibilityObserver.observe(canvas);

  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(canvas);
  resize();

  cleanups.push(() => {
    cancelAnimationFrame(frameRequest);
    visibilityObserver.disconnect();
    resizeObserver.disconnect();
    for (const [button, handler] of buttonHandlers) button.removeEventListener("click", handler);
  });
}

function setupCoordinateDecode(root: HTMLElement) {
  const section = root.querySelector<HTMLElement>("[data-archive-section='location']");
  const coordinates = section ? [...section.querySelectorAll<HTMLElement>("[data-coordinate]")] : [];
  if (!section || !coordinates.length || reduceMotion) return;

  let frameRequest = 0;
  let started = false;
  const run = () => {
    const originals = coordinates.map((element) => element.dataset.coordinate ?? element.textContent ?? "");
    const length = Math.max(...originals.map((value) => value.length));
    const start = performance.now();
    const duration = 1100;

    const tick = (time: number) => {
      const progress = Math.min(1, (time - start) / duration);
      const resolved = Math.floor(progress * (length + 2));
      coordinates.forEach((element, lineIndex) => {
        const original = originals[lineIndex] ?? "";
        element.textContent = [...original].map((character, index) => {
          if (!/\d/.test(character) || index < resolved) return character;
          return String((index * 7 + lineIndex * 3 + Math.floor(time / 45)) % 10);
        }).join("");
      });
      if (progress < 1) frameRequest = requestAnimationFrame(tick);
    };
    frameRequest = requestAnimationFrame(tick);
  };

  const observer = new IntersectionObserver(([entry]) => {
    if (!started && entry?.isIntersecting) {
      started = true;
      run();
      observer.disconnect();
    }
  }, { threshold: 0.35 });
  observer.observe(section);
  cleanups.push(() => {
    observer.disconnect();
    cancelAnimationFrame(frameRequest);
  });
}

function setupFragments(root: HTMLElement) {
  const archive = root.querySelector<HTMLElement>("[data-fragment-archive]");
  if (!archive) return;

  const buttons = [...archive.querySelectorAll<HTMLButtonElement>("[data-fragment-select]")];
  const activate = (button: HTMLButtonElement) => {
    const panelId = button.getAttribute("aria-controls");
    for (const item of archive.querySelectorAll<HTMLElement>("[data-fragment-item]")) {
      const active = item.id === panelId;
      item.classList.toggle("is-active", active);
      item.hidden = !active;
    }
    for (const candidate of buttons) candidate.setAttribute("aria-selected", String(candidate === button));
    ScrollTrigger.refresh();
  };

  const handlers = new Map<HTMLButtonElement, EventListener>();
  for (const button of buttons) {
    const handler = () => activate(button);
    button.addEventListener("click", handler);
    handlers.set(button, handler);
  }
  cleanups.push(() => {
    for (const [button, handler] of handlers) button.removeEventListener("click", handler);
  });
}

function setupMap(root: HTMLElement) {
  const section = root.querySelector<HTMLElement>("[data-archive-section='location']");
  const legend = section?.querySelector<HTMLElement>("[data-map-legend]");
  if (!section) return;

  const labels: Record<MapMode, string> = {
    topo: "Topographic acquisition",
    range: "Bearing convergence",
    thermal: "Transient thermal contacts",
  };

  const buttons = [...section.querySelectorAll<HTMLButtonElement>("[data-map-mode-control]")];
  const setMode = (mode: MapMode) => {
    section.dataset.mapMode = mode;
    for (const button of buttons) button.setAttribute("aria-pressed", String(button.dataset.mapModeControl === mode));
    if (legend) legend.textContent = labels[mode];
  };

  const handlers = new Map<HTMLButtonElement, EventListener>();
  for (const button of buttons) {
    const handler = () => setMode((button.dataset.mapModeControl as MapMode | undefined) ?? "topo");
    button.addEventListener("click", handler);
    handlers.set(button, handler);
  }
  cleanups.push(() => {
    for (const [button, handler] of handlers) button.removeEventListener("click", handler);
  });
}

function setupFinalSignal(root: HTMLElement) {
  const section = root.querySelector<HTMLElement>("[data-final-signal]");
  const button = section?.querySelector<HTMLButtonElement>("[data-recall-signal]");
  const response = section?.querySelector<HTMLElement>("[data-final-response]");
  const instrument = section?.querySelector<HTMLElement>(".final-instrument");
  if (!section || !button) return;

  let resetTimer = 0;
  const handler = () => {
    section.classList.add("is-transmitting");
    if (response) response.textContent = "Response detected / reopening feed";
    window.clearTimeout(resetTimer);
    resetTimer = window.setTimeout(() => {
      section.classList.remove("is-transmitting");
      if (response) response.textContent = "Standing by for operator input";
    }, 1800);
  };
  button.addEventListener("click", handler);

  const pointerMove = (event: PointerEvent) => {
    if (!instrument || reduceMotion || event.pointerType === "touch") return;
    const bounds = section.getBoundingClientRect();
    const x = ((event.clientX - bounds.left) / bounds.width - 0.5) * 18;
    const y = ((event.clientY - bounds.top) / bounds.height - 0.5) * 18;
    instrument.style.setProperty("--pointer-x", `${x.toFixed(2)}px`);
    instrument.style.setProperty("--pointer-y", `${y.toFixed(2)}px`);
  };
  const pointerLeave = () => {
    instrument?.style.removeProperty("--pointer-x");
    instrument?.style.removeProperty("--pointer-y");
  };
  section.addEventListener("pointermove", pointerMove, { passive: true });
  section.addEventListener("pointerleave", pointerLeave);
  cleanups.push(() => {
    window.clearTimeout(resetTimer);
    button.removeEventListener("click", handler);
    section.removeEventListener("pointermove", pointerMove);
    section.removeEventListener("pointerleave", pointerLeave);
  });
}

const root = document.querySelector<HTMLElement>("[data-post-sequence]");
if (root) {
  setupReveals(root);
  setupSectionAccents(root);
  setupScope(root);
  setupFragments(root);
  setupMap(root);
  setupCoordinateDecode(root);
  setupFinalSignal(root);
}

window.addEventListener("pagehide", () => {
  for (const cleanup of cleanups) cleanup();
}, { once: true });
