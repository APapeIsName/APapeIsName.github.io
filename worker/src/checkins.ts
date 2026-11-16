/**
 * 출석 체크: 지금 무엇을 하는지 한 마디로 남기고, 끝나면 마무리 한 마디와 함께 "상황 종료".
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
  note?: string; // 마무리 한 마디
}

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

/** 누구나 볼 수 있는 지금 상태 */
export async function getStatus(env: Env, now = Date.now()) {
  const list = await load(env, now);
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
  let created: Checkin | null = null;
  const list = await modify<Checkin>(env, CHECKIN_FILE, HEADER, `출석: ${text}`, (items) => {
    const cur = currentOf(items);
    if (cur) cur.end = kstIso(now); // 하던 게 있으면 먼저 끝내요
    created = { id: `c${now.toString(36)}`, kind, text, start: kstIso(now) };
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
    const cur = currentOf(items);
    if (!cur) throw new HttpError(409, "지금 진행 중인 출석이 없어요.");
    cur.end = kstIso(now);
    if (note) cur.note = note;
    ended = cur;
    return items;
  });
  memo = { at: now, list };
  return { checkin: ended as Checkin | null, ...(await getStatus(env, now)) };
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
