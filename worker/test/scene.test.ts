import { afterEach, describe, expect, it } from "vitest";
import { clockOffsets, renderScene } from "../src/scene";
import { getConditions, phaseOf, resetWeatherMemo, weatherLabel, weatherOf } from "../src/weather";
import { sceneResponse } from "../src/index";

afterEach(() => resetWeatherMemo());
const KST = 9 * 3600 * 1000;
const at = (iso: string) => Date.parse(iso + "+09:00");

describe("날씨와 시간대", () => {
  it("WMO 코드를 그림 날씨로 바꿔요", () => {
    expect(weatherOf(0)).toBe("clear");
    expect(weatherOf(2)).toBe("partly");
    expect(weatherOf(3)).toBe("cloudy");
    expect(weatherOf(45)).toBe("fog");
    expect(weatherOf(53)).toBe("drizzle");
    expect(weatherOf(63)).toBe("rain");
    expect(weatherOf(81)).toBe("rain");
    expect(weatherOf(73)).toBe("snow");
    expect(weatherOf(95)).toBe("thunder");
    expect(weatherLabel(81)).toBe("소나기");
    expect(weatherLabel(66)).toBe("어는 비");
  });
  it("해 뜨고 지는 시각으로 시간대를 정해요", () => {
    const sr = at("2026-11-16T07:10:00"), ss = at("2026-11-16T17:20:00");
    expect(phaseOf(at("2026-11-16T03:00:00"), sr, ss)).toBe("night");
    expect(phaseOf(at("2026-11-16T07:00:00"), sr, ss)).toBe("dawn");
    expect(phaseOf(at("2026-11-16T13:39:00"), sr, ss)).toBe("day");
    expect(phaseOf(at("2026-11-16T17:00:00"), sr, ss)).toBe("dusk");
    expect(phaseOf(at("2026-11-16T21:00:00"), sr, ss)).toBe("night");
    expect(phaseOf(at("2026-11-16T13:00:00"), null, null)).toBe("day");
  });
  it("시계 시작 위치는 서울 시간이에요", () => {
    const c = clockOffsets(at("2026-11-16T13:39:27"));
    expect(c.hh).toBe(13);
    expect(c.mm).toBe(39);
    expect(c.daySec).toBe(13 * 3600 + 39 * 60 + 27);
    expect(c.hourSec).toBe(39 * 60 + 27);
  });
});

describe("Open-Meteo", () => {
  const body = { current: { temperature_2m: 6.4, weather_code: 61, is_day: 1 }, daily: { sunrise: ["2026-11-16T07:10"], sunset: ["2026-11-16T17:20"] } };
  it("서울 날씨를 읽고 20분 동안 다시 묻지 않아요", async () => {
    let calls = 0;
    const f = (async (u: string) => { calls++; expect(u).toContain("latitude=37.5665"); return new Response(JSON.stringify(body)); }) as unknown as typeof fetch;
    const now = at("2026-11-16T13:39:00");
    const c = await getConditions(now, f);
    expect(c?.weather).toBe("rain");
    expect(c?.tempC).toBe(6.4);
    expect(c?.sunrise).toBe(at("2026-11-16T07:10:00"));
    await getConditions(now + 10 * 60 * 1000, f);
    expect(calls).toBe(1);
    await getConditions(now + 21 * 60 * 1000, f);
    expect(calls).toBe(2);
  });
  it("못 가져오면 시간만 반영해서 그려요", async () => {
    const f = (async () => new Response("x", { status: 500 })) as unknown as typeof fetch;
    const res = await sceneResponse(new URL("https://x.dev/scene.svg?theme=dark"), at("2026-11-16T22:00:00"), f);
    expect(res.headers.get("Content-Type")).toContain("image/svg+xml");
    expect(res.headers.get("Cache-Control")).toContain("no-cache");
    const svg = await res.text();
    expect(svg).toContain("날씨 모름");
    expect(svg).toContain("밤의 공부방");
  });
});

describe("그림", () => {
  const base = { theme: "light" as const, label: "비", tempC: 6.4, now: at("2026-11-16T13:39:00"), month: 11 };
  const count = (s: string, sub: string) => s.split(sub).length - 1;
  it("날씨마다 다른 것이 들어가요", () => {
    const rain = renderScene({ ...base, phase: "night", weather: "rain" });
    const snow = renderScene({ ...base, phase: "night", weather: "snow", label: "눈" });
    const clear = renderScene({ ...base, phase: "day", weather: "clear", label: "맑음" });
    const thunder = renderScene({ ...base, phase: "night", weather: "thunder", label: "뇌우" });
    expect(rain).toContain('class="rain1"');
    expect(rain).not.toContain('class="sn0"');
    expect(snow).toContain('class="sn0"');
    expect(clear).not.toContain('class="rain0"');
    expect(clear).toContain("#fff8e1"); // 해
    expect(thunder).toContain('class="flash"');
    expect(count(clear, 'class="bulb"')).toBe(0); // 낮엔 줄 전구 꺼짐
    expect(count(rain, 'class="bulb"')).toBe(14);
  });
  it("시계, 날씨 글자, 출처가 들어가요", () => {
    const svg = renderScene({ ...base, phase: "day", weather: "rain" });
    expect(svg).toContain("animation-delay:-49140s"); // 13:39:00
    expect(svg).toContain("animation-delay:-2340s");
    expect(svg).toContain("비 6°C");
    expect(svg).toContain("날씨 Open-Meteo");
    expect(svg).toMatch(/^<svg [^>]*width="840" height="300"/);
  });
  it("눈 오는 달엔 창턱에 눈이 쌓여요", () => {
    const svg = renderScene({ ...base, phase: "night", weather: "snow", label: "눈", month: 1 });
    expect(svg).toContain("#eef3ff");
  });
});
