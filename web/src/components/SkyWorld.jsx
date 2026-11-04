import { useEffect, useRef } from "react";

// A real-time raymarched flight above the clouds. The engine is adapted from TrustCheck (Team Semicolons).
// Scrolling flies one camera down a cloud canyon, and the sky tells the attack's story: sunset, a storm with
// lightning, night under an aurora, then a clear dawn. Plain WebGL2, one fragment shader.

const VERT = `#version 300 es
in vec2 p; void main() { gl_Position = vec4(p, 0.0, 1.0); }`;

const FRAG = `#version 300 es
precision highp float;
uniform vec2 uRes; uniform float uTime; uniform float uS; uniform vec2 uMouse; uniform float uQ;
out vec4 fragColor;

const float W = 18.0; // water level

float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
// value noise with analytic derivatives
vec3 noised(vec2 x) {
  vec2 i = floor(x), f = fract(x);
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0), du = 30.0 * f * f * (f * (f - 2.0) + 1.0);
  float a = hash12(i), b = hash12(i + vec2(1, 0)), c = hash12(i + vec2(0, 1)), d = hash12(i + vec2(1, 1));
  return vec3(a + (b - a) * u.x + (c - a) * u.y + (a - b - c + d) * u.x * u.y, du * (vec2(b - a, c - a) + (a - b - c + d) * u.yx));
}
const mat2 m2 = mat2(0.8, -0.6, 0.6, 0.8);
float fbm(vec2 p) { float a = 0.0, b = 0.5; for (int i = 0; i < 4; i++) { a += b * noised(p).x; b *= 0.5; p = m2 * p * 2.02; } return a; }

float pathX(float z) { return 70.0 * sin(z * 0.0042) + 34.0 * sin(z * 0.0105 + 1.3); }

// a sea of soft, rounded cloud, with a canyon carved along the flight path
float terrain(vec2 p, int oct) {
  vec2 q = p * 0.0023 + vec2(uTime * 0.008, 0.0); float a = 0.0, b = 0.5, sum = 0.0;
  for (int i = 0; i < 6; i++) { if (i >= min(oct, 5)) break; a += b * noised(q).x; sum += b; b *= 0.42; q = m2 * q * 2.1; }
  a /= sum;
  float h = 230.0 * pow(smoothstep(0.24, 0.82, a), 1.5);
  float v = smoothstep(40.0, 360.0, abs(p.x - pathX(p.y)));
  return mix(h * 0.18 + 10.0, h + 34.0 * v, v * v * (3.0 - 2.0 * v));
}

// ---------- time of day: five keyframes along the scroll ----------
struct Sky { vec3 hor; vec3 zen; vec3 lcol; vec3 amb; vec3 L; float night; float aur; float fogk; };
Sky skyAt(float s) {
  vec3 H[5] = vec3[5](vec3(1.35, 0.5, 0.14), vec3(0.8, 0.1, 0.16), vec3(0.06, 0.07, 0.17), vec3(0.04, 0.09, 0.13), vec3(1.3, 0.7, 0.36));
  vec3 Z[5] = vec3[5](vec3(0.05, 0.12, 0.38), vec3(0.09, 0.02, 0.12), vec3(0.008, 0.01, 0.04), vec3(0.004, 0.011, 0.028), vec3(0.22, 0.27, 0.66));
  vec3 C[5] = vec3[5](vec3(2.9, 1.25, 0.42), vec3(1.5, 0.36, 0.28), vec3(0.32, 0.42, 0.75), vec3(0.28, 0.42, 0.68), vec3(1.8, 0.95, 0.6));
  vec3 A[5] = vec3[5](vec3(0.2, 0.17, 0.3), vec3(0.15, 0.1, 0.26), vec3(0.04, 0.05, 0.1), vec3(0.035, 0.07, 0.09), vec3(0.24, 0.2, 0.34));
  vec3 D[5] = vec3[5](normalize(vec3(0.35, 0.1, 1.0)), normalize(vec3(0.2, 0.018, 1.0)), normalize(vec3(-0.5, 0.55, 0.7)), normalize(vec3(-0.4, 0.6, 0.7)), normalize(vec3(-0.45, 0.12, 1.0)));
  float K[5] = float[5](0.0, 0.2, 0.45, 0.72, 1.0);
  float F[5] = float[5](0.42, 0.75, 1.0, 0.9, 0.3);
  Sky o; int i = 0;
  for (int k = 0; k < 4; k++) if (s >= K[k]) i = k;
  float t = smoothstep(K[i], K[i + 1], s);
  o.hor = mix(H[i], H[i + 1], t); o.zen = mix(Z[i], Z[i + 1], t); o.lcol = mix(C[i], C[i + 1], t); o.amb = mix(A[i], A[i + 1], t);
  o.L = normalize(mix(D[i], D[i + 1], t)); o.fogk = mix(F[i], F[i + 1], t);
  o.night = smoothstep(0.28, 0.42, s) * (1.0 - smoothstep(0.82, 0.95, s));
  o.aur = smoothstep(0.5, 0.66, s) * (1.0 - smoothstep(0.84, 0.94, s));
  return o;
}

vec3 aurora(vec3 rd) {
  vec3 acc = vec3(0.0);
  for (int i = 0; i < 13; i++) {
    float fi = (float(i) + hash12(gl_FragCoord.xy)) * 2.0, t = (900.0 + fi * 32.0) / rd.y; // dithered layers, no banding
    vec2 pp = rd.xz * t * 0.0009 + vec2(uTime * 0.012, fi * 0.004);
    float n = noised(pp * vec2(0.6, 2.4)).x * 0.7 + noised(pp * vec2(1.7, 5.0) - uTime * 0.02).x * 0.45;
    float band = pow(smoothstep(0.62, 1.05, n), 2.2);
    vec3 c = mix(vec3(0.1, 1.0, 0.55), vec3(0.65, 0.25, 1.0), smoothstep(6.0, 24.0, fi));
    acc += c * band * exp(-fi * 0.09) * 0.3;
  }
  return acc * smoothstep(0.04, 0.3, rd.y);
}

vec3 skyColor(vec3 ro, vec3 rd, Sky k) {
  float y = max(rd.y, 0.0);
  // a rose band between horizon and zenith, because orange blended straight into blue turns grey-green
  vec3 mid = vec3(max(k.hor.r, k.zen.r) * 0.62, min(k.hor.g, k.zen.g) * 1.1 + 0.015, (k.hor.b + k.zen.b) * 0.62);
  vec3 col = mix(mix(k.hor, mid, smoothstep(0.0, 0.2, y)), k.zen, smoothstep(0.12, 0.75, y));
  float sd = max(dot(rd, k.L), 0.0), day = 1.0 - k.night;
  col += k.lcol * (0.12 * pow(sd, 8.0) + 0.5 * pow(sd, 48.0)) * day;          // glow around the sun
  col += k.lcol * 6.0 * pow(sd, 1600.0) * day;                                   // the sun's disc
  col += vec3(0.85, 0.9, 1.0) * 3.0 * pow(sd, 3000.0) * k.night;                 // the moon
  col += vec3(0.4, 0.45, 0.6) * 0.15 * pow(sd, 30.0) * k.night;
  // stars
  vec3 q = rd * 340.0; vec3 id = floor(q); float h = hash12(id.xy + id.z * 17.13);
  col += vec3(smoothstep(0.9965, 1.0, h) * (0.55 + 0.45 * sin(uTime * 2.5 + h * 90.0))) * k.night * smoothstep(0.02, 0.2, rd.y);
  if (k.aur > 0.001 && rd.y > 0.03) col += aurora(rd) * k.aur;
  // clouds on a high layer, lit from the sun's side
  if (rd.y > 0.0) {
    float tc = (1100.0 - ro.y) / rd.y; vec2 pc = ro.xz + rd.xz * tc;
    float d = fbm(pc * 0.0008 + vec2(uTime * 0.006, 0.0)), dens = smoothstep(0.5, 0.85, d) * exp(-tc * 0.0001);
    float lit = smoothstep(0.3, 0.9, fbm(pc * 0.0008 + k.L.xz * 0.06 + vec2(uTime * 0.006, 0.0)) - d + 0.6);
    vec3 cc = mix(k.hor * 0.55 + k.amb, k.lcol * 0.9 + k.hor * 0.3, lit) * mix(1.0, 0.25, k.night);
    col = mix(col, cc, dens * 0.85);
  }
  return col;
}

float march(vec3 ro, vec3 rd, float tmax, int steps, int oct) {
  float t = 1.0;
  for (int i = 0; i < 260; i++) {
    if (i >= steps) break;
    vec3 p = ro + t * rd; float h = p.y - terrain(p.xz, oct);
    if (abs(h) < 0.0025 * t || t > tmax) break;
    t += h * (0.45 + t * 0.00018);
  }
  return t;
}
float softShadow(vec3 ro, vec3 rd) {
  float res = 1.0, t = 2.0;
  for (int i = 0; i < 22; i++) {
    vec3 p = ro + t * rd; float h = p.y - terrain(p.xz, 4);
    res = min(res, 12.0 * h / t); t += clamp(h, 6.0, 80.0);
    if (res < 0.002 || p.y > 420.0) break;
  }
  return clamp(res, 0.0, 1.0);
}
vec3 normalAt(vec3 p, float t, int oct) {
  vec2 e = vec2(0.0015 * t + 0.05, 0.0);
  return normalize(vec3(terrain(p.xz - e.xy, oct) - terrain(p.xz + e.xy, oct), 2.0 * e.x, terrain(p.xz - e.yx, oct) - terrain(p.xz + e.yx, oct)));
}

vec3 albedo(vec3 p, vec3 n) {
  return mix(vec3(0.82, 0.84, 0.92), vec3(1.0, 0.98, 0.95), smoothstep(30.0, 190.0, p.y));
}

// clouds scatter light, so the lit side wraps around and shadows stay soft and tinted by the sky
vec3 shade(vec3 p, vec3 n, Sky k, bool shadows) {
  float wrap = clamp(dot(n, k.L) * 0.55 + 0.45, 0.0, 1.0);
  float dif = wrap * wrap;
  float sh = (shadows && dif > 0.001) ? 0.35 + 0.65 * softShadow(p + n * 1.5, k.L) : 1.0;
  float sky = 0.5 + 0.5 * n.y;
  vec3 shadow = mix(k.zen, k.hor, 0.42) + vec3(0.04, 0.0, 0.05);
  vec3 lin = k.lcol * dif * sh * 1.08 + shadow * sky * 0.78 + k.amb * 0.3;
  return albedo(p, n) * lin;
}

vec3 fog(vec3 col, vec3 rd, float t, vec3 p, Sky k) {
  float sd = max(dot(rd, k.L), 0.0);
  vec3 fc = mix(k.hor * 0.92, k.lcol * 0.75, pow(sd, 6.0) * (1.0 - k.night * 0.6));
  col = mix(col, fc, 1.0 - exp(-pow(t * 0.00028, 1.6) * 1.1 * k.fogk));
  float mist = exp(-max(p.y - W, 0.0) * 0.055) * (1.0 - exp(-t * 0.0028));
  return mix(col, fc * 1.1 + k.amb * 0.3, mist * 0.12 * k.fogk);
}

// the flight: altitude above the ground and pitch keyed to the scroll
float altAt(float s) {
  float a = 150.0;
  a = mix(a, 62.0, smoothstep(0.04, 0.17, s));
  a = mix(a, 75.0, smoothstep(0.3, 0.42, s));
  a = mix(a, 70.0, smoothstep(0.5, 0.6, s));
  a = mix(a, 130.0, smoothstep(0.64, 0.8, s));
  a = mix(a, 210.0, smoothstep(0.86, 1.0, s));
  return a;
}
float pitchAt(float s) {
  float p = -0.1;
  p = mix(p, -0.06, smoothstep(0.04, 0.17, s));
  p = mix(p, 0.32, smoothstep(0.6, 0.72, s));
  p = mix(p, 0.02, smoothstep(0.84, 0.98, s));
  return p;
}

vec3 aces(vec3 x) { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }

void main() {
  vec2 frag = gl_FragCoord.xy, uv = (2.0 * frag - uRes) / uRes.y;
  float s = uS;
  Sky k = skyAt(s);

  float z = s * 3600.0 + uTime * 1.6;
  vec3 ro = vec3(pathX(z), 0.0, z);
  float g = W;
  for (int i = 0; i < 2; i++) { float zz = z + float(i) * 70.0; g = max(g, terrain(vec2(pathX(zz), zz), 5)); }
  ro.y = g + altAt(s);
  vec3 ta = vec3(pathX(z + 420.0) + uMouse.x * 110.0, ro.y + pitchAt(s) * 420.0 + uMouse.y * 70.0, z + 420.0);
  float roll = clamp((pathX(z + 160.0) - pathX(z)) * -0.0035, -0.28, 0.28);
  vec3 cw = normalize(ta - ro), cp = vec3(sin(roll), cos(roll), 0.0), cu = normalize(cross(cw, cp)), cv = cross(cu, cw);
  vec3 rd = normalize(uv.x * cu + uv.y * cv + 1.7 * cw);

  int steps = uQ > 0.5 ? 150 : 100;
  float tmax = 4200.0;
  float t = march(ro, rd, tmax, steps, uQ > 0.5 ? 7 : 6);
  float tw = 1e9; // no water up here
  vec3 col;

  if (min(t, tw) < tmax) {
    if (tw < t) {
      vec3 p = ro + tw * rd;
      vec3 n1 = noised(p.xz * 0.05 + vec2(uTime * 0.35, uTime * 0.18)), n2 = noised(p.xz * 0.16 - vec2(uTime * 0.25, -uTime * 0.3));
      vec3 wn = normalize(vec3(-(n1.y * 0.2 + n2.y * 0.1), 1.0, -(n1.z * 0.2 + n2.z * 0.1)));
      vec3 rf = reflect(rd, wn);
      float tr = march(p + vec3(0.0, 0.5, 0.0), rf, 1400.0, uQ > 0.5 ? 50 : 32, 4);
      vec3 rc;
      if (tr < 1400.0) { vec3 q = p + rf * tr; rc = fog(shade(q, normalAt(q, tr, 5), k, false), rf, tr, q, k); }
      else rc = skyColor(p, rf, k);
      float fr = 0.03 + 0.97 * pow(1.0 - max(dot(-rd, wn), 0.0), 5.0);
      vec3 deep = mix(vec3(0.01, 0.03, 0.05), vec3(0.03, 0.09, 0.1), k.amb.g * 2.0) + k.amb * 0.25;
      col = mix(deep, rc, 0.35 + 0.65 * fr);
      col += mix(k.lcol, vec3(0.9, 0.95, 1.2) * 0.4, k.night) * pow(max(dot(rf, k.L), 0.0), 400.0) * 2.5 * smoothstep(20.0, 160.0, tw);
      col = fog(col, rd, tw, p, k);
    } else {
      vec3 p = ro + t * rd, n = normalAt(p, t, uQ > 0.5 ? 11 : 8);
      col = fog(shade(p, n, k, uQ > 0.25), rd, t, p, k);
    }
  } else col = skyColor(ro, rd, k);

  // lightning inside the storm chapter, slow and soft, and off when motion is reduced
  float storm = smoothstep(0.1, 0.2, s) * (1.0 - smoothstep(0.36, 0.44, s));
  if (storm > 0.0 && uTime > 0.0) {
    float beat = uTime * 1.7, cell = floor(beat);
    if (hash12(vec2(cell, 3.1)) > 0.74) {
      vec2 at = vec2(hash12(vec2(cell, 1.7)) * 2.4 - 1.2, hash12(vec2(cell, 2.9)) * 0.7 - 0.45);
      col += vec3(1.0, 0.72, 0.82) * storm * 0.9 * exp(-fract(beat) * 4.5) * exp(-length(uv - at) * 1.5);
    }
  }

  // a soft bloom around the sun or moon, film tone mapping, vignette and grain
  col += mix(k.lcol, vec3(0.5, 0.6, 0.9), k.night) * 0.1 * pow(max(dot(rd, k.L), 0.0), 16.0);
  col = aces(col * 1.02);
  col = pow(col, vec3(0.4545));
  vec2 q = frag / uRes;
  col *= 0.5 + 0.5 * pow(16.0 * q.x * q.y * (1.0 - q.x) * (1.0 - q.y), 0.18);
  col += (hash12(frag + fract(uTime) * 91.0) - 0.5) * 0.022;
  fragColor = vec4(col, 1.0);
}`;

export default function SkyWorld({ className = "" }) {
  const ref = useRef(null);

  useEffect(() => {
    const canvas = ref.current;
    const gl = canvas?.getContext("webgl2", { antialias: false, alpha: false, powerPreference: "high-performance" });
    if (!gl) { canvas.dataset.fallback = "1"; return; } // ponytail: no WebGL2, the page keeps its dark backdrop

    const compile = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
    let prog;
    try {
      prog = gl.createProgram();
      gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT)); gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG)); gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    } catch (e) { console.error("SkyWorld shader:", e); canvas.dataset.fallback = "1"; return; }
    gl.useProgram(prog);
    const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "p"); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const u = Object.fromEntries(["uRes", "uTime", "uS", "uMouse", "uQ"].map((n) => [n, gl.getUniformLocation(prog, n)]));

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const phone = window.matchMedia("(max-width: 700px)").matches;
    let scale = phone ? 0.4 : 0.5, quality = phone ? 0.3 : 1; // adapted below to hold 60 fps
    let s = 0, s1 = 0, mx = 0, my = 0, tmx = 0, tmy = 0, raf = 0, last = performance.now(), avg = 16, frames = 0;

    const size = () => {
      const w = Math.max(1, Math.round(innerWidth * scale)), h = Math.max(1, Math.round(innerHeight * scale));
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; gl.viewport(0, 0, w, h); }
    };
    const target = () => { const max = document.documentElement.scrollHeight - innerHeight; return max > 0 ? Math.min(1, Math.max(0, scrollY / max)) : 0; };
    const q = new URLSearchParams(location.search);
    const forced = parseFloat(q.get("s"));   // ?s=0.5 jumps the flight (demo/debug knob)
    const pinned = parseFloat(q.get("res")); // ?res=1 pins the render scale (screenshots, slow projectors)
    if (Number.isFinite(pinned)) scale = pinned;
    s = s1 = target();
    const move = (e) => { tmx = (e.clientX / innerWidth) * 2 - 1; tmy = -((e.clientY / innerHeight) * 2 - 1); };
    addEventListener("pointermove", move, { passive: true });

    const frame = (now) => {
      raf = requestAnimationFrame(frame);
      if (document.hidden) return;
      const dt = Math.min(0.1, (now - last) / 1000); last = now;
      // two chained eases: the camera accelerates and settles instead of snapping to each wheel step
      const e = Math.min(1, dt * 4);
      s1 += (target() - s1) * e; s = Number.isFinite(forced) ? forced : s + (s1 - s) * e;
      mx += (tmx - mx) * Math.min(1, dt * 2); my += (tmy - my) * Math.min(1, dt * 2);
      avg = avg * 0.92 + dt * 1000 * 0.08;
      if (!Number.isFinite(pinned) && ++frames % 40 === 0) {                         // hold 60 fps by trading resolution
        if (avg > 19 && scale > 0.3) scale -= 0.05; else if (avg < 17.2 && scale < (phone ? 0.5 : 0.72)) scale += 0.02;
      }
      size();
      gl.uniform2f(u.uRes, canvas.width, canvas.height);
      gl.uniform1f(u.uTime, reduced ? 0 : now / 1000);
      gl.uniform1f(u.uS, s);
      gl.uniform2f(u.uMouse, reduced ? 0 : mx, reduced ? 0 : my);
      gl.uniform1f(u.uQ, quality);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };
    raf = requestAnimationFrame(frame);
    // stop drawing only: losing the context here breaks React's dev double-mount, which reuses this canvas
    return () => { cancelAnimationFrame(raf); removeEventListener("pointermove", move); gl.deleteProgram(prog); gl.deleteBuffer(buf); };
  }, []);

  return <canvas ref={ref} aria-hidden className={`fixed inset-0 w-full h-full ${className}`} />;
}
