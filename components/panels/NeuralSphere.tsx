"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { Style } from "@/components/Style";
import { useStore } from "@/lib/store";
import type { ForecastBrief, Analog } from "@/lib/types";
import { fmtPct } from "@/lib/format";

/**
 * NEURAL SPHERE (Three.js) — как на референсе: плотный «проволочный» шар.
 *  - сфера из ~6500 точек (золотое спиральное распределение + джиттер),
 *  - переплетённые нити: каждая точка связана с соседями по спирали и длинными
 *    хордами (i+41 / i+233) → свитый клубок нитей: сверху бело-циановое свечение,
 *    снизу тёплое янтарное (как на картинке);
 *  - точки-аналоги (50) — семантика: 🟢 выросли тянутся к северному полюсу (UP),
 *    🔴 упали — к южному (DOWN), спицы от ядра яркостью = схожесть;
 *  - ядро пульсирует ~1 Гц, цвет/яркость от вероятности и уверенности;
 *  - кольца-гироскоп, частицы на сделках, параллакс мыши, тултипы аналогов;
 *  - ядро ПУБЛИКУЕТ показания наружу: событие `aps-out` → панель AI Metrics
 *    вспыхивает, агент запускает пакет по кабелю в окно метрик;
 *  - eco / prefers-reduced-motion → упрощённый режим.
 */

type Api = {
  setForecast: (f: ForecastBrief | null) => void;
  burst: () => void;
  dispose: () => void;
};

const DIR_UP = new THREE.Color("#19F58A");
const DIR_DOWN = new THREE.Color("#FF3B5C");
const DIR_FLAT = new THREE.Color("#2DD4FF");
const AMBER = new THREE.Color("#FFB020");

/** Насечки гимбала: каждые 5°, длинные каждые 30° (Exercise §C1).
 *  Округление до 0.01 — Math.cos даёт разный последний бит в Node и в браузере,
 *  из-за чего гидрация ругалась на несовпадение x1="…4727" vs "…473". */
const R2 = (n: number) => Math.round(n * 100) / 100;
const DIAL_TICKS = Array.from({ length: 72 }, (_, i) => {
  const a = (i * 5 * Math.PI) / 180;
  const long = i % 18 === 0;
  const mid = i % 6 === 0;
  const r0 = long ? 85 : mid ? 90 : 93;
  return (
    <line
      key={i}
      x1={R2(100 + Math.cos(a) * r0)}
      y1={R2(100 + Math.sin(a) * r0)}
      x2={R2(100 + Math.cos(a) * 97)}
      y2={R2(100 + Math.sin(a) * 97)}
      stroke="rgba(45,212,255,0.65)"
      strokeWidth={long ? 1.6 : 0.7}
    />
  );
});
const DIAL_LABELS: [string, number, number][] = [
  ["0", 100, 12],
  ["90", 188, 103],
  ["180", 100, 194],
  ["270", 12, 103],
];

function glowTexture(): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, "rgba(255,255,255,1)");
  grd.addColorStop(0.4, "rgba(255,255,255,0.45)");
  grd.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

function dirOf(a: Analog | null | undefined, f: ForecastBrief | null): "up" | "down" | "flat" {
  if (!a) return "flat";
  const h = f?.horizonDays ?? 7;
  const r = h >= 30 ? a.r30d : h >= 7 ? a.r7d : a.r1d;
  if (!Number.isFinite(r) || Math.abs(r) < 0.005) return "flat";
  return r > 0 ? "up" : "down";
}

export function NeuralSphere() {
  const mountRef = useRef<HTMLDivElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<Api | null>(null);
  const fRef = useRef<ForecastBrief | null>(null);
  const lastEventId = useRef(0);

  const { forecast, events, eco, reduced, symbol, swapKey } = useStore();
  const simple = eco || reduced;

  // ---- scene lifecycle ----------------------------------------------------
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    let w = mount.clientWidth || 600;
    let h = mount.clientHeight || 400;

    const renderer = new THREE.WebGLRenderer({ antialias: !simple, alpha: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, simple ? 1.25 : 2));
    renderer.setSize(w, h);
    renderer.domElement.style.position = "absolute";
    renderer.domElement.style.inset = "0";
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 100);
    camera.position.set(0, 0, 2.6);

    const parallax = new THREE.Group(); // mouse tilt
    const spin = new THREE.Group(); // 0.05 rev/s
    parallax.add(spin);
    scene.add(parallax);

    const tex = glowTexture();
    const disposables: { dispose: () => void }[] = [];

    // ---------- woven wire ball (reference-style) ----------
    const N = simple ? 1500 : 4600;
    const GA = Math.PI * (3 - Math.sqrt(5));

    const pPos = new Float32Array(N * 3);
    const pCol = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const y = 1 - (i / (N - 1)) * 2; // golden spiral
      const rr = Math.sqrt(Math.max(0, 1 - y * y));
      const th = GA * i;
      const rad = 1.0 + (Math.random() - 0.5) * 0.05;
      const x = Math.cos(th) * rr * rad;
      const z = Math.sin(th) * rr * rad;
      pPos[i * 3] = x;
      pPos[i * 3 + 1] = y * rad;
      pPos[i * 3 + 2] = z;
      // Dark ball with glowing poles (as on the reference): the equator stays
      // dim, only the top (cyan) and bottom (amber) bloom. Normal blending below
      // so overlapping lines can never sum to solid white.
      const t = (y + 1) / 2; // 0 = bottom … 1 = top
      const polar = Math.abs(t - 0.5) * 2; // 0 at equator → 1 at poles
      const intensity = (0.5 + 0.6 * polar) * (0.68 + Math.random() * 0.32);
      pCol[i * 3] = (1.0 + (0.17 - 1.0) * t) * intensity; // R: amber → cyan
      pCol[i * 3 + 1] = (0.55 + (0.83 - 0.55) * t) * intensity;
      pCol[i * 3 + 2] = (0.12 + (1.0 - 0.12) * t) * intensity;
    }

    // threads: spiral neighbours (tight wind) + a few long chords (tangle).
    // Too many long chords (i+233) merge into a solid haze — keep the ball readable.
    const pairs: number[] = [];
    for (let i = 0; i < N; i++) {
      pairs.push(i, (i + 1) % N);
      if (i % 4 === 0) pairs.push(i, (i + 41) % N);
      if (i % 47 === 0) pairs.push(i, (i + 233) % N);
    }
    const wireGeo = new THREE.BufferGeometry();
    wireGeo.setAttribute("position", new THREE.BufferAttribute(pPos, 3));
    wireGeo.setAttribute("color", new THREE.BufferAttribute(pCol, 3));
    const wireIdx = new Uint32Array(pairs);
    wireGeo.setIndex(new THREE.BufferAttribute(wireIdx, 1));
    const wireMat = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.7,
      blending: THREE.NormalBlending,
      depthWrite: false,
    });
    const wire = new THREE.LineSegments(wireGeo, wireMat);
    spin.add(wire);
    disposables.push(wireGeo, wireMat);

    const ptsGeo = new THREE.BufferGeometry();
    ptsGeo.setAttribute("position", new THREE.BufferAttribute(pPos.slice(), 3));
    ptsGeo.setAttribute("color", new THREE.BufferAttribute(pCol, 3));
    const ptsMat = new THREE.PointsMaterial({
      size: simple ? 0.022 : 0.016,
      map: tex,
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
      vertexColors: true,
      opacity: 0,
      sizeAttenuation: true,
    });
    const pts = new THREE.Points(ptsGeo, ptsMat);
    spin.add(pts);
    disposables.push(ptsGeo, ptsMat);

    // ---------- core ----------
    const coreMat = new THREE.MeshBasicMaterial({
      color: DIR_FLAT.clone(),
      transparent: true,
      opacity: 0.5,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.17, 24, 24), coreMat);
    spin.add(core);
    disposables.push(core.geometry, coreMat);

    const glowMat = new THREE.SpriteMaterial({
      map: tex,
      color: DIR_FLAT.clone(),
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const glow = new THREE.Sprite(glowMat);
    glow.scale.setScalar(0.7);
    spin.add(glow);
    disposables.push(glowMat);

    // ---------- gimbal rings ----------
    const rings: THREE.Group[] = [];
    const ringSpecs = [
      { r: 1.3, tube: 0.006, rx: 0.35, ry: 0, speed: 0.22, ticks: 48 },
      { r: 1.44, tube: 0.005, rx: -0.9, ry: 0.5, speed: -0.16, ticks: 0 },
      { r: 1.58, tube: 0.004, rx: 1.5, ry: -0.3, speed: 0.1, ticks: 24 },
    ];
    for (const s of ringSpecs) {
      const g = new THREE.Group();
      const mat = new THREE.MeshBasicMaterial({
        color: DIR_FLAT.clone(),
        transparent: true,
        opacity: 0.3,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const torus = new THREE.Mesh(new THREE.TorusGeometry(s.r, s.tube, 6, 128), mat);
      g.add(torus);
      disposables.push(torus.geometry, mat);
      if (s.ticks && !simple) {
        const tpts: number[] = [];
        for (let i = 0; i < s.ticks; i++) {
          const a = (i / s.ticks) * Math.PI * 2;
          const long = i % 6 === 0;
          const r1 = s.r + (long ? 0.035 : 0.018);
          tpts.push(Math.cos(a) * s.r, Math.sin(a) * s.r, 0, Math.cos(a) * r1, Math.sin(a) * r1, 0);
        }
        const tg = new THREE.BufferGeometry();
        tg.setAttribute("position", new THREE.Float32BufferAttribute(tpts, 3));
        const tm = new THREE.LineBasicMaterial({ color: 0x2dd4ff, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending });
        g.add(new THREE.LineSegments(tg, tm));
        disposables.push(tg, tm);
      }
      g.rotation.set(s.rx, s.ry, 0);
      parallax.add(g);
      rings.push(g);
      (g as any).__speed = s.speed;
    }

    // ---------- analog points + spokes (rebuilt on forecast) ----------
    let analogObj: THREE.Points | null = null;
    let spokeObj: THREE.LineSegments | null = null;
    let chordObj: THREE.LineSegments | null = null;

    const disposeAnalog = () => {
      for (const o of [analogObj, spokeObj, chordObj]) {
        if (!o) continue;
        spin.remove(o);
        o.geometry.dispose();
        (o.material as THREE.Material).dispose();
      }
      analogObj = spokeObj = chordObj = null;
    };

    let coreColorTarget = DIR_FLAT.clone();
    let glowTarget = 0.8;
    let coreOpacityTarget = 0.5;

    const buildAnalogs = (f: ForecastBrief | null) => {
      disposeAnalog();
      const list = ((f?.analogs ?? []) as Analog[]).slice(0, 50);
      if (!list.length) return;

      const pos = new Float32Array(list.length * 3);
      const col = new Float32Array(list.length * 3);
      const linePts: number[] = [];
      const lineCol: number[] = [];

      list.forEach((a, i) => {
        const dir = dirOf(a, f);
        const base = Math.acos(1 - (2 * (i + 0.5)) / list.length);
        const theta = Math.PI * (1 + Math.sqrt(5)) * i;
        const v = new THREE.Vector3(
          Math.sin(base) * Math.cos(theta),
          Math.cos(base),
          Math.sin(base) * Math.sin(theta),
        );
        // pull toward the pole of the outcome (UP → north, DOWN → south)
        v.y += dir === "up" ? 0.5 : dir === "down" ? -0.5 : 0;
        v.normalize().multiplyScalar(1.05);
        pos[i * 3] = v.x;
        pos[i * 3 + 1] = v.y;
        pos[i * 3 + 2] = v.z;
        const c = dir === "up" ? DIR_UP : dir === "down" ? DIR_DOWN : DIR_FLAT;
        const boost = 0.55 + a.sim * 0.45;
        col[i * 3] = c.r * boost;
        col[i * 3 + 1] = c.g * boost;
        col[i * 3 + 2] = c.b * boost;

        linePts.push(0, 0, 0, v.x, v.y, v.z);
        const dim = 0.12 + a.sim * 0.55;
        lineCol.push(c.r * dim * 0.5, c.g * dim * 0.5, c.b * dim * 0.5, c.r * dim, c.g * dim, c.b * dim);
      });

      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
      const mat = new THREE.PointsMaterial({
        size: 0.06,
        map: tex,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        vertexColors: true,
        sizeAttenuation: true,
      });
      analogObj = new THREE.Points(geo, mat);
      analogObj.userData.analogs = list;
      spin.add(analogObj);

      const lgeo = new THREE.BufferGeometry();
      lgeo.setAttribute("position", new THREE.Float32BufferAttribute(linePts, 3));
      lgeo.setAttribute("color", new THREE.Float32BufferAttribute(lineCol, 3));
      spokeObj = new THREE.LineSegments(
        lgeo,
        new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.5, blending: THREE.NormalBlending, depthWrite: false }),
      );
      spin.add(spokeObj);

      // chords between close-in-time analogs of the same direction
      const chords: number[] = [];
      const chordCol: number[] = [];
      let made = 0;
      for (let i = 0; i < list.length && made < 18; i++) {
        let best = -1;
        let bestD = Infinity;
        const di = dirOf(list[i], f);
        for (let j = i + 1; j < list.length; j++) {
          if (dirOf(list[j], f) !== di) continue;
          const d = Math.abs(list[j].t - list[i].t);
          if (d < bestD) {
            bestD = d;
            best = j;
          }
        }
        if (best >= 0) {
          chords.push(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2], pos[best * 3], pos[best * 3 + 1], pos[best * 3 + 2]);
          const c = di === "up" ? DIR_UP : di === "down" ? DIR_DOWN : DIR_FLAT;
          const sim = Math.min(list[i].sim, list[best].sim);
          chordCol.push(c.r * 0.1, c.g * 0.1, c.b * 0.1, c.r * sim * 0.5, c.g * sim * 0.5, c.b * sim * 0.5);
          made++;
        }
      }
      if (chords.length) {
        const cg = new THREE.BufferGeometry();
        cg.setAttribute("position", new THREE.Float32BufferAttribute(chords, 3));
        cg.setAttribute("color", new THREE.Float32BufferAttribute(chordCol, 3));
        chordObj = new THREE.LineSegments(
          cg,
          new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.4, blending: THREE.NormalBlending, depthWrite: false }),
        );
        spin.add(chordObj);
      }
    };

    const setForecast = (f: ForecastBrief | null) => {
      buildAnalogs(f);
      if (f) {
        const upBias = f.probUp >= f.probDown;
        coreColorTarget = f.clearEdge ? (upBias ? DIR_UP : DIR_DOWN) : AMBER.clone();
        glowTarget = 0.35 + f.confidence * 0.5;
        coreOpacityTarget = 0.25 + f.confidence * 0.5;
      } else {
        coreColorTarget = AMBER.clone();
        glowTarget = 0.4;
        coreOpacityTarget = 0.28;
      }
    };
    setForecast(fRef.current);

    // ---------- burst particles ----------
    const P = simple ? 0 : 36;
    let burstPts: THREE.Points | null = null;
    const dirs: THREE.Vector3[] = [];
    const lives: number[] = [];
    if (P) {
      const bp = new Float32Array(P * 3);
      const bg = new THREE.BufferGeometry();
      bg.setAttribute("position", new THREE.BufferAttribute(bp, 3));
      const bm = new THREE.PointsMaterial({
        size: 0.05,
        map: tex,
        color: 0x2dd4ff,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      burstPts = new THREE.Points(bg, bm);
      scene.add(burstPts);
      disposables.push(bg, bm);
      for (let i = 0; i < P; i++) {
        dirs.push(new THREE.Vector3());
        lives.push(2); // >1 = inactive
      }
    }

    const burst = () => {
      if (!burstPts) return;
      let launched = 0;
      for (let i = 0; i < P && launched < 14; i++) {
        if (lives[i] <= 1) continue;
        const v = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(2.8);
        dirs[i].copy(v);
        lives[i] = 0;
        launched++;
      }
    };

    // ---------- mouse / raycast ----------
    const ndc = new THREE.Vector2(0, 0);
    let pointerInside = false;
    const onMove = (e: PointerEvent) => {
      const r = mount.getBoundingClientRect();
      ndc.x = ((e.clientX - r.left) / r.width) * 2 - 1;
      ndc.y = -(((e.clientY - r.top) / r.height) * 2 - 1);
      pointerInside = true;
    };
    const onLeave = () => {
      pointerInside = false;
      ndc.set(0, 0);
      if (tipRef.current) tipRef.current.style.opacity = "0";
    };
    mount.addEventListener("pointermove", onMove);
    mount.addEventListener("pointerleave", onLeave);

    const ray = new THREE.Raycaster();
    ray.params.Points = { threshold: 0.07 } as any;

    // ---------- resize ----------
    const wrap = mount.parentElement as HTMLElement | null;
    const resize = () => {
      // круг шара (Exercise §C1): D = min(W,H)·0.9 с запасом под подписи UP/DOWN/текст
      if (wrap) {
        const W = wrap.clientWidth || 600;
        const H = wrap.clientHeight || 400;
        const D = Math.max(150, Math.min(Math.min(W, H) * 0.9, H - 168));
        wrap.style.setProperty("--D", `${Math.round(D)}px`);
      }
      w = mount.clientWidth || 600;
      h = mount.clientHeight || 400;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap ?? mount);

    // ---------- core → AI Metrics publication (data flow: sphere → metrics) ----------
    const publish = () => {
      const f = fRef.current;
      if (!f) return;
      const conf = Math.round(f.confidence * 100);
      const label = `P↑ ${(f.probUp * 100) | 0}% · conf ${conf}%`;
      window.dispatchEvent(
        new CustomEvent("aps-out", {
          detail: {
            label,
            probUp: f.probUp,
            confidence: f.confidence,
            analogs: f.count,
            horizon: f.horizonDays,
            at: Date.now(),
          },
        }),
      );
      burst(); // core flashes when it publishes
    };

    // ---------- loop ----------
    let raf = 0;
    let rotY = 0;
    let rotX = 0;
    const t0 = performance.now();
    let prev = t0;

    const loop = () => {
      raf = requestAnimationFrame(loop);
      const now = performance.now();
      const dt = Math.min(0.05, (now - prev) / 1000);
      prev = now;
      const elapsed = (now - t0) / 1000;

      // intro assembly: wire ball "winds up" from a point
      const introP = simple ? 1 : Math.min(1, elapsed / 1.4);
      const ease = 1 - Math.pow(1 - introP, 3);
      ptsMat.opacity = 0.85 * ease;
      wireMat.opacity = 0.7 * ease;
      spin.scale.setScalar(0.06 + 0.94 * ease);

      // autorotation 0.05 rev/s (halved feel in eco)
      const speed = (simple ? 0.16 : Math.PI * 2 * 0.05) * dt;
      rotY += speed;
      parallax.rotation.y += ((pointerInside ? ndc.x * 0.45 : 0) - parallax.rotation.y) * 0.05;
      parallax.rotation.x += ((pointerInside ? -ndc.y * 0.3 : 0) - parallax.rotation.x) * 0.05;
      spin.rotation.y = rotY;
      void rotX;

      // core heartbeat ~1 Hz + colour/brightness easing
      const beat = 1 + Math.sin(elapsed * Math.PI * 2) * 0.09;
      core.scale.setScalar(beat * (0.85 + (fRef.current?.confidence ?? 0.3) * 0.5));
      glow.scale.setScalar(glowTarget * beat * (1 + (fRef.current?.confidence ?? 0.3) * 0.3));
      coreMat.color.lerp(coreColorTarget, 0.05);
      glowMat.color.lerp(coreColorTarget, 0.05);
      coreMat.opacity += (coreOpacityTarget * (0.75 + 0.25 * Math.sin(elapsed * Math.PI * 2)) - coreMat.opacity) * 0.08;
      glowMat.opacity += (glowTarget * 0.7 - glowMat.opacity) * 0.08;

      // rings counter-rotate
      for (const g of rings) g.rotation.z += (g as any).__speed * dt;

      // burst particles fly to the core
      if (burstPts) {
        const posAttr = burstPts.geometry.getAttribute("position") as THREE.BufferAttribute;
        let anyActive = false;
        for (let i = 0; i < P; i++) {
          if (lives[i] > 1) continue;
          anyActive = true;
          lives[i] += dt / 1.1;
          const pr = Math.min(1, lives[i]);
          const e = 1 - Math.pow(1 - pr, 3);
          const r = (1 - e) * 1;
          posAttr.setXYZ(i, dirs[i].x * r * 0.6, dirs[i].y * r * 0.6, dirs[i].z * r * 0.6);
          if (pr >= 1) lives[i] = 2;
        }
        if (anyActive) {
          posAttr.needsUpdate = true;
          (burstPts.material as THREE.PointsMaterial).opacity = 0.9;
        } else {
          (burstPts.material as THREE.PointsMaterial).opacity *= 0.9;
        }
      }

      // hover tooltip on analog points
      if (pointerInside && analogObj && tipRef.current) {
        ray.setFromCamera(ndc, camera);
        const hits = ray.intersectObject(analogObj, false);
        if (hits.length) {
          const i = hits[0].index ?? 0;
          const a = (analogObj.userData.analogs as Analog[])[i];
          const f = fRef.current;
          if (a && f) {
            const h = f.horizonDays;
            const r = h >= 30 ? a.r30d : h >= 7 ? a.r7d : a.r1d;
            tipRef.current.innerHTML =
              `<b>${a.label}</b><br/>схожесть ${(a.sim * 100).toFixed(0)}%<br/>` +
              `через ${h} дн: <span style="color:${r >= 0 ? "#19F58A" : "#FF3B5C"}">${fmtPct(r, 1)}</span>`;
            const v = hits[0].point.clone().project(camera);
            const x = (v.x * 0.5 + 0.5) * w;
            const y = (-v.y * 0.5 + 0.5) * h;
            tipRef.current.style.transform = `translate(${Math.round(x + 12)}px, ${Math.round(y - 8)}px)`;
            tipRef.current.style.opacity = "1";
          }
        } else {
          tipRef.current.style.opacity = "0";
        }
      }

      renderer.render(scene, camera);
    };
    loop();

    const api: Api = {
      setForecast,
      burst,
      dispose: () => {
        cancelAnimationFrame(raf);
        ro.disconnect();
        mount.removeEventListener("pointermove", onMove);
        mount.removeEventListener("pointerleave", onLeave);
        disposeAnalog();
        for (const d of disposables) d.dispose();
        tex.dispose();
        for (const g of rings) {
          g.traverse((o: any) => {
            o.geometry?.dispose?.();
            o.material?.dispose?.();
          });
        }
        renderer.dispose();
        renderer.domElement.remove();
      },
    };
    apiRef.current = api;

    return () => {
      api.dispose();
      apiRef.current = null;
    };
  }, [simple]);

  // forecast → sphere visuals
  useEffect(() => {
    fRef.current = forecast;
    apiRef.current?.setForecast(forecast);
  }, [forecast]);

  // core → AI Metrics: publish readings now and every 8s (data flow sphere → metrics)
  useEffect(() => {
    const pub = () => apiRef.current && window.dispatchEvent(new CustomEvent("aps-ping"));
    pub();
    const iv = setInterval(() => {
      const evt = new CustomEvent("aps-out", {
        detail: (() => {
          const f = fRef.current;
          if (!f) return { label: "⌁ ожидание", at: Date.now() };
          return {
            label: `P↑ ${(f.probUp * 100) | 0}% · conf ${Math.round(f.confidence * 100)}%`,
            probUp: f.probUp,
            confidence: f.confidence,
            analogs: f.count,
            horizon: f.horizonDays,
            at: Date.now(),
          };
        })(),
      });
      window.dispatchEvent(evt);
      apiRef.current?.burst();
    }, 8000);
    return () => clearInterval(iv);
  }, [symbol, swapKey]);

  // trades → particle bursts
  useEffect(() => {
    const e = events[0];
    if (e && e.id !== lastEventId.current) {
      const first = lastEventId.current === 0;
      lastEventId.current = e.id;
      if (!first && (e.kind === "trade" || e.kind === "whale")) apiRef.current?.burst();
    }
  }, [events]);

  const p = forecast;
  const pct = (v: number) => `${Math.round(v * 100)}%`;

  return (
    <div className="sphere-wrap" key={`${symbol}-${swapKey}`}>
      <div className="sphere-mount" ref={mountRef} />
      <svg className="dial" viewBox="0 0 200 200" aria-hidden>
        <circle cx="100" cy="100" r="97" fill="none" stroke="rgba(45,212,255,0.4)" strokeWidth="1" />
        <circle cx="100" cy="100" r="74" fill="none" stroke="rgba(45,212,255,0.16)" strokeWidth="0.6" strokeDasharray="2 5" />
        {DIAL_TICKS}
        {DIAL_LABELS.map(([txt, x, y]) => (
          <text key={txt} x={x} y={y} textAnchor="middle" fill="rgba(45,212,255,0.75)" fontSize="8" fontFamily="JetBrains Mono, monospace">{txt}</text>
        ))}
      </svg>
      <div className="tip mono" ref={tipRef} />

      <div className="pole up">
        <span className="k">UP</span>
        <span className="v bull glow-bull">{p ? pct(p.probUp) : "—"}</span>
      </div>
      <div className="pole down">
        <span className="v bear glow-bear">{p ? pct(p.probDown) : "—"}</span>
        <span className="k">DOWN</span>
      </div>
      <div className="pole flat">
        <span className="k">FLAT</span>
        <span className="v dim">{p ? pct(p.probFlat) : "—"}</span>
      </div>

      {!p?.clearEdge && <div className="edge amber glow-amber">NO CLEAR EDGE</div>}

      <div className={"recv-badge mono"}>ПРИЁМ · ядро → AI Metrics</div>
      <div className="summary mono">{p?.text ?? "поиск исторических аналогов…"}</div>

      <Style>{sphereCss}</Style>
    </div>
  );
}

const sphereCss = `
.sphere-wrap { position: relative; height: 100%; min-height: 0; overflow: hidden; }
.sphere-mount { position: absolute; left: 50%; top: 50%; width: var(--D, 86%); height: var(--D, 86%); transform: translate(-50%, -50%); }
.sphere-mount canvas { display: block; }
.dial {
  position: absolute; left: 50%; top: 50%;
  width: var(--D, 86%); height: var(--D, 86%);
  transform: translate(-50%, -50%);
  pointer-events: none; z-index: 1; overflow: visible;
  animation: dialSpin 160s linear infinite;
}
@keyframes dialSpin { to { transform: translate(-50%, -50%) rotate(360deg); } }
.tip {
  position: absolute; left: 0; top: 0; z-index: 5; pointer-events: none;
  background: rgba(5,10,18,0.95); border: 1px solid var(--cyan);
  padding: calc(var(--u) * 7) calc(var(--u) * 9);
  font-size: var(--fs-xs); line-height: 1.55; color: var(--ink);
  opacity: 0; transition: opacity 0.15s; white-space: nowrap;
  box-shadow: 0 0 16px rgba(45,212,255,0.3);
}
.tip b { color: var(--cyan); letter-spacing: 0.08em; }
.pole { position: absolute; display: flex; align-items: baseline; gap: calc(var(--u) * 8); font-family: "Orbitron", sans-serif; pointer-events: none; z-index: 2; }
.pole .k { font-size: var(--fs-l); letter-spacing: 0.22em; color: var(--ink); opacity: 0.85; }
.pole .v { font-size: clamp(16px, calc(var(--D, 300px) * 0.115), var(--fs-xl)); font-weight: 800; font-family: "JetBrains Mono", monospace; }
/* labels outside the circle (Exercise C1): UP on top, DOWN right under the circle */
.pole.up { top: calc(var(--u) * 6); left: 50%; transform: translateX(-50%); flex-direction: column; align-items: center; gap: 0; }
.pole.down { bottom: calc((100% - var(--D, 86%)) / 2 + var(--u) * 2); left: 50%; transform: translateX(-50%); flex-direction: column-reverse; align-items: center; gap: 0; }
.pole.flat { top: calc(50% + var(--D, 86%) * 0.42); right: calc(var(--u) * 4); flex-direction: column; align-items: flex-end; gap: 0; }
.pole.flat .k, .pole.flat .v { font-size: var(--fs-s); letter-spacing: 0.14em; }
.edge {
  position: absolute; top: calc(var(--u) * 12); right: calc(var(--u) * 14);
  font-family: "JetBrains Mono", monospace; font-size: var(--fs-s);
  letter-spacing: 0.18em; animation: dotBlink 1.6s ease-in-out infinite;
}
.summary {
  position: absolute; left: calc(var(--u) * 8); right: calc(var(--u) * 8);
  bottom: calc(var(--u) * 4); text-align: center; z-index: 2;
  font-size: calc(var(--fs-xs) * 0.95); color: var(--dim);
  letter-spacing: 0.04em; line-height: 1.5;
  background: linear-gradient(90deg, transparent, rgba(5,10,18,0.85) 15%, rgba(5,10,18,0.85) 85%, transparent);
  padding: calc(var(--u) * 4) 0; pointer-events: none;
}
.recv-badge { position: static; }
@media (max-width: 699px) {
  .sphere-wrap { min-height: calc(var(--u) * 380); }
  .pole .v { font-size: clamp(15px, calc(var(--D, 260px) * 0.13), calc(var(--u) * 46)); }
}
`;
