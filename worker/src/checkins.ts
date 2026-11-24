/**
 * 출석부: 하루에 한 번 출석 버튼을 누르면 그날이 출석으로 남아요. 끝내기 버튼은 없어요.
 * 얼마나 공부했는지는 나중에 그날 기록을 열어 적어요(분 단위). 한 마디와 메모도 고칠 수 있어요.
 * _data/checkins.yml 에 쌓여서 블로그 출석부와 공부 잔디에 쓰여요.
 */
import type { Env } from "./env";
import { HttpError } from "./http";
import { modify, readList } from "./taxonomy";

export const CHECKIN_FILE = "_data/checkins.yml";

export interface Checkin {
  date: string; // 서울 날짜 (예: 2026-11-24). 하루에 하나
  at: string; // 출석 버튼을 누른 시각 (예: 09:24)
  text?: string; // 오늘 할 것 한 마디
  minutes?: number; // 그날 공부한 시간(분). 나중에 적어요
  note?: string; // 그날 메모
}

/** 예전 기록(start, end로 남긴 출석)도 읽어요. 같은 날은 하나로 합쳐요. */
interface LegacyCheckin {
  id?: string;
  kind?: string;
  text?: string;
  start?: string;
  end?: string;
  note?: string;
}

const KST = 9 * 3600 * 1000;
const HEADER = "출석 기록";
const MAX_MINUTES = 24 * 60;
/** 예전 기록에서 이보다 긴 출석은 끝내기를 잊은 걸로 보고 시간을 비워 둬요. */
const LEGACY_MAX = 12 * 60;

export function kstIso(now: number): string {
  return new Date(now + KST).toISOString().slice(0, 19) + "+09:00";
}
const today = (now: number) => kstIso(now).slice(0, 10);

function oneLine(v: unknown, max: number, label: string): string | undefined {
  if (v === undefined || v === null || v === "") return undefined;
  if (typeof v !== "string") throw new HttpError(400, `${label} 형식이 맞지 않아요.`);
  const t = v.replace(/\s+/g, " ").trim();
  if (t.length > max) throw new HttpError(400, `${label}은(는) ${max}자까지예요.`);
  return t || undefined;
}

function minutesOf(v: unknown): number | undefined {
  if (v === undefined || v === null || v === "") return undefined;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0 || n > MAX_MINUTES) throw new HttpError(400, "공부한 시간은 0분에서 24시간 사이로 적어 주세요.");
  return n;
}

/** 예전 형식과 새 형식이 섞여 있어도 하루 하나씩, 날짜 순으로 맞춰요. */
export function normalize(items: (Checkin | LegacyCheckin)[]): Checkin[] {
  const byDate = new Map<string, Checkin>();
  for (const raw of items) {
    if ((raw as Checkin).date) {
      const c = raw as Checkin;
      byDate.set(c.date, { ...c });
      continue;
    }
    const l = raw as LegacyCheckin;
    if (!l.start) continue;
    const date = l.start.slice(0, 10);
    let mins: number | undefined;
    if (l.end) {
      const m = Math.round((Date.parse(l.end) - Date.parse(l.start)) / 60000);
      if (m > 0 && m <= LEGACY_MAX) mins = m;
    }
    const prev = byDate.get(date);
    if (!prev) {
      byDate.set(date, { date, at: l.start.slice(11, 16), ...(l.text ? { text: l.text } : {}), ...(mins !== undefined ? { minutes: mins } : {}), ...(l.note ? { note: l.note } : {}) });
    } else {
      if (mins !== undefined) prev.minutes = (prev.minutes || 0) + mins;
      if (l.note) prev.note = prev.note ? `${prev.note} / ${l.note}` : l.note;
    }
  }
  return [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
}

let memo: { at: number; list: Checkin[] } | null = null;
export function resetCheckinMemo() {
  memo = null;
}

async function load(env: Env, now: number): Promise<Checkin[]> {
  if (memo && now - memo.at < 15000) return memo.list;
  const { items } = await readList<Checkin | LegacyCheckin>(env, CHECKIN_FILE);
  const list = normalize(items);
  memo = { at: now, list };
  return list;
}

async function write(env: Env, message: string, now: number, fn: (list: Checkin[]) => void) {
  const list = await modify<Checkin | LegacyCheckin>(env, CHECKIN_FILE, HEADER, message, (items) => {
    const norm = normalize(items);
    fn(norm);
    return norm;
  });
  memo = { at: now, list: normalize(list) };
}

/** 누구나 볼 수 있는 출석 상태: 오늘 출석했는지, 최근 기록 */
export async function getStatus(env: Env, now = Date.now()) {
  const list = await load(env, now);
  const t = today(now);
  const todayRec = list.find((c) => c.date === t) || null;
  return {
    today: todayRec,
    current: todayRec, // 음악 장면(/api/scene)에서 '오늘 출석함'으로 써요
    recent: list.slice(-60).reverse(),
    now: kstIso(now),
  };
}

/** 오늘 출석. 이미 했으면 그대로 돌려줘요(한 마디만 새로 적었으면 바꿔요). */
export async function startCheckin(env: Env, input: Record<string, unknown>, now = Date.now()) {
  const text = oneLine(input.text, 140, "한 마디");
  const t = today(now);
  await write(env, `출석: ${t}${text ? ` ${text}` : ""}`, now, (list) => {
    const has = list.find((c) => c.date === t);
    if (has) {
      if (text) has.text = text;
      return;
    }
    list.push({ date: t, at: kstIso(now).slice(11, 16), ...(text ? { text } : {}) });
    list.sort((a, b) => (a.date < b.date ? -1 : 1));
  });
  return getStatus(env, now);
}

/** 출석한 날의 공부 시간, 한 마디, 메모를 고쳐요. 보낸 칸만 바뀌고, 빈 값을 보내면 지워요. */
export async function editCheckin(env: Env, input: Record<string, unknown>, now = Date.now()) {
  const date = typeof input.date === "string" ? input.date : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new HttpError(400, "날짜를 골라 주세요.");
  const patch: Partial<Checkin> = {};
  if ("minutes" in input) patch.minutes = minutesOf(input.minutes);
  if ("text" in input) patch.text = oneLine(input.text, 140, "한 마디");
  if ("note" in input) patch.note = oneLine(input.note, 500, "메모");
  await write(env, `출석 기록 고침: ${date}`, now, (list) => {
    const c = list.find((x) => x.date === date);
    if (!c) throw new HttpError(404, "그날은 출석 기록이 없어요.");
    for (const k of Object.keys(patch) as (keyof Checkin)[]) {
      const v = patch[k];
      if (v === undefined) delete c[k];
      else (c as unknown as Record<string, unknown>)[k] = v;
    }
  });
  return getStatus(env, now);
}

export async function deleteCheckin(env: Env, date: string, now = Date.now()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new HttpError(400, "날짜를 골라 주세요.");
  await write(env, `출석 기록 지움: ${date}`, now, (list) => {
    const i = list.findIndex((c) => c.date === date);
    if (i < 0) throw new HttpError(404, "그날은 출석 기록이 없어요.");
    list.splice(i, 1);
  });
  return getStatus(env, now);
}
