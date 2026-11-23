/**
 * 출석 체크: 지금 무엇을 하는지 한 마디와 "얼마나 할지"를 남겨요.
 * 정한 시간이 지나면 저절로 끝나요(auto). 끝내기를 잊어도 기록이 끝없이 늘어나지 않게요.
 * 더 하고 싶으면 연장하고, 자동으로 끝난 기록은 나중에 실제 끝난 시간으로 고쳐요.
 * 출석을 깜빡했으면 지난 공부를 시작, 끝 시간으로 따로 남겨요.
 * _data/checkins.yml 에 쌓여서 블로그 출석부와 공부 잔디에 쓰여요.
 */
import type { Env } from "./env";
import { HttpError } from "./http";
import { modify, readList } from "./taxonomy";

export const CHECKIN_FILE = "_data/checkins.yml";
export const CHECKIN_KINDS = ["공부", "작업", "독서", "회고", "기타"] as const;
export type CheckinKind = (typeof CHECKIN_KINDS)[number];

export interface Checkin {
  id: string;
  kind: CheckinKind;
  text: string;
  start: string; // 서울 시간 ISO (예: 2026-11-16T16:05:00+09:00)
  end?: string;
  until?: string; // 이때까지 하기로 함. 지나면 저절로 끝나요
  auto?: boolean; // 끝내기를 안 눌러 정한 시간에 저절로 끝남
  past?: boolean; // 지나고 나서 남긴 기록
  note?: string; // 마무리 한 마디
}

const MIN = 60 * 1000;
export const DEFAULT_MINUTES = 120;
/** 정한 시간이 없는 옛 기록은 시작하고 이만큼 지나면 끝난 걸로 쳐요. */
export const LEGACY_CAP_MINUTES = 180;
const MAX_MINUTES = 8 * 60;
const MAX_SPAN = 16 * 60 * MIN;

const KST = 9 * 3600 * 1000;
const HEADER = "출석 기록";

export function kstIso(now: number): string {
  return new Date(now + KST).toISOString().slice(0, 19) + "+09:00";
}

function oneLine(v: unknown, max: number, label: string, required: boolean): string | undefined {
  if (v === undefined || v === null || v === "") {
    if (required) throw new HttpError(400, `${label}을(를) 적어 주세요.`);
    return undefined;
  }
  if (typeof v !== "string") throw new HttpError(400, `${label} 형식이 맞지 않아요.`);
  const t = v.replace(/\s+/g, " ").trim();
  if (!t && required) throw new HttpError(400, `${label}을(를) 적어 주세요.`);
  if (t.length > max) throw new HttpError(400, `${label}은(는) ${max}자까지예요.`);
  return t || undefined;
}

function minutesOf(v: unknown, fallback: number): number {
  if (v === undefined || v === null || v === "") return fallback;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 10 || n > MAX_MINUTES) throw new HttpError(400, `시간은 10분에서 ${MAX_MINUTES / 60}시간 사이로 골라 주세요.`);
  return Math.round(n);
}

const ms = (iso: string) => Date.parse(iso);

/** 끝낼 시각: 정한 시간, 없으면 시작 + 옛 기록 상한 */
export function limitOf(c: Checkin): number {
  return c.until ? ms(c.until) : ms(c.start) + LEGACY_CAP_MINUTES * MIN;
}

/** 정한 시간이 지난 출석을 그 시각에 끝내요. 고친 게 있으면 true. */
export function settle(list: Checkin[], now: number): boolean {
  let changed = false;
  for (const c of list) {
    if (c.end) continue;
    const limit = limitOf(c);
    if (now >= limit) {
      c.end = kstIso(limit);
      c.auto = true;
      changed = true;
    }
  }
  return changed;
}

/**
 * "21:30" 같은 시각을 기준 날짜(서울)의 ISO로 바꿔요. ISO를 그대로 줘도 돼요.
 * after를 주면, 그보다 이르면 다음 날로 넘겨요(자정을 넘긴 공부).
 */
export function parseTime(v: unknown, baseIso: string, label: string, after?: number): number {
  if (typeof v !== "string" || !v.trim()) throw new HttpError(400, `${label}을(를) 적어 주세요.`);
  const t = v.trim();
  let at: number;
  const m = /^(\d{1,2}):(\d{2})$/.exec(t);
  if (m) {
    const h = Number(m[1]), mi = Number(m[2]);
    if (h > 23 || mi > 59) throw new HttpError(400, `${label}이(가) 올바른 시각이 아니에요.`);
    at = Date.parse(`${baseIso.slice(0, 10)}T${String(h).padStart(2, "0")}:${m[2]}:00+09:00`);
    if (after !== undefined && at <= after) at += 24 * 60 * MIN;
  } else {
    at = Date.parse(t);
    if (!Number.isFinite(at)) throw new HttpError(400, `${label}이(가) 올바른 시각이 아니에요.`);
  }
  return at;
}

export function currentOf(list: Checkin[]): Checkin | null {
  const last = list[list.length - 1];
  return last && !last.end ? last : null;
}

let memo: { at: number; list: Checkin[] } | null = null;
const TTL = 15 * 1000;

async function load(env: Env, now: number): Promise<Checkin[]> {
  if (memo && now - memo.at < TTL) return memo.list;
  const { items } = await readList<Checkin>(env, CHECKIN_FILE);
  memo = { at: now, list: items };
  return items;
}

/** 보여 줄 때는 정한 시간이 지난 출석을 끝난 걸로 쳐요(파일은 다음에 쓸 때 고쳐요). */
function view(list: Checkin[], now: number): Checkin[] {
  const copy = list.map((c) => ({ ...c }));
  settle(copy, now);
  return copy;
}

/** 누구나 볼 수 있는 지금 상태 */
export async function getStatus(env: Env, now = Date.now()) {
  const list = view(await load(env, now), now);
  const current = currentOf(list);
  const today = kstIso(now).slice(0, 10);
  const finished = list.filter((c) => c.end);
  return {
    current,
    last: finished[finished.length - 1] ?? null,
    todayCount: list.filter((c) => c.start.slice(0, 10) === today).length,
    recent: list.slice(-30).reverse(),
    now: kstIso(now),
  };
}

export async function startCheckin(env: Env, input: Record<string, unknown>, now = Date.now()) {
  const kind = (CHECKIN_KINDS as readonly string[]).includes(input.kind as string) ? (input.kind as CheckinKind) : "공부";
  const text = oneLine(input.text, 140, "한 마디", true)!;
  const minutes = minutesOf(input.minutes, DEFAULT_MINUTES);
  let created: Checkin | null = null;
  const list = await modify<Checkin>(env, CHECKIN_FILE, HEADER, `출석: ${text}`, (items) => {
    settle(items, now);
    const cur = currentOf(items);
    if (cur) cur.end = kstIso(now); // 하던 게 있으면 먼저 끝내요
    created = { id: `c${now.toString(36)}`, kind, text, start: kstIso(now), until: kstIso(now + minutes * MIN) };
    items.push(created);
    return items;
  });
  memo = { at: now, list };
  return { checkin: created as Checkin | null, ...(await getStatus(env, now)) };
}

export async function endCheckin(env: Env, input: Record<string, unknown>, now = Date.now()) {
  const note = oneLine(input.note, 140, "마무리 한 마디", false);
  let ended: Checkin | null = null;
  const list = await modify<Checkin>(env, CHECKIN_FILE, HEADER, `상황 종료${note ? `: ${note}` : ""}`, (items) => {
    settle(items, now);
    const cur = currentOf(items);
    if (!cur) throw new HttpError(409, "지금 진행 중인 출석이 없어요. 정한 시간이 지나 저절로 끝났다면 출석부에서 끝난 시간을 고쳐 주세요.");
    cur.end = kstIso(now);
    if (note) cur.note = note;
    ended = cur;
    return items;
  });
  memo = { at: now, list };
  return { checkin: ended as Checkin | null, ...(await getStatus(env, now)) };
}

/** 지금 출석을 더 해요. 정한 시간(또는 지금) 뒤로 minutes만큼. */
export async function extendCheckin(env: Env, input: Record<string, unknown>, now = Date.now()) {
  const minutes = minutesOf(input.minutes, 30);
  let cur: Checkin | null = null;
  const list = await modify<Checkin>(env, CHECKIN_FILE, HEADER, `출석 연장: ${minutes}분`, (items) => {
    settle(items, now);
    cur = currentOf(items);
    if (!cur) throw new HttpError(409, "지금 진행 중인 출석이 없어요.");
    const from = Math.max(limitOf(cur), now);
    const until = Math.min(from + minutes * MIN, ms(cur.start) + MAX_SPAN);
    cur.until = kstIso(until);
    return items;
  });
  memo = { at: now, list };
  return { checkin: cur as Checkin | null, ...(await getStatus(env, now)) };
}

/** 끝난 시간이나 마무리 한 마디를 고쳐요. 저절로 끝난 기록을 실제 시간으로 바로잡을 때 써요. */
export async function editCheckin(env: Env, input: Record<string, unknown>, now = Date.now()) {
  const id = typeof input.id === "string" ? input.id : "";
  let edited: Checkin | null = null;
  const list = await modify<Checkin>(env, CHECKIN_FILE, HEADER, `출석 기록 고침: ${id}`, (items) => {
    settle(items, now);
    const c = items.find((x) => x.id === id);
    if (!c) throw new HttpError(404, "그 출석 기록을 찾지 못했어요.");
    if (input.end !== undefined) {
      const start = ms(c.start);
      const end = parseTime(input.end, c.start, "끝난 시간", start);
      if (end <= start) throw new HttpError(400, "끝난 시간은 시작보다 늦어야 해요.");
      if (end > now + MIN) throw new HttpError(400, "끝난 시간이 아직 오지 않았어요.");
      if (end - start > MAX_SPAN) throw new HttpError(400, "한 번의 출석은 16시간까지예요.");
      c.end = kstIso(end);
      delete c.auto;
      delete c.until;
    }
    if (input.note !== undefined) {
      const note = oneLine(input.note, 140, "마무리 한 마디", false);
      if (note) c.note = note; else delete c.note;
    }
    edited = c;
    return items;
  });
  memo = { at: now, list };
  return { checkin: edited as Checkin | null, ...(await getStatus(env, now)) };
}

/** 출석을 깜빡한 공부를 시작, 끝 시간으로 남겨요. date가 없으면 오늘이에요. */
export async function addPastCheckin(env: Env, input: Record<string, unknown>, now = Date.now()) {
  const kind = (CHECKIN_KINDS as readonly string[]).includes(input.kind as string) ? (input.kind as CheckinKind) : "공부";
  const text = oneLine(input.text, 140, "한 마디", true)!;
  const note = oneLine(input.note, 140, "마무리 한 마디", false);
  const day = typeof input.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(input.date) ? input.date : kstIso(now).slice(0, 10);
  const base = `${day}T00:00:00+09:00`;
  const start = parseTime(input.start, base, "시작 시간");
  const end = parseTime(input.end, base, "끝난 시간", start);
  if (end - start > MAX_SPAN) throw new HttpError(400, "한 번의 출석은 16시간까지예요.");
  if (end > now + MIN) throw new HttpError(400, "끝난 시간이 아직 오지 않았어요. 지금 하는 공부는 출석 체크로 남겨 주세요.");
  let created: Checkin | null = null;
  const list = await modify<Checkin>(env, CHECKIN_FILE, HEADER, `지난 출석: ${text}`, (items) => {
    settle(items, now);
    const clash = items.find((c) => ms(c.start) < end && (c.end ? ms(c.end) : now) > start);
    if (clash) throw new HttpError(409, `그 시간에는 이미 출석 기록이 있어요: ${clash.start.slice(11, 16)} ${clash.text}`);
    created = { id: `c${now.toString(36)}`, kind, text, start: kstIso(start), end: kstIso(end), past: true, ...(note ? { note } : {}) };
    items.push(created);
    items.sort((a, b) => (a.start < b.start ? -1 : 1));
    return items;
  });
  memo = { at: now, list };
  return { checkin: created as Checkin | null, ...(await getStatus(env, now)) };
}

export async function deleteCheckin(env: Env, id: string, now = Date.now()) {
  const list = await modify<Checkin>(env, CHECKIN_FILE, HEADER, `출석 기록 삭제: ${id}`, (items) => {
    const next = items.filter((c) => c.id !== id);
    if (next.length === items.length) throw new HttpError(404, "그 출석 기록을 찾지 못했어요.");
    return next;
  });
  memo = { at: now, list };
  return { deleted: id, ...(await getStatus(env, now)) };
}

export function resetCheckinMemo() {
  memo = null;
}
