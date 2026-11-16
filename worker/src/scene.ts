/**
 * 프로필 README 맨 아래 픽셀 그림: 공부방. 서울의 시간대와 날씨에 맞춰 그때그때 다시 그려요.
 * 3px을 한 칸으로 280x100칸(840x300px). 책장 위 시계는 그림을 받은 순간부터 실제 시간처럼 흘러가요.
 */
import { SCENE_FONT } from "./sceneFont";
import type { Phase, Weather } from "./weather";
import { ACTIVITY_KO, type Activity } from "./schedule";

export type RandomEvent = "catRun" | "bird" | "mug" | "stretch" | "turn" | "meteor" | "pageFlip";

export interface SceneEvents {
  commit: boolean; // 방금 커밋 (30분)
  post: boolean; // 블로그에 글 (1시간)
  merged: boolean; // PR 머지 (2시간)
  star: boolean; // 스타 (24시간)
  streak: number; // 연속 활동 일수
}

export const NO_EVENTS: SceneEvents = { commit: false, post: false, merged: false, star: false, streak: 0 };

export interface SceneInput {
  theme: "light" | "dark";
  phase: Phase;
  weather: Weather;
  label: string; // 날씨 이름 (예: 흐림)
  tempC: number | null;
  now: number; // epoch ms
  month: number; // 1~12 (서울)
  activity?: Activity; // 생활 시간표에서 지금 하는 일
  events?: SceneEvents;
  random?: { kind: RandomEvent | null; offset: number }; // 랜덤 사건과 40초 고리 안에서 시작 위치(초)
}

/** 지금 상황에서 일어날 수 있는 랜덤 사건 중 하나를 골라요. 15%는 아무 일도 없어요. */
export function pickRandomEvent(activity: Activity, phase: Phase, weather: Weather, roll: () => number): RandomEvent | null {
  const clear = weather === "clear" || weather === "partly";
  const desk = activity === "study";
  const pool: [RandomEvent, number][] = [["catRun", 3]];
  if (phase === "day" && clear) pool.push(["bird", 3]);
  if (phase === "night" && clear) pool.push(["meteor", 2]);
  if (desk) pool.push(["mug", 2], ["stretch", 3]);
  if (activity === "sleep") pool.push(["turn", 3]);
  if (activity === "rest") pool.push(["pageFlip", 3]);
  if (roll() < 0.15) return null;
  const total = pool.reduce((a, [, w]) => a + w, 0);
  let x = roll() * total;
  for (const [k, w] of pool) { if ((x -= w) < 0) return k; }
  return pool[0][0];
}

/** 시간표, GitHub 활동을 합쳐 화면에 보일 상황을 정해요. */
export function situation(activity: Activity, ev: SceneEvents) {
  const busy = ev.commit || ev.post;
  const atDesk = activity === "study" || (busy && (activity === "sleep" || activity === "wash" || activity === "rest" || activity === "ready"));
  const label = activity === "study" ? ACTIVITY_KO.study : atDesk ? "작업 중" : ACTIVITY_KO[activity];
  const shown: Activity = atDesk ? "study" : activity;
  return { atDesk, label, shown, home: shown !== "work", awake: shown !== "sleep" };
}

const P = 3;
const W = 280;
const H = 100;
const SEASON = ["#8a63d2", "#3f8fe0", "#25ad9e", "#48b058", "#e2a52c", "#f0843a", "#e0483e", "#d457a8", "#4a5bd6"];
const KST = 9 * 3600 * 1000;

/** 같은 그림이 나오게 씨앗을 고정한 난수 */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Look {
  sky: [string, string];
  wall: string;
  wallTop: string;
  stripe: string;
  floor: string;
  floorLine: string;
  lamp: boolean;
  city: boolean;
  bulbs: boolean;
  vignette: number;
  grade: [string, number] | null;
  shaft: string; // 창빛 색
  shaftOp: number;
}

function lookOf(phase: Phase, weather: Weather): Look {
  const overcast = weather !== "clear" && weather !== "partly";
  const base: Record<Phase, Look> = {
    night: { sky: ["#14286b", "#2f5fd0"], wall: "#141c38", wallTop: "#0e1429", stripe: "#18213f", floor: "#10162c", floorLine: "#0c1124", lamp: true, city: true, bulbs: true, vignette: 0.8, grade: ["#1b2b7a", 0.22], shaft: "#6f9cff", shaftOp: 0.22 },
    dawn: { sky: ["#2b3b85", "#f0b49e"], wall: "#20284a", wallTop: "#182040", stripe: "#252e54", floor: "#171d36", floorLine: "#13182e", lamp: true, city: true, bulbs: true, vignette: 0.6, grade: ["#4a3f8a", 0.14], shaft: "#ffc9b0", shaftOp: 0.2 },
    day: { sky: ["#4f97e6", "#bfe3ff"], wall: "#34446f", wallTop: "#2c3a61", stripe: "#3a4b7a", floor: "#2a2c48", floorLine: "#24263f", lamp: false, city: false, bulbs: false, vignette: 0.35, grade: null, shaft: "#fff1c9", shaftOp: 0.3 },
    dusk: { sky: ["#3a2a70", "#f28c5a"], wall: "#272244", wallTop: "#1f1b3a", stripe: "#2d274d", floor: "#1c1830", floorLine: "#17142a", lamp: true, city: true, bulbs: true, vignette: 0.6, grade: ["#6a2f6e", 0.16], shaft: "#ffb07a", shaftOp: 0.25 },
  };
  const l = { ...base[phase] };
  if (overcast) {
    const grey: Record<Phase, [string, string]> = {
      night: ["#151b30", "#2c3654"],
      dawn: ["#3a3f66", "#9a8fa3"],
      day: ["#7d8ca8", "#c3cbd8"],
      dusk: ["#3e3352", "#a0757a"],
    };
    l.sky = grey[phase];
    l.shaftOp *= 0.6;
    if (phase === "day") l.shaft = "#dfe7f5";
  }
  return l;
}

export function renderScene(s: SceneInput): string {
  const line = s.theme === "light" ? "#33415c" : "#5a77b0";
  const look = lookOf(s.phase, s.weather);
  const ev = s.events ?? NO_EVENTS;
  const sit = situation(s.activity ?? "study", ev);
  const rand = s.random ?? { kind: null, offset: 0 };
  const evStyle = `animation-delay:-${rand.offset.toFixed(1)}s`;
  // 집에 있고 깨어 있을 때만 스탠드와 줄 전구를 켜요. 나가 있거나 자면 모니터도 꺼요.
  look.lamp = look.lamp && sit.home && sit.awake;
  look.bulbs = look.bulbs && sit.home && sit.awake;
  const screenOn = sit.atDesk || ev.commit || ev.post;
  let catKeyframes = "";
  const rnd = rng(7);
  const o: string[] = [];
  const r = (x: number, y: number, w = 1, h = 1, c = "#000", op?: number, cls = "", style = "") =>
    o.push(`<rect x="${x * P}" y="${y * P}" width="${w * P}" height="${h * P}" fill="${c}"${cls ? ` class="${cls}"` : ""}${op !== undefined ? ` fill-opacity="${op}"` : ""}${style ? ` style="${style}"` : ""}/>`);
  const poly = (pts: [number, number][], fill: string, op?: number) =>
    `<polygon points="${pts.map(([x, y]) => `${x * P},${y * P}`).join(" ")}" fill="${fill}"${op !== undefined ? ` fill-opacity="${op}"` : ""}/>`;
  const raw = (x: string) => o.push(x);
  const wet = s.weather === "rain" || s.weather === "drizzle" || s.weather === "thunder";
  const snowing = s.weather === "snow";
  const clearish = s.weather === "clear" || s.weather === "partly";

  // ── 벽과 바닥 ──
  r(0, 0, W, 74, look.wall);
  r(0, 0, W, 8, look.wallTop);
  for (let x = 0; x < W; x += 14) r(x, 8, 1, 66, look.stripe);
  raw(`<rect x="0" y="0" width="${W * P}" height="${74 * P}" fill="url(#dith)"/>`);
  r(0, 72, W, 2, look.floorLine);
  r(0, 74, W, 26, look.floor);
  for (let y = 76; y < 100; y += 4) for (let x = (y * 7) % 18; x < W; x += 18) r(x, y, 12, 1, look.floorLine);

  // ── 창문 ──
  const wx = 124, wy = 12, ww = 70, wh = 40;
  r(wx - 3, wy - 3, ww + 6, wh + 6, "#2a3558");
  raw(`<rect x="${wx * P}" y="${wy * P}" width="${ww * P}" height="${wh * P}" fill="url(#sky)"/>`);
  raw(`<g clip-path="url(#win)">`);
  // 해, 달, 별
  if (clearish) {
    if (s.phase === "night") {
      r(wx + 52, wy + 5, 6, 7, "#ffe9a8");
      r(wx + 51, wy + 6, 1, 5, "#ffe9a8");
      r(wx + 55, wy + 4, 4, 5, look.sky[0]);
      raw(`<circle cx="${(wx + 54) * P}" cy="${(wy + 8) * P}" r="${8 * P}" fill="#ffe9a8" fill-opacity="0.12" filter="url(#bloom)"/>`);
      const stars: [number, number][] = [[4, 3], [11, 6], [17, 2], [23, 8], [29, 4], [6, 11], [14, 13], [40, 9], [34, 14], [2, 16], [46, 3], [63, 12]];
      stars.forEach(([x, y], i) => r(wx + x, wy + y, 1, 1, "#fff6c9", undefined, "tw", `animation-delay:-${((i * 0.37) % 2).toFixed(2)}s`));
    } else if (s.phase === "day") {
      raw(`<circle cx="${(wx + 54) * P}" cy="${(wy + 9) * P}" r="${16 * P}" fill="#fff6d6" fill-opacity="0.35" filter="url(#bloom)"/>`);
      raw(`<circle cx="${(wx + 54) * P}" cy="${(wy + 9) * P}" r="${5 * P}" fill="#fff8e1"/>`);
    } else {
      const sx = s.phase === "dawn" ? wx + 14 : wx + 52;
      raw(`<circle cx="${sx * P}" cy="${(wy + 30) * P}" r="${18 * P}" fill="${s.phase === "dawn" ? "#ffd7b8" : "#ffb070"}" fill-opacity="0.45" filter="url(#bloom)"/>`);
      raw(`<circle cx="${sx * P}" cy="${(wy + 30) * P}" r="${6 * P}" fill="${s.phase === "dawn" ? "#fff0d8" : "#ffd08a"}"/>`);
    }
  }
  // 구름
  const cloudCol = s.phase === "day" ? (clearish ? "#ffffff" : "#e3e8f0") : s.phase === "night" ? "#3e6fe0" : "#f3c6c0";
  const cloudOp = clearish ? (s.weather === "partly" ? 0.75 : 0.35) : 0.55;
  const clouds: [number, number, number][] = clearish && s.weather === "clear"
    ? [[6, 24, 14], [44, 27, 12]]
    : [[2, 6, 22], [24, 10, 26], [48, 5, 20], [4, 22, 18], [14, 24, 14], [30, 27, 22], [46, 23, 16], [58, 26, 12]];
  // 구름은 천천히 옆으로 흘러가요 (같은 구름 두 벌을 이어 붙여 끊김 없이)
  const cloudSet = (shift: number) => clouds.map(([cx, cy, cw]) =>
    `<rect x="${(wx + cx + shift) * P}" y="${(wy + cy) * P}" width="${cw * P}" height="${2 * P}" fill="${cloudCol}" fill-opacity="${cloudOp}"/>` +
    `<rect x="${(wx + cx + 2 + shift) * P}" y="${(wy + cy - 1) * P}" width="${(cw - 4) * P}" height="${P}" fill="${cloudCol}" fill-opacity="${(cloudOp * 0.8).toFixed(2)}"/>`).join("");
  raw(`<g class="${s.weather === "thunder" || s.weather === "rain" ? "clouds-fast" : "clouds"}">${cloudSet(0)}${cloudSet(-ww)}</g>`);
  // 먼 건물 (멀어서 흐리게)
  raw(`<g filter="url(#far)">`);
  const bcol = s.phase === "day" ? (clearish ? "#7d9bc4" : "#8592a8") : s.phase === "night" ? "#0f1f4d" : "#3a2f5a";
  for (const [bx, bh, bw] of [[0, 8, 7], [8, 12, 6], [15, 6, 9], [25, 10, 5], [31, 14, 7], [39, 7, 8], [48, 11, 6], [55, 9, 8], [64, 13, 6]]) {
    r(wx + bx, wy + wh - bh, bw, bh, bcol);
    for (let k = 0; k < Math.floor(bh / 3); k++) {
      const lit = rnd() < 0.45;
      const px = wx + bx + 1 + Math.floor(rnd() * Math.max(1, bw - 2));
      if (lit && look.city) r(px, wy + wh - bh + 1 + k * 3, 1, 1, "#ffd27a", 0.85);
    }
  }
  raw(`</g>`);
  if (ev.star) raw(`<g class="shoot" style="animation-delay:-2s"><rect x="${(wx + 8) * P}" y="${(wy + 4) * P}" width="${10 * P}" height="2" fill="#fff6c9" transform="rotate(18 ${(wx + 8) * P} ${(wy + 4) * P})"/></g>`);
  if (rand.kind === "meteor") raw(`<g class="ev" style="${evStyle}"><g class="meteor" style="${evStyle}"><rect x="${(wx + 20) * P}" y="${(wy + 2) * P}" width="${8 * P}" height="2" fill="#ffffff" transform="rotate(20 ${(wx + 20) * P} ${(wy + 2) * P})"/></g></g>`);
  if (s.weather === "fog") raw(`<rect x="${wx * P}" y="${wy * P}" width="${ww * P}" height="${wh * P}" fill="#cfd6e4" fill-opacity="0.45"/>`);
  if (s.weather === "thunder") raw(`<rect class="flash" x="${wx * P}" y="${wy * P}" width="${ww * P}" height="${wh * P}" fill="#e6eeff" fill-opacity="0"/>`);
  // 비
  if (wet) {
    const layers = s.weather === "drizzle" ? [[1, 0.3, 50]] : [[1, 0.35, 90], [2, 0.55, 50]];
    layers.forEach(([wd, op, n], i) => {
      const streaks: string[] = [];
      for (let k = 0; k < n; k++) {
        const x = wx + Math.floor(rnd() * ww);
        const y = wy - 40 + Math.floor(rnd() * 80);
        streaks.push(`<rect x="${x * P}" y="${y * P}" width="${wd}" height="${(4 + i * 2) * P}" fill="#cfe0ff" fill-opacity="${op}"/>`);
      }
      const b = streaks.join("");
      raw(`<g class="rain${i}">${b}<g transform="translate(0,${-40 * P})">${b}</g></g>`);
    });
  }
  // 눈
  if (snowing) {
    [[0, 40, 2, "sn0"], [1, 30, 3, "sn1"]].forEach(([, n, size, cls]) => {
      const flakes: string[] = [];
      for (let k = 0; k < (n as number); k++) {
        const x = wx + Math.floor(rnd() * ww);
        const y = wy - 40 + Math.floor(rnd() * 80);
        flakes.push(`<rect x="${x * P}" y="${y * P}" width="${size}" height="${size}" fill="#ffffff" fill-opacity="0.9"/>`);
      }
      const b = flakes.join("");
      raw(`<g class="${cls}">${b}<g transform="translate(0,${-40 * P})">${b}</g></g>`);
    });
  }
  raw(`</g>`);
  // 창틀과 창턱
  r(wx + ww / 2 - 1, wy, 2, wh, "#2a3558");
  r(wx, wy + 14, ww, 2, "#2a3558");
  r(wx - 5, wy + wh + 3, ww + 10, 2, "#34416a");
  if (snowing || ([12, 1, 2].includes(s.month) && s.weather !== "clear")) {
    r(wx - 5, wy + wh + 2, ww + 10, 1, "#eef3ff");
    for (let x = wx - 4; x < wx + ww + 4; x += 7) r(x, wy + wh + 1, 3, 1, "#eef3ff");
  }
  // 유리에 맺힌 물방울
  if (wet) {
    for (let k = 0; k < 40; k++) {
      const x = wx + 1 + Math.floor(rnd() * (ww - 2));
      const y = wy + 1 + Math.floor(rnd() * (wh - 2));
      raw(`<rect x="${x * P}" y="${y * P}" width="2" height="2" fill="#e4eeff" fill-opacity="0.55"/><rect x="${x * P}" y="${y * P + 2}" width="2" height="1" fill="#0b1440" fill-opacity="0.5"/>`);
    }
    for (let i = 0; i < 6; i++) {
      const x = wx + 4 + i * 11 + Math.floor(rnd() * 4);
      raw(`<g clip-path="url(#win)"><g class="drip" style="animation-delay:-${(i * 1.3).toFixed(1)}s;animation-duration:${(6 + (i % 3) * 1.5).toFixed(1)}s"><rect x="${x * P}" y="${(wy + 2) * P}" width="3" height="4" fill="#e4eeff" fill-opacity="0.7"/><rect x="${x * P + 1}" y="${(wy + 2) * P - 14}" width="1" height="14" fill="#cfe0ff" fill-opacity="0.25"/></g></g>`);
    }
  }
  // 커튼
  for (const [side, x0] of [["l", wx - 14], ["r", wx + ww - 2]] as const) {
    for (let i = 0; i < 16; i++) r(x0 + i, 8, 1, 50, i % 4 < 2 ? "#6c8de0" : "#5371c4", side === "l" ? 0.38 : 0.3);
    r(x0, 8, 16, 2, "#8aa6f0", 0.4);
  }
  r(wx - 18, 7, ww + 36, 1, "#4a5680");
  // 창빛
  raw(poly([[wx, wy + wh + 5], [wx + ww, wy + wh + 5], [wx + ww + 30, 100], [wx - 40, 100]], "url(#shaft)"));
  raw(`<g filter="url(#soft)" opacity="${s.phase === "day" && clearish ? 0.9 : 0.5}">` +
    poly([[wx - 14, 80], [wx + 30, 80], [wx + 26, 98], [wx - 28, 98]], look.shaft, 0.18) +
    poly([[wx + 34, 80], [wx + 78, 80], [wx + 82, 98], [wx + 30, 98]], look.shaft, 0.18) + `</g>`);

  // ── 왼쪽: 침대, 벽선반, 포스터 ──
  r(6, 60, 84, 3, "#2b3150");
  r(6, 50, 6, 26, "#2b3150");
  r(12, 63, 78, 9, "#3a4a86");
  r(12, 61, 78, 3, "#5468a8");
  for (let x = 20; x < 88; x += 9) r(x, 64, 1, 7, "#33427a");
  r(14, 57, 20, 6, "#a9b8e8");
  r(16, 58, 16, 1, "#c9d4f5");
  if (sit.shown !== "sleep" && sit.shown !== "rest") r(60, 59, 26, 4, "#46589a");
  r(12, 72, 78, 3, "#1e2440");
  r(14, 75, 3, 4, "#1e2440");
  r(85, 75, 3, 4, "#1e2440");
  for (const sy of [22, 36]) {
    r(14, sy, 58, 2, "#3a2e40");
    let x = 16;
    for (let k = 0; k < 12; k++) {
      const bw = 2 + (k % 2);
      const bh = 6 + ((k * 5) % 5);
      const col = SEASON[(k + sy) % 9];
      if (k === 7) { r(x, sy - 3, 7, 3, col, 0.8); x += 8; continue; }
      r(x, sy - bh, bw, bh, col, 0.8);
      x += bw + 1;
      if (x > 66) break;
    }
  }
  if (ev.streak >= 2) {
    // 벽 달력: 며칠째 연속으로 활동했는지
    r(78, 18, 18, 22, "#e7edf8");
    r(78, 18, 18, 5, "#e0483e");
    raw(`<text x="${87 * P}" y="${22 * P}" font-size="11" text-anchor="middle" fill="#ffffff" class="px">연속</text>`);
    raw(`<text x="${87 * P}" y="${33 * P}" font-size="${ev.streak >= 100 ? 18 : 24}" text-anchor="middle" fill="#26324a" class="px">${ev.streak}</text>`);
    raw(`<text x="${87 * P}" y="${38.5 * P}" font-size="11" text-anchor="middle" fill="#4f5e78" class="px">일째</text>`);
  } else {
    r(78, 18, 18, 24, "#1f2a52");
    r(80, 20, 14, 14, "#2f4c9a");
    r(84, 24, 6, 6, "#ffd27a", 0.7);
    r(80, 36, 14, 1, "#6c7fb8");
    r(80, 38, 9, 1, "#6c7fb8");
  }
  // 침대 위 사람
  if (sit.shown === "sleep") {
    r(17, 54, 8, 6, "#2a1f2e"); // 머리 (베개 위)
    r(21, 56, 4, 3, "#e8b892"); // 옆얼굴
    r(23, 57, 1, 1, "#5a3a2a"); // 감은 눈
    const quilt = (hx: number) => {
      r(24, 58, 56, 5, "#8a9be0");
      r(hx, 56, 24, 2, "#8a9be0");
      r(24, 58, 56, 1, "#b3c0f0");
      r(hx, 56, 24, 1, "#b3c0f0");
      for (let x = 30; x < 80; x += 8) r(x, 59, 1, 4, "#7486cc");
    };
    raw(`<g class="${rand.kind === "turn" ? "ev-hide" : ""}" style="${evStyle}">`);
    quilt(32);
    raw(`</g>`);
    if (rand.kind === "turn") {
      raw(`<g class="evA" style="${evStyle}">`); quilt(39); raw(`</g>`);
      raw(`<g class="evB" style="${evStyle}">`); quilt(46); r(16, 53, 4, 2, "#2a1f2e"); raw(`</g>`);
    }
    raw(`<text class="zz px" x="${27 * P}" y="${52 * P}" font-size="12" fill="#c9d4f5">z</text><text class="zz px" style="animation-delay:-1.5s" x="${30 * P}" y="${49 * P}" font-size="16" fill="#c9d4f5">Z</text>`);
  } else if (sit.shown === "rest") {
    r(16, 44, 7, 3, "#2a1f2e"); // 머리카락
    r(16, 47, 7, 5, "#e8b892"); // 얼굴
    r(16, 47, 1, 3, "#2a1f2e"); r(22, 47, 1, 3, "#2a1f2e");
    r(15, 52, 10, 8, "#4fb3d9"); // 몸
    r(24, 59, 40, 4, "#5468a8"); r(24, 59, 40, 1, "#6f84c4"); r(56, 57, 6, 2, "#5468a8"); // 다리 위 이불
    r(21, 53, 7, 5, "#e0483e"); r(24, 53, 1, 5, "#8a2a24"); // 책
    if (rand.kind === "pageFlip") raw(`<rect class="ev flip" style="${evStyle}" x="${24 * P}" y="${53 * P}" width="${3 * P}" height="${5 * P}" fill="#f5f0e1"/>`);
  }

  // ── 책상 ──
  const dx = 108, dy = 60, dw = 94;
  r(dx, dy, dw, 3, "#5a4030");
  r(dx, dy + 3, dw, 1, "#3c2a20");
  r(dx + 2, dy + 4, 3, 14, "#2c2030");
  r(dx + dw - 26, dy + 4, 24, 12, "#3c2a20");
  r(dx + dw - 24, dy + 6, 20, 4, "#46332a");
  r(dx + dw - 24, dy + 11, 20, 4, "#46332a");
  r(dx + dw - 16, dy + 8, 4, 1, "#c9a25a");
  r(dx + dw - 16, dy + 13, 4, 1, "#c9a25a");
  r(dx + dw - 3, dy + 4, 3, 14, "#2c2030");
  // 컴퓨터
  r(112, 40, 9, 20, "#2a3150");
  r(113, 42, 7, 1, "#3d4770");
  r(114, 55, 2, 1, "#7ff0ff");
  const mx = 124, my = 38;
  r(mx, my, 24, 18, "#2f3756");
  r(mx + 2, my + 2, 20, 13, screenOn ? "#8ff6ff" : "#0b1220");
  if (screenOn) r(mx + 2, my + 2, 20, 13, "#3fd0e8", 0.35);
  if (screenOn) {
    raw(`<g class="${sit.atDesk ? "scroll" : ""}">`);
    ([[0, 9, "#1c6a80"], [2, 12, "#1c6a80"], [2, 7, "#c0476a"], [4, 10, "#1c6a80"], [0, 5, "#1c6a80"]] as const).forEach(([ind, ln, col], i) => r(mx + 4 + ind, my + 4 + i * 2, ln, 1, col));
    raw(`</g>`);
    r(mx + 10, my + 12, 2, 1, "#0b2a33", undefined, "cur");
    if (ev.post) { r(mx + 15, my + 4, 5, 5, "#48b058"); r(mx + 16, my + 7, 1, 1, "#ffffff"); r(mx + 17, my + 8, 1, 1, "#ffffff"); r(mx + 18, my + 5, 1, 3, "#ffffff"); }
  } else {
    r(mx + 20, my + 15, 1, 1, "#ffb35c"); // 대기 표시등
  }
  r(mx + 10, my + 18, 4, 2, "#2f3756");
  r(mx + 6, my + 20, 12, 1, "#2f3756");
  r(mx - 2, dy - 2, 26, 2, "#3d4770");
  for (let k = 0; k < 12; k++) r(mx - 1 + k * 2, dy - 2, 1, 1, "#5a6699");
  raw(`<ellipse cx="${(mx + 12) * P}" cy="${(my + 9) * P}" rx="${34 * P}" ry="${24 * P}" fill="url(#screen)" class="glow" opacity="${screenOn ? (look.lamp ? 1 : 0.4) : 0}"/>`);
  // 스탠드
  const lx = 176;
  r(lx, dy - 2, 8, 2, "#c9a25a");
  r(lx + 3, 46, 1, 12, "#9c7a3c");
  r(lx - 4, 45, 8, 1, "#9c7a3c");
  r(lx - 9, 43, 7, 3, "#e0c070");
  r(lx - 8, 46, 5, 1, look.lamp ? "#fff2c2" : "#8a7a58");
  if (look.lamp) raw(`<ellipse cx="${(lx - 5) * P}" cy="${(dy + 2) * P}" rx="${40 * P}" ry="${22 * P}" fill="url(#lamp)"/>`);
  // 소품
  raw(`<g class="${rand.kind === "mug" ? "wobble" : ""}" style="${evStyle};transform-origin:${158 * P}px ${60 * P}px">`);
  r(156, 55, 4, 5, "#e0483e");
  r(160, 56, 1, 3, "#e0483e");
  r(156, 55, 4, 1, "#6a2424");
  raw(`</g>`);
  r(186, 54, 12, 2, "#3f8fe0");
  r(187, 52, 11, 2, "#e2a52c");
  r(186, 50, 10, 2, "#48b058");
  r(150, 57, 5, 3, "#c86b4a");
  r(150, 53, 1, 4, "#48b058");
  r(152, 52, 1, 5, "#48b058");
  r(154, 54, 1, 3, "#48b058");
  r(164, 58, 9, 2, "#e7edf8", 0.8);
  // 의자
  const ch = 132;
  r(ch, 62, 22, 3, "#1c2240");
  r(ch + 2, 50, 18, 13, "#232a4c");
  r(ch + 4, 52, 14, 9, "#2a3258");
  r(ch + 10, 65, 2, 8, "#1c2240");
  r(ch + 4, 73, 14, 1, "#1c2240");
  r(ch + 3, 74, 2, 1, "#1c2240");
  r(ch + 17, 74, 2, 1, "#1c2240");
  // 고양이: 책상에 사람이 있거나 자고 있으면 침대 끝, 아니면 의자 위
  const onBed = sit.atDesk || sit.shown === "sleep";
  const [cx0, cy0] = onBed ? [72, 57] : [ch + 5, 59];
  // 고양이 질주: 제자리에서 뛰어내려 오른쪽으로 달려 나갔다가, 왼쪽에서 다시 들어와 제자리로 뛰어올라요.
  // 화면 밖에서만 반대편으로 넘어가서 순간이동처럼 보이지 않아요.
  if (rand.kind === "catRun") {
    const dyFloor = (84 - cy0) * P;
    const rx = W * P + 40 - cx0 * P, lx = -70 - cx0 * P;
    catKeyframes = `@keyframes catrun{0%{transform:translate(0,0)}1%{transform:translate(9px,-12px)}2.2%{transform:translate(18px,${dyFloor}px)}7%{transform:translate(${rx}px,${dyFloor}px)}7.01%{transform:translate(${lx}px,${dyFloor}px)}12.8%{transform:translate(-18px,${dyFloor}px)}14%{transform:translate(-9px,-12px)}15%,100%{transform:translate(0,0)}}`;
    raw(`<g class="catrun" style="${evStyle}">`);
  }
  raw(`<g class="${rand.kind === "catRun" ? "ev-hide" : ""}" style="${evStyle}">`);
  drawCat(r, raw, cx0, cy0);
  raw(`</g>`);
  if (rand.kind === "catRun") {
    const c2 = "#d99a2b", cx = cx0, cy = cy0 + 1;
    raw(`<g class="ev" style="${evStyle}">`);
    r(cx, cy, 10, 3, c2); r(cx + 9, cy - 2, 4, 3, c2); r(cx + 9, cy - 3, 1, 1, c2); r(cx + 12, cy - 3, 1, 1, c2); r(cx - 3, cy - 1, 3, 1, c2); r(cx + 11, cy - 1, 1, 1, "#5a3a10");
    raw(`<g class="legA">`); r(cx + 1, cy + 3, 1, 2, c2); r(cx + 8, cy + 3, 1, 2, c2); raw(`</g><g class="legB">`); r(cx + 3, cy + 3, 1, 2, c2); r(cx + 6, cy + 3, 1, 2, c2); raw(`</g>`);
    raw(`</g></g>`);
  }
  // 책상에 앉은 사람 (뒷모습)
  if (sit.atDesk) {
    r(136, 48, 14, 11, "#4fb3d9"); // 몸
    r(135, 49, 16, 2, "#4fb3d9");
    raw(`<g class="${rand.kind === "stretch" ? "ev-hide" : ""}" style="${evStyle}">`);
    r(133, 50, 3, 7, "#4fb3d9"); r(150, 50, 3, 7, "#4fb3d9"); // 팔
    raw(`<g class="typeA">`); r(129, 57, 3, 1, "#e8b892"); raw(`</g><g class="typeB">`); r(130, 56, 3, 1, "#e8b892"); raw(`</g>`);
    raw(`</g>`);
    if (rand.kind === "stretch") {
      // 내림 → 반쯤 → 쭉 → 반쯤 → 내림
      raw(`<g class="evA" style="${evStyle}">`); r(132, 44, 3, 6, "#4fb3d9"); r(151, 44, 3, 6, "#4fb3d9"); r(132, 42, 3, 2, "#e8b892"); r(151, 42, 3, 2, "#e8b892"); raw(`</g>`);
      raw(`<g class="evB" style="${evStyle}">`); r(135, 33, 2, 16, "#4fb3d9"); r(149, 33, 2, 16, "#4fb3d9"); r(135, 31, 2, 2, "#e8b892"); r(149, 31, 2, 2, "#e8b892"); raw(`</g>`);
    }
    r(141, 46, 4, 2, "#e8b892"); // 목
    r(139, 38, 8, 9, "#2a1f2e"); // 머리
    r(138, 40, 10, 6, "#2a1f2e");
    r(138, 38, 10, 1, "#454a66"); r(137, 40, 2, 4, "#454a66"); r(147, 40, 2, 4, "#454a66"); // 헤드폰
  }
  // 랜덤: 창턱에 새가 내려앉았다 날아가요
  if (rand.kind === "bird") {
    raw(`<g clip-path="url(#win)"><g class="ev" style="${evStyle}"><g class="bird" style="${evStyle}">`);
    const bx3 = wx + 49, by3 = wy + wh - 3; // 창밖 난간에 앉아요
    r(bx3, by3, 4, 3, "#5a4a3a"); r(bx3 + 3, by3 - 1, 2, 2, "#5a4a3a"); r(bx3 + 5, by3, 1, 1, "#e2a52c"); r(bx3 + 1, by3 + 1, 2, 1, "#c86b4a"); r(bx3 + 1, by3 + 3, 1, 1, "#3a2e22"); r(bx3 + 3, by3 + 3, 1, 1, "#3a2e22");
    raw(`</g></g></g>`);
  }

  // ── 오른쪽: 책장 ──
  const bx = 214, by = 23, bw = 52, bh = 51;
  r(bx, by, bw, bh, "#2c2236");
  r(bx + 2, by + 2, bw - 4, bh - 4, "#1a1526");
  for (let row = 0; row < 5; row++) {
    const sy = by + 12 + row * 11;
    if (sy > by + bh - 3) break;
    r(bx + 2, sy, bw - 4, 2, "#3a2e48");
    if (row === 3) break;
    let x = bx + 4;
    let k = 0;
    while (x < bx + bw - 6) {
      const bwid = 2 + ((k + row) % 2);
      const bhgt = 7 + ((k * 3 + row) % 3);
      const col = SEASON[(k * 2 + row) % 9];
      if ((k + row) % 6 === 5) { r(x, sy - 3, 7, 3, col, 0.75); x += 8; }
      else { r(x, sy - bhgt, bwid, bhgt, col, 0.75); r(x, sy - bhgt + 2, bwid, 1, "#ffffff", 0.18); x += bwid + 1; }
      k++;
    }
  }
  r(bx + 2, by + bh - 9, bw - 4, 7, "#241c32");
  r(222, 82, 16, 4, "#2c3f6e");
  r(223, 80, 14, 2, "#7a4a8c");
  r(96, 86, 10, 3, "#2a3558");
  r(108, 87, 10, 3, "#2a3558");
  // 러그
  raw(poly([[118, 78], [206, 78], [214, 94], [110, 94]], "#4a5a8e", 0.55));
  raw(poly([[122, 80], [202, 80], [208, 92], [116, 92]], "#5b6da3", 0.35));
  // 줄 전구
  for (let i = 0; i < 14; i++) {
    const x = 8 + i * 8;
    const y = 4 + Math.round((3 * Math.abs((i % 6) - 3)) / 3);
    r(x, y - 1, 8, 1, "#2a3558");
    const col = ["#ffd27a", "#ff8f8f", "#9fe0ff", "#b8f29a"][i % 4];
    if (look.bulbs) r(x + 3, y, 2, 2, col, undefined, "bulb", `animation-delay:-${((i * 0.29) % 1.8).toFixed(2)}s`);
    else r(x + 3, y, 2, 2, "#3a4466");
  }

  // ── 빛 ──
  if (look.lamp) {
    raw(`<g filter="url(#soft)">` + poly([[lx - 9, 46], [lx - 3, 46], [lx + 18, dy], [lx - 32, dy]], "url(#cone)") + `</g>`);
    for (let i = 0; i < 9; i++) {
      const x = lx - 24 + Math.floor(rnd() * 36);
      const y = 47 + Math.floor(rnd() * 12);
      raw(`<rect class="dust" style="animation-delay:-${(i * 0.9).toFixed(1)}s" x="${x * P}" y="${y * P}" width="2" height="2" fill="#ffe7b8" fill-opacity="0.7"/>`);
    }
  } else if (clearish) {
    // 낮: 창으로 드는 햇살과 그 속 먼지
    raw(`<g filter="url(#soft)">` + poly([[wx + 6, wy + 2], [wx + 64, wy + 2], [wx + 40, 98], [wx - 50, 98]], "#fff3cf", 0.12) + `</g>`);
    for (let i = 0; i < 12; i++) {
      const x = wx - 30 + Math.floor(rnd() * 80);
      const y = 40 + Math.floor(rnd() * 40);
      raw(`<rect class="dust" style="animation-delay:-${(i * 0.7).toFixed(1)}s" x="${x * P}" y="${y * P}" width="2" height="2" fill="#fff7dc" fill-opacity="0.8"/>`);
    }
  }
  raw(`<g filter="url(#bloom)" style="mix-blend-mode:screen">` +
    `<rect class="glow" x="${(mx + 2) * P}" y="${(my + 2) * P}" width="${20 * P}" height="${13 * P}" fill="#5fe6ff" fill-opacity="${look.lamp ? 0.55 : 0.25}"/>` +
    (look.lamp ? `<ellipse cx="${(lx - 5) * P}" cy="${47 * P}" rx="${6 * P}" ry="${3 * P}" fill="#ffd27a" fill-opacity="0.9"/>` : "") +
    `<rect x="${wx * P}" y="${(wy + wh - 14) * P}" width="${ww * P}" height="${14 * P}" fill="${look.sky[1]}" fill-opacity="0.35"/>` +
    `</g>`);
  if (look.grade) raw(`<rect x="0" y="0" width="${W * P}" height="${H * P}" fill="${look.grade[0]}" fill-opacity="${look.grade[1]}" style="mix-blend-mode:multiply"/>`);
  raw(`<rect x="0" y="0" width="${W * P}" height="${H * P}" fill="url(#fog)"/>`);
  raw(`<rect x="0" y="0" width="${W * P}" height="${H * P}" fill="url(#vig)"/>`);

  // ── GitHub 활동 ──
  if (ev.merged) {
    const bits: string[] = [];
    const cols = ["#ffd27a", "#ff8f8f", "#9fe0ff", "#b8f29a", "#d6a8ff"];
    for (let i = 0; i < 24; i++) {
      const x = 112 + Math.floor(rnd() * 90);
      bits.push(`<rect class="conf" style="animation-delay:-${(rnd() * 3).toFixed(2)}s" x="${x * P}" y="${(20 + Math.floor(rnd() * 10)) * P}" width="4" height="4" fill="${cols[i % 5]}"/>`);
    }
    raw(bits.join(""));
  }
  if (ev.commit || ev.post) {
    const text = ev.post ? "글을 올렸어요!" : "커밋!";
    const bw2 = ev.post ? 96 : 52;
    const bx2 = sit.atDesk ? 143 * P - bw2 / 2 : (mx + 12) * P - bw2 / 2;
    const by2 = sit.atDesk ? 26 * P : 30 * P;
    raw(`<g class="bob px"><rect x="${bx2}" y="${by2}" width="${bw2}" height="22" fill="#ffffff"/><rect x="${bx2 + 2}" y="${by2 + 2}" width="${bw2 - 4}" height="18" fill="#ffffff" stroke="#26324a" stroke-width="2"/>` +
      `<polygon points="${bx2 + bw2 / 2 - 4},${by2 + 21} ${bx2 + bw2 / 2 + 4},${by2 + 21} ${bx2 + bw2 / 2},${by2 + 27}" fill="#26324a"/>` +
      `<text x="${bx2 + bw2 / 2}" y="${by2 + 15}" font-size="11" text-anchor="middle" fill="#26324a">${text}</text></g>`);
  }
  // 상태 상자 (왼쪽 아래)
  const note = ev.post ? "방금 글을 올렸어요" : ev.commit ? "방금 커밋했어요" : ev.merged ? "PR 머지했어요" : ev.star ? "스타를 받았어요" : "";
  const sy0 = H * P - (note ? 50 : 34);
  raw(`<g class="px"><rect x="12" y="${sy0}" width="150" height="${note ? 40 : 24}" fill="#33415c"/><rect x="15" y="${sy0 + 3}" width="144" height="${note ? 34 : 18}" fill="#0d1120" fill-opacity="0.92"/>` +
    `<text x="24" y="${sy0 + 16}" font-size="12" fill="#e7edf8"><tspan fill="#ff6a5c">▶</tspan> ${sit.label}</text>` +
    (note ? `<text x="24" y="${sy0 + 31}" font-size="11" fill="#a5b2c9">${note}</text>` : "") + `</g>`);

  // ── 책장 위 시계 (어둠 위에 그려서 또렷하게) ──
  o.push(clock(s, bx + 4, 2));
  // 출처
  o.push(`<text x="${W * P - 10}" y="${H * P - 9}" font-size="11" text-anchor="end" fill="#a5b2c9" fill-opacity="0.75" class="px">날씨 Open-Meteo</text>`);

  const defs = `<defs>
<style>@font-face{font-family:'ScenePx';src:url(data:font/woff2;base64,${SCENE_FONT}) format('woff2');} .px{font-family:'ScenePx',monospace}</style>
<pattern id="dith" width="${2 * P}" height="${2 * P}" patternUnits="userSpaceOnUse"><rect width="${P}" height="${P}" fill="#000" fill-opacity="0.18"/><rect x="${P}" y="${P}" width="${P}" height="${P}" fill="#000" fill-opacity="0.18"/></pattern>
<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${look.sky[0]}"/><stop offset="1" stop-color="${look.sky[1]}"/></linearGradient>
<radialGradient id="lamp" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#ffc979" stop-opacity="0.55"/><stop offset="0.5" stop-color="#ffb35c" stop-opacity="0.18"/><stop offset="1" stop-color="#ffb35c" stop-opacity="0"/></radialGradient>
<radialGradient id="screen" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#7ff0ff" stop-opacity="0.45"/><stop offset="1" stop-color="#7ff0ff" stop-opacity="0"/></radialGradient>
<radialGradient id="vig" cx="0.55" cy="0.5" r="0.75"><stop offset="0.35" stop-color="#05070f" stop-opacity="0"/><stop offset="0.75" stop-color="#05070f" stop-opacity="${(look.vignette * 0.45).toFixed(2)}"/><stop offset="1" stop-color="#05070f" stop-opacity="${look.vignette}"/></radialGradient>
<linearGradient id="shaft" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${look.shaft}" stop-opacity="${look.shaftOp}"/><stop offset="1" stop-color="${look.shaft}" stop-opacity="0"/></linearGradient>
<linearGradient id="cone" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffd59a" stop-opacity="0.35"/><stop offset="1" stop-color="#ffd59a" stop-opacity="0"/></linearGradient>
<linearGradient id="fog" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0a1230" stop-opacity="${look.lamp ? 0.55 : 0.25}"/><stop offset="0.35" stop-color="#0a1230" stop-opacity="0"/><stop offset="0.8" stop-color="#0a1230" stop-opacity="0"/><stop offset="1" stop-color="#05070f" stop-opacity="0.5"/></linearGradient>
<filter id="bloom" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="9"/></filter>
<filter id="soft" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="2.2"/></filter>
<filter id="far"><feGaussianBlur stdDeviation="0.9"/></filter>
<clipPath id="win"><rect x="${wx * P}" y="${wy * P}" width="${ww * P}" height="${wh * P}"/></clipPath>
</defs>`;
  const style = `<style>
.rain0{animation:fall 1.1s linear infinite}.rain1{animation:fall .8s linear infinite}
.sn0{animation:snow0 9s linear infinite}.sn1{animation:snow1 6s linear infinite}
@keyframes fall{from{transform:translateY(0)}to{transform:translateY(${40 * P}px)}}
@keyframes snow0{0%{transform:translate(0,0)}50%{transform:translate(6px,${20 * P}px)}100%{transform:translate(0,${40 * P}px)}}
@keyframes snow1{0%{transform:translate(0,0)}50%{transform:translate(-8px,${20 * P}px)}100%{transform:translate(0,${40 * P}px)}}
.tw{animation:tw 2s steps(1) infinite}@keyframes tw{50%{opacity:.15}}
.cur{animation:blink 1s steps(1) infinite}.colon{animation:blink 2s steps(1) infinite}@keyframes blink{50%{opacity:0}}
.bulb{animation:bl 1.8s steps(1) infinite}@keyframes bl{50%{opacity:.35}}
.glow{animation:gl 3s ease-in-out infinite}@keyframes gl{50%{opacity:.75}}
.drip{animation:dr 7s linear infinite}@keyframes dr{0%{transform:translateY(0);opacity:0}8%{opacity:1}85%{opacity:1}100%{transform:translateY(${38 * P}px);opacity:0}}
.dust{animation:du 6s ease-in-out infinite}@keyframes du{0%,100%{transform:translate(0,0);opacity:.2}50%{transform:translate(6px,-9px);opacity:.8}}
.flash{animation:fl 13s linear infinite}@keyframes fl{0%,90%,94%,100%{fill-opacity:0}91%{fill-opacity:.35}92%{fill-opacity:.05}93%{fill-opacity:.25}}
.clouds{animation:cl 140s linear infinite}.clouds-fast{animation:cl 60s linear infinite}@keyframes cl{to{transform:translateX(${70 * P}px)}}
.ev{opacity:0;animation:evshow 40s linear infinite}@keyframes evshow{0%,15%{opacity:1}15.01%,100%{opacity:0}}
.ev-hide{animation:evhide 40s linear infinite}@keyframes evhide{0%,15%{opacity:0}15.01%,100%{opacity:1}}
.catrun{animation:catrun 40s linear infinite}
.evA{opacity:0;animation:evA 40s linear infinite}@keyframes evA{0%,1.5%{opacity:1}1.51%,13.49%{opacity:0}13.5%,15%{opacity:1}15.01%,100%{opacity:0}}
.evB{opacity:0;animation:evB 40s linear infinite}@keyframes evB{0%,1.49%{opacity:0}1.5%,13.5%{opacity:1}13.51%,100%{opacity:0}}
.legA{animation:blink .25s steps(1) infinite}.legB{animation:blink .25s steps(1) infinite reverse}
.bird{animation:bird 40s linear infinite}@keyframes bird{0%{transform:translate(110px,-80px)}2.5%{transform:translate(0,0)}4%{transform:translate(0,-4px)}5%,7%{transform:translate(0,0)}8%{transform:translate(9px,-4px)}9%,12%{transform:translate(9px,0)}15%,100%{transform:translate(120px,-90px)}}
.meteor{animation:met 40s linear infinite}@keyframes met{0%{transform:translate(0,0);opacity:1}3%{transform:translate(120px,40px);opacity:0}100%{opacity:0}}
.shoot{animation:shoot 12s linear infinite}@keyframes shoot{0%{transform:translate(0,0);opacity:0}2%{opacity:1}8%{transform:translate(150px,50px);opacity:0}100%{opacity:0}}
.wobble{animation:wob 40s linear infinite}@keyframes wob{0%,6%,100%{transform:rotate(0)}1%{transform:rotate(-12deg)}2%{transform:rotate(10deg)}3%{transform:rotate(-8deg)}4%{transform:rotate(5deg)}5%{transform:rotate(-2deg)}}
.flip{animation:evshow 40s steps(1) infinite}
.typeA{animation:blink .4s steps(1) infinite}.typeB{animation:blink .4s steps(1) infinite reverse}
.scroll{animation:scr 4s steps(4) infinite}@keyframes scr{to{transform:translateY(-${2 * P}px)}}
.zz{animation:zz 3s linear infinite}@keyframes zz{0%{transform:translate(0,0);opacity:0}20%{opacity:1}100%{transform:translate(9px,-18px);opacity:0}}
.conf{animation:conf 3s linear infinite}@keyframes conf{0%{transform:translateY(0);opacity:0}10%{opacity:1}100%{transform:translateY(${40 * P}px);opacity:0}}
.bob{animation:bob 1.2s steps(2) infinite}@keyframes bob{50%{transform:translateY(-3px)}}
.tail-a{animation:ta 1.6s steps(1) infinite}.tail-b{animation:tb 1.6s steps(1) infinite}@keyframes ta{50%{opacity:0}}@keyframes tb{0%{opacity:0}50%{opacity:1}}
.hh{animation:hh 86400s steps(24) infinite}@keyframes hh{to{transform:translateY(-${24 * CLOCK_LINE}px)}}
.mm{animation:mm 3600s steps(60) infinite}@keyframes mm{to{transform:translateY(-${60 * CLOCK_LINE}px)}}
${catKeyframes}
@media (prefers-reduced-motion:reduce){.rain0,.rain1,.sn0,.sn1,.tw,.cur,.bulb,.glow,.drip,.dust,.flash,.tail-a,.tail-b,.clouds,.clouds-fast,.catrun,.evA,.evB,.legA,.legB,.bird,.meteor,.shoot,.wobble,.typeA,.typeB,.scroll,.zz,.conf,.bob{animation:none}.tail-b,.legB,.typeB,.ev,.evA,.evB{opacity:0}.ev-hide{opacity:1;animation:none}}
</style>`;
  const frame = `<polygon points="4,0 836,0 836,4 840,4 840,${H * P - 4} 836,${H * P - 4} 836,${H * P} 4,${H * P} 4,${H * P - 4} 0,${H * P - 4} 0,4 4,4" fill="${line}"/>`;
  const aria = `서울 ${s.label}${s.tempC !== null ? ` ${Math.round(s.tempC)}도` : ""}, ${PHASE_KO[s.phase]}의 공부방 픽셀 그림. 지금 ${sit.label}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W * P}" height="${H * P}" viewBox="0 0 ${W * P} ${H * P}" role="img" aria-label="${aria}">` +
    `<!-- 픽셀 폰트: Galmuri (c) Lee Minseo (quiple), SIL OFL 1.1. 날씨: Open-Meteo.com (CC BY 4.0) -->` +
    defs + style + frame +
    `<svg x="4" y="4" width="${W * P - 8}" height="${H * P - 8}" viewBox="4 4 ${W * P - 8} ${H * P - 8}" overflow="hidden">${o.join("")}</svg></svg>`;
}

export const PHASE_KO: Record<Phase, string> = { dawn: "새벽", day: "낮", dusk: "노을 무렵", night: "밤" };
const CLOCK_LINE = 30; // 시계 숫자 한 줄 높이(px)

/**
 * 책장 위 LED 시계. 숫자 띠(00~23, 00~59)를 아래에서 위로 넘기는 애니메이션이라
 * 그림을 받은 뒤에도 실제 서울 시간처럼 흘러가요. 시작 위치는 음수 animation-delay로 맞춰요.
 */
export function clockOffsets(now: number) {
  const ms = now + KST;
  const daySec = Math.floor((ms / 1000) % 86400);
  const hourSec = daySec % 3600;
  return { daySec, hourSec, hh: Math.floor(daySec / 3600), mm: Math.floor(hourSec / 60) };
}

function clock(s: SceneInput, gx: number, gy: number): string {
  const x = gx * P, y = gy * P, w = 46 * P, h = 19 * P;
  const { daySec, hourSec } = clockOffsets(s.now);
  const pad = (n: number) => String(n).padStart(2, "0");
  const strip = (n: number) => Array.from({ length: n }, (_, i) => `<text x="0" y="${i * CLOCK_LINE + 24}">${pad(i)}</text>`).join("");
  const led = "#ffb35c";
  const temp = s.tempC !== null ? ` ${Math.round(s.tempC)}°C` : "";
  const tx = x + 40; // 시간 숫자 시작
  return `<g class="px">` +
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#33415c"/>` +
    `<rect x="${x + 3}" y="${y + 3}" width="${w - 6}" height="${h - 6}" fill="#0d1120"/>` +
    `<rect x="${x + 8}" y="${y + h}" width="6" height="3" fill="#33415c"/><rect x="${x + w - 14}" y="${y + h}" width="6" height="3" fill="#33415c"/>` +
    `<text x="${x + 11}" y="${y + 27}" font-size="11" fill="#8a96b3">서울</text>` +
    `<svg x="${tx}" y="${y + 5}" width="30" height="${CLOCK_LINE}" overflow="hidden"><g class="hh" style="animation-delay:-${daySec}s" font-size="24" fill="${led}">${strip(24)}</g></svg>` +
    `<text x="${tx + 31}" y="${y + 28}" font-size="24" fill="${led}" class="colon">:</text>` +
    `<svg x="${tx + 42}" y="${y + 5}" width="30" height="${CLOCK_LINE}" overflow="hidden"><g class="mm" style="animation-delay:-${hourSec}s" font-size="24" fill="${led}">${strip(60)}</g></svg>` +
    `<text x="${x + w / 2}" y="${y + h - 8}" font-size="11" text-anchor="middle" fill="#c9d2e6">${s.label}${temp}</text>` +
    `<rect x="${x + 3}" y="${y + 3}" width="${w - 6}" height="${h - 6}" fill="${led}" fill-opacity="0.04"/>` +
    `</g>`;
}

type Rect = (x: number, y: number, w?: number, h?: number, c?: string, op?: number, cls?: string, style?: string) => void;
function drawCat(r: Rect, raw: (x: string) => void, x: number, y: number) {
  const cat = "#d99a2b";
  r(x, y, 12, 4, cat);
  r(x + 9, y - 3, 5, 4, cat);
  r(x + 9, y - 4, 1, 1, cat);
  r(x + 13, y - 4, 1, 1, cat);
  r(x + 11, y - 1, 2, 1, "#5a3a10");
  r(x + 2, y + 1, 3, 1, "#b07a1c");
  raw(`<g class="tail-a">`);
  r(x - 3, y + 2, 3, 1, cat);
  r(x - 4, y, 1, 2, cat);
  raw(`</g><g class="tail-b">`);
  r(x - 3, y + 3, 4, 1, cat);
  r(x - 5, y + 3, 2, 1, cat);
  raw(`</g>`);
}
