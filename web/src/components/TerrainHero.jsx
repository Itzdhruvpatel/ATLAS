import { useEffect, useRef } from "react";
import * as THREE from "three";
import { channels } from "../lib/replay.js";

// The hero is a recorded attack drawn as terrain. x is the event sequence, z is the channel,
// and each spike is something that happened in the run. Only the faint ripple is decoration.
const ROWS = 46, COLS = 170, WIDTH = 17, DEPTH = 8.5;
const CHANNELS = ["blocked", "replay", "allowed", "cleaned", "model", "exposure"];
const SECONDS_PER_EVENT = 0.95;
const HOLD_SECONDS = 4.5;

const STEEL = new THREE.Color("#a9c6d4");
const BASE = new THREE.Color("#22323d");
const TAINT = new THREE.Color("#ffb000");
const SAFE = new THREE.Color("#3fd07f");
const FAULT = new THREE.Color("#ff4438");
const BEAM = new THREE.Color("#ffffff");

const gauss = (d, width) => Math.exp(-(d * d) / (2 * width * width));

function buildField(events) {
  const data = channels(events);
  const span = Math.max(1, data.length - 1);
  const taintAt = data.findIndex((c) => c.exposure) / span;
  const heights = new Float32Array(ROWS * COLS);
  const kinds = new Uint8Array(ROWS * COLS); // 0 plain, 1 block spike, 2 replay spike
  for (let r = 0; r < ROWS; r++) {
    const z = r / (ROWS - 1);
    for (let c = 0; c < COLS; c++) {
      const x = c / (COLS - 1);
      let h = 0;
      let kind = 0;
      CHANNELS.forEach((key, band) => {
        const across = gauss(z - (band + 0.5) / CHANNELS.length, 0.075);
        if (key === "exposure") {
          if (taintAt >= 0) h += across * 0.75 * Math.min(1, Math.max(0, (x - taintAt) * 40));
          return;
        }
        const scale = key === "blocked" ? 2.7 : key === "replay" ? 2.0 : 1.35;
        data.forEach((event, i) => {
          if (!event[key]) return;
          const bump = across * gauss(x - i / span, 0.016) * scale;
          h += bump;
          if (bump > 0.12 && key === "blocked") kind = 1;
          if (bump > 0.12 && key === "replay") kind = 2;
        });
      });
      heights[r * COLS + c] = h;
      kinds[r * COLS + c] = kind;
    }
  }
  return { heights, kinds, taintAt };
}

export default function TerrainHero({ events, won, onIndex, className }) {
  const mount = useRef(null);
  const report = useRef(onIndex);
  report.current = onIndex;

  useEffect(() => {
    const element = mount.current;
    const { heights, kinds, taintAt } = buildField(events);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
    element.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x22323d, 10, 20);
    const camera = new THREE.PerspectiveCamera(42, 1.6, 0.1, 60);
    camera.position.set(0, 5, 9.6);

    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(ROWS * COLS * 3);
    const colors = new Float32Array(ROWS * COLS * 3);
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    const index = [];
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS - 1; c++) index.push(r * COLS + c, r * COLS + c + 1);
    geometry.setIndex(index);
    const lines = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.95 }));
    scene.add(lines);

    const beam = new THREE.Mesh(
      new THREE.PlaneGeometry(0.06, 3.6),
      new THREE.MeshBasicMaterial({ color: 0xff7a26, transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    beam.position.y = 1.4;
    scene.add(beam);

    const pointer = { x: 0, y: 0 };
    const move = (event) => {
      pointer.x = (event.clientX / innerWidth) * 2 - 1;
      pointer.y = -(event.clientY / innerHeight) * 2 + 1;
    };
    addEventListener("pointermove", move, { passive: true });

    const resize = () => {
      const { clientWidth: w, clientHeight: h } = element;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    const resizer = new ResizeObserver(resize);
    resizer.observe(element);
    resize();

    let visible = true;
    const watcher = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; });
    watcher.observe(element);

    const span = Math.max(1, events.length - 1);
    const sweep = events.length * SECONDS_PER_EVENT;
    const color = new THREE.Color();
    const clock = new THREE.Clock();
    let elapsed = 0;
    let lastIndex = -1;
    let frame;

    const tick = () => {
      frame = requestAnimationFrame(tick);
      const delta = clock.getDelta();
      if (!visible || document.hidden) return;
      elapsed += Math.min(delta, 0.1);
      const t = elapsed % (sweep + HOLD_SECONDS);
      const scan = Math.min(1, t / sweep);
      const current = Math.min(span, Math.round(scan * span));
      if (current !== lastIndex) { lastIndex = current; report.current?.(current); }

      for (let r = 0; r < ROWS; r++) {
        const z = r / (ROWS - 1);
        const depth = 0.3 + 0.7 * z;
        for (let c = 0; c < COLS; c++) {
          const x = c / (COLS - 1);
          const cell = r * COLS + c;
          const i = cell * 3;
          const passed = x <= scan;
          const ripple = 0.035 * Math.sin(c * 0.33 + r * 0.7 + elapsed * 1.4) * (0.5 + Math.sin(x * 9 - elapsed * 0.4) * 0.5);
          // Spikes rise only once the beam reaches them, so the event appears when it happened.
          const rise = passed ? 1 : 0.14;
          const h = heights[cell] * rise + ripple;
          positions[i] = (x - 0.5) * WIDTH;
          positions[i + 1] = Math.max(0, h);
          positions[i + 2] = (z - 0.5) * DEPTH;

          color.copy(BASE).lerp(STEEL, depth * (0.34 + 0.66 * Math.min(1, h / 1.1)));
          if (passed && taintAt >= 0 && x > taintAt) color.lerp(won ? FAULT : TAINT, 0.42 * depth);
          if (passed && kinds[cell] === 2) color.lerp(TAINT, 0.9);
          if (passed && kinds[cell] === 1) color.lerp(SAFE, 0.95);
          const near = Math.abs(x - scan);
          if (scan < 1 && near < 0.018) color.lerp(BEAM, (1 - near / 0.018) * 0.85);
          colors[i] = color.r; colors[i + 1] = color.g; colors[i + 2] = color.b;
        }
      }
      geometry.attributes.position.needsUpdate = true;
      geometry.attributes.color.needsUpdate = true;
      beam.position.x = (scan - 0.5) * WIDTH;
      beam.material.opacity = scan < 1 ? 0.75 : 0;

      camera.position.x += (pointer.x * 1.3 - camera.position.x) * 0.04;
      camera.position.y += (5 + pointer.y * 0.6 - camera.position.y) * 0.04;
      camera.lookAt(0, 0.4, 0);
      renderer.render(scene, camera);
    };
    tick();

    return () => {
      cancelAnimationFrame(frame);
      removeEventListener("pointermove", move);
      resizer.disconnect();
      watcher.disconnect();
      geometry.dispose();
      lines.material.dispose();
      beam.geometry.dispose();
      beam.material.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [events, won]);

  return <div ref={mount} className={className} aria-hidden="true" />;
}
