import { useEffect, useRef } from "react";
import * as THREE from "three";

const toWorld = ({ x, y }) => new THREE.Vector3((x - 0.5) * 16, (0.5 - y) * 10, 0);

function labelSprite(text) {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  const font = "700 30px B612, sans-serif";
  context.font = font;
  canvas.width = Math.ceil(context.measureText(text).width) + 48;
  canvas.height = 56;
  context.font = font;
  context.fillStyle = "#f3f6f2";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(text, canvas.width / 2, canvas.height / 2);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false }));
  sprite.scale.set(canvas.width / 58, canvas.height / 58, 1);
  return sprite;
}

function disposeGroup(group) {
  group.traverse((o) => {
    o.geometry?.dispose();
    o.material?.map?.dispose();
    o.material?.dispose();
  });
  group.clear();
}

export default function TaintGraph3D({ g, place, colors, nodeColors }) {
  const mount = useRef(null);
  const world = useRef(null);

  useEffect(() => {
    const element = mount.current;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    element.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 1.6, 0.1, 100);
    camera.position.set(0, -3.5, 16);
    camera.lookAt(0, 0, 0);
    scene.add(new THREE.AmbientLight(0xffffff, 1.5));
    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(4, 6, 10);
    scene.add(key);
    const content = new THREE.Group();
    scene.add(content);
    world.current = { content, pulses: [] };

    const resize = () => {
      const { clientWidth: w, clientHeight: h } = element;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    resize();

    let frame;
    const start = performance.now();
    const tick = (now) => {
      frame = requestAnimationFrame(tick);
      if (document.hidden) return;
      const t = (now - start) / 1000;
      content.rotation.y = Math.sin(t * 0.25) * 0.12;
      for (const p of world.current.pulses) {
        const progress = ((t * 0.45 + p.offset) % 1) * p.limit;
        p.mesh.position.lerpVectors(p.from, p.to, progress);
      }
      renderer.render(scene, camera);
    };
    frame = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      disposeGroup(content);
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  useEffect(() => {
    const { content } = world.current;
    disposeGroup(content);
    world.current.pulses = [];
    for (const edge of g.edges) {
      const from = toWorld(place[edge.from]);
      const to = toWorld(place[edge.to]);
      const color = colors[edge.state];
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([from, to]),
        new THREE.LineBasicMaterial({ color }),
      );
      content.add(line);
      if (edge.state === "ok" && edge.from === "user") continue;
      // A pulse is the data moving. A blocked pulse stops short of the tool, which is what happened.
      const pulse = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 12), new THREE.MeshBasicMaterial({ color }));
      content.add(pulse);
      world.current.pulses.push({ mesh: pulse, from, to, offset: Math.random(), limit: edge.state === "blocked" ? 0.72 : 1 });
      if (edge.state === "blocked") {
        const wall = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.1, 1.1), new THREE.MeshStandardMaterial({ color: 0x3fd07f }));
        wall.position.lerpVectors(from, to, 0.74);
        wall.rotation.z = Math.atan2(to.y - from.y, to.x - from.x);
        content.add(wall);
      }
    }
    for (const node of g.nodes) {
      const position = toWorld(place[node.id]);
      const big = node.id === "agent";
      // The agent is a box because the recorder is a box.
      const geometry = big ? new THREE.BoxGeometry(1.9, 1.3, 1.3) : new THREE.CylinderGeometry(0.42, 0.42, 0.24, 28);
      const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: nodeColors[node.trust], roughness: 0.5, metalness: 0.15 }));
      mesh.position.copy(position);
      if (!big) mesh.rotation.x = Math.PI / 2;
      content.add(mesh);
      const label = labelSprite(node.label);
      label.position.set(position.x, position.y - (big ? 1.15 : 0.8), 0.6);
      content.add(label);
    }
  }, [g, place, colors, nodeColors]);

  return <div ref={mount} style={{ position: "absolute", inset: 0 }} role="img" aria-label="3D view of where untrusted text flowed and which tool calls were stopped" />;
}
