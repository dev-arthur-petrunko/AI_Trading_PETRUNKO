"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { useStore } from "@/lib/store";
import type { ForecastBrief, Analog } from "@/lib/types";
import { fmtPct } from "@/lib/format";
import { AgentSwarm } from "@/components/panels/Agents";

/**
 * NEURAL SPHERE (Three.js):
 * - background point-field (historical texture) on a slowly rotating sphere,
 * - analog points pulled toward UP (green) / DOWN (red) poles by their outcome,
 * - spokes from the core with brightness = similarity,
 * - glowing core pulsing ~1 Hz, colour/size/brightness from the probability,
 * - counter-rotating gimbal rings with tick marks,
 * - data particles flying to the core when trades arrive,
 * - mouse parallax + hover tooltip on analog points,
 * - intro "assembles from points" (disabled in eco / reduced-motion).
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
    camera.position.set(0, 0, 3.4);

    const parallax = new THREE.Group(); // mouse tilt
    const spin = new THREE.Group(); // 0.05 rev/s autorotation
    parallax.add(spin);
    scene.add(parallax);

    const tex = glowTexture();

    // ---------- background point field ----------
    const N = simple ? 700 : 2400;
    const fieldGeo = new THREE.BufferGeometry();
    const fPos = new Float32Array(N * 3);
    const fCol = new Float32Array(N * 3);
    const GA = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < N; i++) {
      const y = 1 - (i / (N - 1)) * 2;
      const rr = Math.sqrt(Math.max(0, 1 - y * y));
      const th = GA * i;
      const rad = 0.94 + Math.random() * 0.09;
      fPos[i * 3] = Math.cos(th) * rr * rad;
      fPos[i * 3 + 1] = y * rad;
      fPos[i * 3 + 2] = Math.sin(th) * rr * rad;
      const mix = Math.random();
      fCol[i * 3] = 0.18 * mix + 0.05;
      fCol[i * 3 + 1] = 0.72 * mix + 0.2;
      fCol[i * 3 + 2] = 0.95 * mix + 0.35;
    }
    fieldGeo.setAttribute("position", new THREE.BufferAttribute(fPos, 3));
    fieldGeo.setAttribute("color", new THREE.BufferAttribute(fCol, 3));
    const fieldMat = new THREE.PointsMaterial({
      size: simple ? 0.022 : 0.018,
      map: tex,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexColors: true,
      opacity: 0,
      sizeAttenuation: true,
    });
    const field = new THREE.Points(fieldGeo, fieldMat);
    spin.add(field);

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

    const glowMat = new THREE.SpriteMaterial({
      map: tex,
      color: DIR_FLAT.clone(),
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const glow = new THREE.Sprite(glowMat);
    glow.scale.setScalar(1.1);
    spin.add(glow);

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
        opacity: 0.32,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      g.add(new THREE.Mesh(new THREE.TorusGeometry(s.r, s.tube, 6, 128), mat));
      if (s.ticks && !simple) {
        const pts: number[] = [];
        for (let i = 0; i < s.ticks; i++) {
          const a = (i / s.ticks) * Math.PI * 2;
          const long = i % 6 === 0;
          const r1 = s.r + (long ? 0.035 : 0.018);
          pts.push(Math.cos(a) * s.r, Math.sin(a) * s.r, 0, Math.cos(a) * r1, Math.sin(a) * r1, 0);
        }
        const tg = new THREE.BufferGeometry();
        tg.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
        g.add(
          new THREE.LineSegments(
            tg,
            new THREE.LineBasicMaterial({ color: 0x2dd4ff, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending }),
          ),
        );
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
      const list = (f?.analogs ?? []).slice(0, 50) as Analog[];
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
        // pull toward the pole of the outcome
        v.y += dir === "up" ? 0.5 : dir === "down" ? -0.5 : 0;
        v.normalize().multiplyScalar(1.03);
        pos[i * 3] = v.x;
        pos[i * 3 + 1] = v.y;
        pos[i * 3 + 2] = v.z;
        const c = dir === "up" ? DIR_UP : dir === "down" ? DIR_DOWN : DIR_FLAT;
        const boost = 0.55 + a.sim * 0.45;
        col[i * 3] = c.r * boost;
        col[i * 3 + 1] = c.g * boost;
        col[i * 3 + 2] = c.b * boost;

        // spoke: core → point, brightness = similarity
        linePts.push(0, 0, 0, v.x, v.y, v.z);
        const dim = 0.12 + a.sim * 0.55;
        lineCol.push(c.r * dim * 0.5, c.g * dim * 0.5, c.b * dim * 0.5, c.r * dim, c.g * dim, c.b * dim);
      });

      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
      const mat = new THREE.PointsMaterial({
        size: 0.055,
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
        new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false }),
      );
      spin.add(spokeObj);

      // chords between close-in-time analogs of the same direction (similarity mesh)
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
          new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }),
        );
        spin.add(chordObj);
      }
    };

    const setForecast = (f: ForecastBrief | null) => {
      buildAnalogs(f);
      if (f) {
        const upBias = f.probUp >= f.probDown;
        coreColorTarget = f.clearEdge ? (upBias ? DIR_UP : DIR_DOWN) : AMBER.clone();
        glowTarget = 0.55 + f.confidence * 0.9;
        coreOpacityTarget = 0.3 + f.confidence * 0.7;
      } else {
        coreColorTarget = AMBER.clone();
        glowTarget = 0.55;
        coreOpacityTarget = 0.3;
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
    const ro = new ResizeObserver(() => {
      w = mount.clientWidth || 600;
      h = mount.clientHeight || 400;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    });
    ro.observe(mount);

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

      // intro assembly: fade + scale in
      const introP = simple ? 1 : Math.min(1, elapsed / 1.4);
      const ease = 1 - Math.pow(1 - introP, 3);
      fieldMat.opacity = 0.75 * ease;
      spin.scale.setScalar(0.06 + 0.94 * ease);

      // autorotation 0.05 rev/s (halved in eco)
      const speed = (simple ? 0.16 : Math.PI * 2 * 0.05) * dt;
      rotY += speed;
      parallax.rotation.y += ((pointerInside ? ndc.x * 0.45 : 0) - parallax.rotation.y) * 0.05;
      parallax.rotation.x += ((pointerInside ? -ndc.y * 0.3 : 0) - parallax.rotation.x) * 0.05;
      spin.rotation.y = rotY;
      void rotX;

      // core heartbeat ~1 Hz + colour/brightness easing
      const beat = 1 + Math.sin(elapsed * Math.PI * 2) * 0.09;
      core.scale.setScalar(beat * (0.85 + (fRef.current?.confidence ?? 0.3) * 0.5));
      glow.scale.setScalar(glowTarget * beat * (1 + (fRef.current?.confidence ?? 0.3) * 0.4));
      coreMat.color.lerp(coreColorTarget, 0.05);
      glowMat.color.lerp(coreColorTarget, 0.05);
      coreMat.opacity += (coreOpacityTarget * (0.75 + 0.25 * Math.sin(elapsed * Math.PI * 2)) - coreMat.opacity) * 0.08;
      glowMat.opacity += (glowTarget * 0.9 - glowMat.opacity) * 0.08;

      // rings counter-rotate
      for (const g of rings) g.rotation.z += ((g as any).__speed) * dt;

      // burst particles fly to the core
      if (burstPts) {
        const posAttr = burstPts.geometry.getAttribute("position") as THREE.BufferAttribute;
        let anyActive = false;
        for (let i = 0; i < P; i++) {
          if (lives[i] > 1) continue;
          anyActive = true;
          lives[i] += dt / 1.1;
          const p = Math.min(1, lives[i]);
          const e = 1 - Math.pow(1 - p, 3);
          const r = (1 - e) * 1;
          posAttr.setXYZ(i, dirs[i].x * r * 0.6, dirs[i].y * r * 0.6, dirs[i].z * r * 0.6);
          if (p >= 1) lives[i] = 2;
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
        fieldGeo.dispose();
        fieldMat.dispose();
        core.geometry.dispose();
        coreMat.dispose();
        glowMat.dispose();
        for (const g of rings) {
          g.traverse((o: any) => {
            o.geometry?.dispose?.();
            o.material?.dispose?.();
          });
        }
        burstPts?.geometry.dispose();
        (burstPts?.material as THREE.Material)?.dispose();
        tex.dispose();
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

  // forecast → sphere
  useEffect(() => {
    fRef.current = forecast;
    apiRef.current?.setForecast(forecast);
  }, [forecast]);

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
      <div className="tip mono" ref={tipRef} />
      <AgentSwarm />

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

      {!p?.clearEdge && (
        <div className="edge amber glow-amber">NO CLEAR EDGE</div>
      )}

      <div className="summary mono">{p?.text ?? "поиск исторических аналогов…"}</div>

      <style>{`
        .sphere-wrap { position: relative; height: 100%; min-height: 0; overflow: hidden; }
        .sphere-mount { position: absolute; inset: 0; }
        .sphere-mount canvas { display: block; }
        .tip {
          position: absolute; left: 0; top: 0; z-index: 5; pointer-events: none;
          background: rgba(5,10,18,0.95); border: 1px solid var(--cyan);
          padding: calc(var(--u) * 7) calc(var(--u) * 9);
          font-size: var(--fs-xs); line-height: 1.55; color: var(--ink);
          opacity: 0; transition: opacity 0.15s; white-space: nowrap;
          box-shadow: 0 0 16px rgba(45,212,255,0.3);
        }
        .tip b { color: var(--cyan); letter-spacing: 0.08em; }
        .pole {
          position: absolute; display: flex; align-items: baseline; gap: calc(var(--u) * 8);
          font-family: "Orbitron", sans-serif; pointer-events: none;
        }
        .pole .k { font-size: var(--fs-l); letter-spacing: 0.22em; color: var(--ink); opacity: 0.85; }
        .pole .v { font-size: var(--fs-xl); font-weight: 800; font-family: "JetBrains Mono", monospace; }
        .pole.up { top: calc(var(--u) * 10); left: 50%; transform: translateX(-50%); flex-direction: column; align-items: center; gap: 0; }
        .pole.down { bottom: calc(var(--u) * 44); left: 50%; transform: translateX(-50%); flex-direction: column; align-items: center; gap: 0; }
        .pole.flat { bottom: calc(var(--u) * 44); right: calc(var(--u) * 14); flex-direction: column; align-items: flex-end; gap: 0; }
        .pole.flat .k, .pole.flat .v { font-size: var(--fs-s); letter-spacing: 0.14em; }
        .edge {
          position: absolute; top: calc(var(--u) * 12); right: calc(var(--u) * 14);
          font-family: "JetBrains Mono", monospace; font-size: var(--fs-s);
          letter-spacing: 0.18em; animation: dotBlink 1.6s ease-in-out infinite;
        }
        .summary {
          position: absolute; left: calc(var(--u) * 12); right: calc(var(--u) * 12);
          bottom: calc(var(--u) * 8); text-align: center;
          font-size: calc(var(--fs-xs) * 0.95); color: var(--dim);
          letter-spacing: 0.04em; line-height: 1.5;
          background: linear-gradient(90deg, transparent, rgba(5,10,18,0.85) 15%, rgba(5,10,18,0.85) 85%, transparent);
          padding: calc(var(--u) * 4) 0; pointer-events: none;
        }
        @media (max-width: 1024px) {
          .sphere-wrap { min-height: calc(var(--u) * 360); }
          .pole .v { font-size: calc(var(--u) * 30); }
        }
      `}</style>
    </div>
  );
}
