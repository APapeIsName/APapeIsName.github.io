import { afterEach, describe, expect, it, vi } from "vitest";
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

import { activityAt } from "../src/schedule";
import { signalsFrom, streakOf } from "../src/activity";
import { pickRandomEvent, situation, NO_EVENTS } from "../src/scene";

describe("생활 시간표", () => {
  it("평일 하루", () => {
    // 2026-11-16은 월요일
    expect(activityAt(at("2026-11-16T03:00:00"))).toBe("sleep");
    expect(activityAt(at("2026-11-16T04:40:00"))).toBe("wash");
    expect(activityAt(at("2026-11-16T06:00:00"))).toBe("study");
    expect(activityAt(at("2026-11-16T08:20:00"))).toBe("ready");
    expect(activityAt(at("2026-11-16T15:58:00"))).toBe("work");
    expect(activityAt(at("2026-11-16T19:40:00"))).toBe("wash");
    expect(activityAt(at("2026-11-16T20:10:00"))).toBe("rest");
    expect(activityAt(at("2026-11-16T21:00:00"))).toBe("sleep");
  });
  it("주말엔 출근 대신 공부와 쉬기", () => {
    expect(activityAt(at("2026-11-21T10:00:00"))).toBe("study");
    expect(activityAt(at("2026-11-21T12:30:00"))).toBe("rest");
    expect(activityAt(at("2026-11-21T15:00:00"))).toBe("study");
  });
  it("방금 커밋했으면 쉬다가도 책상에 앉아요. 회사에 있으면 그대로", () => {
    expect(situation("rest", { ...NO_EVENTS, commit: true })).toMatchObject({ atDesk: true, label: "작업 중" });
    expect(situation("work", { ...NO_EVENTS, commit: true })).toMatchObject({ atDesk: false, label: "출근 중" });
    expect(situation("study", NO_EVENTS)).toMatchObject({ atDesk: true, label: "공부 중" });
  });
});

describe("GitHub 활동", () => {
  const now = at("2026-11-16T16:00:00");
  const iso = (s: string) => new Date(at(s)).toISOString();
  it("커밋, 글, 머지, 스타, 연속 기록을 찾아요", () => {
    const g = signalsFrom([
      { type: "PushEvent", created_at: iso("2026-11-16T15:50:00"), payload: { commits: [{ message: "fix: 버그" }] } },
      { type: "PushEvent", created_at: iso("2026-11-16T15:40:00"), payload: { commits: [{ message: "노트: 토비의 스프링 1장" }] } },
      { type: "PushEvent", created_at: iso("2026-11-15T21:00:00"), payload: { commits: [{ message: "x" }] } },
      { type: "PushEvent", created_at: iso("2026-11-14T08:00:00"), payload: { commits: [{ message: "x" }] } },
      { type: "PullRequestEvent", created_at: iso("2026-11-16T14:00:00"), payload: { action: "closed", pull_request: { merged: true } } },
      { type: "PullRequestEvent", created_at: iso("2026-11-16T15:00:00"), payload: { action: "closed", pull_request: { merged: false } } },
    ], [{ starred_at: iso("2026-11-16T09:00:00") }], now);
    expect(g.commitAt).toBe(at("2026-11-16T15:50:00"));
    expect(g.postAt).toBe(at("2026-11-16T15:40:00"));
    expect(g.mergedAt).toBe(at("2026-11-16T14:00:00"));
    expect(g.starAt).toBe(at("2026-11-16T09:00:00"));
    expect(g.streak).toBe(3);
  });
  it("오늘 아직 안 했으면 어제부터 세요", () => {
    expect(streakOf(new Set(["2026-11-15", "2026-11-14"]), now)).toBe(2);
    expect(streakOf(new Set(["2026-11-13"]), now)).toBe(0);
  });
});

describe("이벤트가 그림에 들어가요", () => {
  const base = { theme: "light" as const, label: "맑음", tempC: 10, now: at("2026-11-16T16:00:00"), month: 11, phase: "day" as const, weather: "clear" as const };
  it("랜덤 사건은 상황에 맞는 것만 골라요", () => {
    const seq = (vals: number[]) => { let i = 0; return () => vals[i++ % vals.length]; };
    expect(pickRandomEvent("sleep", "night", "rain", seq([0.5, 0.99]))).toBe("turn");
    expect(pickRandomEvent("work", "night", "rain", seq([0.5, 0.1]))).toBe("catRun");
    expect(pickRandomEvent("study", "day", "clear", seq([0.1]))).toBe(null);
    for (let k = 0; k < 50; k++) expect(["catRun", "turn", null]).toContain(pickRandomEvent("sleep", "night", "rain", Math.random));
  });
  it("자는 중이면 Zzz, 모니터 꺼짐, 상태 상자", () => {
    const svg = renderScene({ ...base, phase: "night", activity: "sleep", random: { kind: "turn", offset: 12 } });
    expect(svg).toContain('class="zz px"');
    expect(svg).toContain("자는 중");
    expect(svg).toContain("animation-delay:-12.0s");
    expect(svg).not.toContain('class="scroll"');
  });
  it("커밋하면 말풍선과 한 줄 소식", () => {
    const svg = renderScene({ ...base, activity: "study", events: { ...NO_EVENTS, commit: true, streak: 5 } });
    expect(svg).toContain("커밋!");
    expect(svg).toContain("방금 커밋했어요");
    expect(svg).toContain(">5</text>");
    expect(svg).toContain("일째");
  });
  it("출근 중이면 방이 비고 의자에 고양이", () => {
    const svg = renderScene({ ...base, activity: "work", random: { kind: "bird", offset: 3 } });
    expect(svg).toContain("출근 중");
    expect(svg).toContain('class="bird"');
    expect(svg).not.toContain('class="typeA"');
  });
});

import { nowState } from "../src/index";
describe("로파이용 지금 상태", () => {
  it("날씨와 시간표, 출석 여부를 돌려줘요", async () => {
    const env = { GITHUB_REPO_TOKEN: "t", REPO_OWNER: "o", REPO_NAME: "r", REPO_BRANCH: "main" } as any;
    const f = (async (u: string) => {
      if (u.includes("open-meteo")) return new Response(JSON.stringify({ current: { temperature_2m: 3, weather_code: 71 }, daily: { sunrise: ["2026-11-16T07:10"], sunset: ["2026-11-16T17:20"] } }));
      return new Response("{}", { status: 404 });
    }) as unknown as typeof fetch;
    vi.stubGlobal("fetch", f);
    const s = await nowState(env, at("2026-11-16T06:00:00"), f);
    vi.unstubAllGlobals();
    expect(s).toMatchObject({ phase: "night", weather: "snow", activity: "study", checkin: false });
  });
});
