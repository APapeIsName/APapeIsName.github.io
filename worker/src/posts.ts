import { parse as parseYaml } from "yaml";
import type { Env } from "./env";
import { HttpError } from "./http";
import { deleteFile, getFile, listDir, putFile } from "./github";
import { assertNotePath, noteUrl } from "./notes";

export const KINDS = ["과제 리포트", "강의 노트", "보스 회고", "시즌 결산"] as const;
const TEXT_FIELDS = ["goal", "recall_note", "gaps", "stuck", "next_steps"] as const;
const POST_PATH = /^_posts\/(\d{4})-(\d{2})-(\d{2})-([A-Za-z0-9-]+)\.md$/;
export const RAW_OPEN = "{% raw %}";
export const RAW_CLOSE = "{% endraw %}";

export interface PostFields {
  title: string;
  date: string; // YYYY-MM-DD
  quest: string;
  kind: (typeof KINDS)[number];
  hours?: number;
  complete: boolean;
  recalled: boolean;
  goal?: string;
  recall_note?: string;
  gaps?: string;
  stuck?: string;
  next_steps?: string;
  body: string;
}

export function str(v: unknown, max: number, label: string): string | undefined {
  if (v === undefined || v === null || v === "") return undefined;
  if (typeof v !== "string") throw new HttpError(400, `${label} 형식이 맞지 않아요.`);
  const s = v.replace(/\r\n/g, "\n").trim();
  if (s.length > max) throw new HttpError(400, `${label}이(가) 너무 길어요 (${max}자까지).`);
  return s || undefined;
}

export function checkDate(v: unknown, label: string): string {
  const date = typeof v === "string" ? v : "";
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!d || Number.isNaN(Date.UTC(+d[1], +d[2] - 1, +d[3])) || +d[2] < 1 || +d[2] > 12 || +d[3] < 1 || +d[3] > 31) {
    throw new HttpError(400, `${label}이 올바른 날짜가 아니에요.`);
  }
  return date;
}

export function checkHours(v: unknown): number | undefined {
  if (v === undefined || v === null || v === "") return undefined;
  const hours = Number(v);
  if (!Number.isFinite(hours) || hours < 0 || hours > 200) throw new HttpError(400, "쓴 시간은 0~200 사이 숫자로 적어 주세요.");
  return Math.round(hours * 10) / 10;
}

/** 본문의 {{ }} 나 {% %} 가 Jekyll 템플릿으로 해석되지 않게 감싸요. */
export function wrapBody(body: string): string {
  return body ? `${RAW_OPEN}\n${body}\n${RAW_CLOSE}\n` : "";
}
export function unwrapBody(raw: string): string {
  let body = raw.trim();
  if (body.startsWith(RAW_OPEN) && body.endsWith(RAW_CLOSE)) body = body.slice(RAW_OPEN.length, -RAW_CLOSE.length).trim();
  return body;
}
export function splitFrontMatter(text: string, what: string): { fm: Record<string, unknown>; body: string } {
  const m = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(text.replace(/\r\n/g, "\n"));
  if (!m) throw new HttpError(422, `${what} 파일의 머리말(front matter)을 읽지 못했어요.`);
  return { fm: (parseYaml(m[1]) || {}) as Record<string, unknown>, body: unwrapBody(m[2]) };
}
export function fmDate(v: unknown): string {
  return v instanceof Date ? v.toISOString().slice(0, 10) : String(v ?? "").slice(0, 10);
}
export function kstHHMM(now: Date): string {
  return new Date(now.getTime() + 9 * 3600 * 1000).toISOString().slice(11, 16).replace(":", "");
}

/** 브라우저에서 온 값을 검사하고 정리해요. */
export function validateFields(input: Record<string, unknown>): PostFields {
  const title = str(input.title, 200, "제목");
  if (!title) throw new HttpError(400, "제목을 입력해 주세요.");
  const quest = typeof input.quest === "string" ? input.quest.trim() : "";
  if (!/^S\d-[0-9a-f]{6}$/.test(quest)) throw new HttpError(400, "과제를 골라 주세요.");
  const date = checkDate(input.date, "제출일");
  const kind = (KINDS as readonly string[]).includes(input.kind as string) ? (input.kind as PostFields["kind"]) : "과제 리포트";
  const hours = checkHours(input.hours);
  const fields: PostFields = {
    title, date, quest, kind, hours,
    complete: input.complete === true,
    recalled: input.recalled === true,
    body: str(input.body, 100000, "정리") || "",
  };
  for (const k of TEXT_FIELDS) fields[k] = str(input[k], 20000, k);
  if (fields.body.includes(RAW_CLOSE)) throw new HttpError(400, `정리 칸에 "${RAW_CLOSE}"는 쓸 수 없어요.`);
  return fields;
}

/** Jekyll이 읽는 마크다운 파일로 만들어요. 문자열은 JSON 문자열로 써서 YAML에서도 그대로 읽혀요. */
export function buildMarkdown(f: PostFields): string {
  const lines = ["---", `title: ${JSON.stringify(f.title)}`, `date: ${f.date}`, `quest: ${JSON.stringify(f.quest)}`, `kind: ${JSON.stringify(f.kind)}`];
  if (f.hours !== undefined) lines.push(`hours: ${f.hours}`);
  lines.push(`complete: ${f.complete}`, `recalled: ${f.recalled}`);
  for (const k of TEXT_FIELDS) if (f[k]) lines.push(`${k}: ${JSON.stringify(f[k])}`);
  lines.push("---", "");
  return lines.join("\n") + "\n" + wrapBody(f.body);
}

export function parseMarkdown(text: string): PostFields {
  const { fm, body } = splitFrontMatter(text, "리포트");
  const date = fmDate(fm.date);
  return {
    title: String(fm.title ?? ""),
    date,
    quest: String(fm.quest ?? ""),
    kind: (KINDS as readonly string[]).includes(fm.kind as string) ? (fm.kind as PostFields["kind"]) : "과제 리포트",
    hours: typeof fm.hours === "number" ? fm.hours : undefined,
    complete: fm.complete === true,
    recalled: fm.recalled === true,
    goal: fm.goal ? String(fm.goal) : undefined,
    recall_note: fm.recall_note ? String(fm.recall_note) : undefined,
    gaps: fm.gaps ? String(fm.gaps) : undefined,
    stuck: fm.stuck ? String(fm.stuck) : undefined,
    next_steps: fm.next_steps ? String(fm.next_steps) : undefined,
    body,
  };
}

export function assertPostPath(path: string | null): string {
  if (!path || !POST_PATH.test(path)) throw new HttpError(400, "리포트 파일 경로가 올바르지 않아요.");
  return path;
}

/** 파일 이름: _posts/날짜-과제id-시분(한국 시간).md */
export function postPath(f: PostFields, now = new Date()): string {
  return `_posts/${f.date}-${f.quest.toLowerCase()}-${kstHHMM(now)}.md`;
}

export function postUrl(env: Env, path: string): string {
  const m = POST_PATH.exec(path);
  if (!m) return env.BLOG_ORIGIN;
  return `${env.BLOG_ORIGIN}/reports/${m[1]}/${m[2]}/${m[3]}/${m[4]}/`;
}

export async function publishPost(env: Env, input: Record<string, unknown>, now = new Date()) {
  const f = validateFields(input);
  let path = postPath(f, now);
  const text = buildMarkdown(f);
  try {
    await putFile(env, path, text, `리포트: ${f.title}`);
  } catch (e) {
    // 같은 분에 같은 과제로 두 번 발행했으면 초를 붙여 다시 시도
    if (!(e instanceof HttpError && e.status === 409)) throw e;
    const ss = String(now.getUTCSeconds()).padStart(2, "0");
    path = path.replace(/\.md$/, `${ss}.md`);
    await putFile(env, path, text, `리포트: ${f.title}`);
  }
  return { path, url: postUrl(env, path) };
}

export async function getPost(env: Env, path: string) {
  const file = await getFile(env, assertPostPath(path));
  return { path, sha: file.sha, url: postUrl(env, path), fields: parseMarkdown(file.text) };
}

export async function updatePost(env: Env, path: string, input: Record<string, unknown>) {
  assertPostPath(path);
  const sha = typeof input.sha === "string" ? input.sha : "";
  if (!sha) throw new HttpError(400, "수정하려면 파일 버전(sha)이 필요해요.");
  const f = validateFields(input);
  await putFile(env, path, buildMarkdown(f), `리포트 수정: ${f.title}`, sha);
  return { path, url: postUrl(env, path) };
}

export async function deletePost(env: Env, path: string, sha: string | null) {
  assertPostPath(path);
  if (!sha) throw new HttpError(400, "삭제하려면 파일 버전(sha)이 필요해요.");
  await deleteFile(env, path, sha, `리포트 삭제: ${path}`);
  return { path, deleted: true };
}

export async function listPosts(env: Env) {
  const items = await listDir(env, "_posts");
  return items
    .filter((i) => i.type === "file" && POST_PATH.test(i.path))
    .map((i) => ({ path: i.path, sha: i.sha, url: postUrl(env, i.path) }))
    .sort((a, b) => (a.path < b.path ? 1 : -1));
}

/** 공개 주소가 열리면 발행된 거예요. GitHub Pages 빌드는 보통 1~2분 걸려요. */
export async function postStatus(env: Env, path: string, fetcher: typeof fetch = fetch) {
  const url = path.startsWith("_notes/") ? noteUrl(env, assertNotePath(path)) : postUrl(env, assertPostPath(path));
  const res = await fetcher(`${url}?check=${Date.now()}`, { method: "GET", redirect: "manual", headers: { "Cache-Control": "no-cache" } });
  return { path, url, state: res.status === 200 ? "published" : "building" };
}
