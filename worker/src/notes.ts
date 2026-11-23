import type { Env } from "./env";
import { HttpError } from "./http";
import { deleteFile, getFile, putFile } from "./github";
import { RAW_CLOSE, checkDate, checkHours, fmDate, kstHHMM, splitFrontMatter, str, wrapBody } from "./posts";
import { SERIES_ID, assertSeriesExists, cleanTagName, ensureTags } from "./taxonomy";

/** 공부 노트: 과제와 상관없이 배운 것을 적는 글. _notes 컬렉션에 저장해요. */
export interface NoteFields {
  title: string;
  date: string;
  series?: string;
  /** CS 과정 노트면 어느 과제를 공부했는지 (예: S0-863670) */
  quest?: string;
  tags: string[];
  hours?: number;
  summary?: string;
  body: string;
}

const NOTE_PATH = /^_notes\/(\d{4})-(\d{2})-(\d{2})-([a-z0-9-]+)\.md$/;
const MAX_TAGS = 10;

export function validateNote(input: Record<string, unknown>): NoteFields {
  const title = str(input.title, 200, "제목");
  if (!title) throw new HttpError(400, "제목을 입력해 주세요.");
  const date = checkDate(input.date, "날짜");
  let series: string | undefined;
  if (typeof input.series === "string" && input.series.trim()) {
    series = input.series.trim();
    if (!SERIES_ID.test(series)) throw new HttpError(400, "프로젝트가 올바르지 않아요.");
  }
  const raw = Array.isArray(input.tags) ? input.tags : [];
  const tags: string[] = [];
  for (const t of raw) {
    const name = cleanTagName(t);
    if (!tags.some((x) => x.toLowerCase() === name.toLowerCase())) tags.push(name);
  }
  if (tags.length > MAX_TAGS) throw new HttpError(400, `태그는 ${MAX_TAGS}개까지 달 수 있어요.`);
  const body = str(input.body, 100000, "본문") || "";
  if (body.includes(RAW_CLOSE)) throw new HttpError(400, `본문에 "${RAW_CLOSE}"는 쓸 수 없어요.`);
  let quest: string | undefined;
  if (typeof input.quest === "string" && input.quest.trim()) {
    quest = input.quest.trim();
    if (!/^(S\d|H[SFA])-[0-9a-f]{6}$/.test(quest)) throw new HttpError(400, "과제가 올바르지 않아요.");
  }
  return { title, date, series, quest, tags, hours: checkHours(input.hours), summary: str(input.summary, 300, "한 줄 요약"), body };
}

export function buildNote(f: NoteFields): string {
  const lines = ["---", `title: ${JSON.stringify(f.title)}`, `date: ${f.date}`];
  if (f.series) lines.push(`series: ${JSON.stringify(f.series)}`);
  if (f.quest) lines.push(`quest: ${JSON.stringify(f.quest)}`);
  lines.push(`tags: ${JSON.stringify(f.tags)}`);
  if (f.hours !== undefined) lines.push(`hours: ${f.hours}`);
  if (f.summary) lines.push(`summary: ${JSON.stringify(f.summary)}`);
  lines.push("---", "");
  return lines.join("\n") + "\n" + wrapBody(f.body);
}

export function parseNote(text: string): NoteFields {
  const { fm, body } = splitFrontMatter(text, "노트");
  return {
    title: String(fm.title ?? ""),
    date: fmDate(fm.date),
    series: fm.series ? String(fm.series) : undefined,
    quest: fm.quest ? String(fm.quest) : undefined,
    tags: Array.isArray(fm.tags) ? fm.tags.map(String) : [],
    hours: typeof fm.hours === "number" ? fm.hours : undefined,
    summary: fm.summary ? String(fm.summary) : undefined,
    body,
  };
}

export function assertNotePath(path: string | null): string {
  if (!path || !NOTE_PATH.test(path)) throw new HttpError(400, "노트 파일 경로가 올바르지 않아요.");
  return path;
}

/** 파일 이름: _notes/날짜-프로젝트(없으면 note)-시분(한국 시간).md */
export function notePath(f: NoteFields, now = new Date()): string {
  return `_notes/${f.date}-${f.series || "note"}-${kstHHMM(now)}.md`;
}

export function noteUrl(env: Env, path: string): string {
  const m = NOTE_PATH.exec(path);
  if (!m) return env.BLOG_ORIGIN;
  return `${env.BLOG_ORIGIN}/notes/${m[1]}/${m[2]}/${m[3]}/${m[4]}/`;
}

async function prepare(env: Env, input: Record<string, unknown>) {
  const f = validateNote(input);
  await assertSeriesExists(env, f.series);
  await ensureTags(env, f.tags);
  return f;
}

export async function publishNote(env: Env, input: Record<string, unknown>, now = new Date()) {
  const f = await prepare(env, input);
  let path = notePath(f, now);
  const text = buildNote(f);
  try {
    await putFile(env, path, text, `노트: ${f.title}`);
  } catch (e) {
    if (!(e instanceof HttpError && e.status === 409)) throw e;
    path = path.replace(/\.md$/, `${String(now.getUTCSeconds()).padStart(2, "0")}.md`);
    await putFile(env, path, text, `노트: ${f.title}`);
  }
  return { path, url: noteUrl(env, path) };
}

export async function getNote(env: Env, path: string) {
  const file = await getFile(env, assertNotePath(path));
  return { path, sha: file.sha, url: noteUrl(env, path), fields: parseNote(file.text) };
}

export async function updateNote(env: Env, path: string, input: Record<string, unknown>) {
  assertNotePath(path);
  const sha = typeof input.sha === "string" ? input.sha : "";
  if (!sha) throw new HttpError(400, "수정하려면 파일 버전(sha)이 필요해요.");
  const f = await prepare(env, input);
  await putFile(env, path, buildNote(f), `노트 수정: ${f.title}`, sha);
  return { path, url: noteUrl(env, path) };
}

export async function deleteNote(env: Env, path: string, sha: string | null) {
  assertNotePath(path);
  if (!sha) throw new HttpError(400, "삭제하려면 파일 버전(sha)이 필요해요.");
  await deleteFile(env, path, sha, `노트 삭제: ${path}`);
  return { path, deleted: true };
}
