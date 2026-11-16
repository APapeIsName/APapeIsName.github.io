import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import type { Env } from "./env";
import { HttpError } from "./http";
import { getFile, putFile } from "./github";

/** 시리즈: 책이나 강의, 주제처럼 순서대로 이어 읽는 글 묶음. _data/series.yml 에 저장해요. */
export interface Series {
  id: string;
  title: string;
  description?: string;
  link?: string;
}
/** 태그: 글에 자유롭게 다는 꼬리표. _data/tags.yml 에 저장해요. */
export interface Tag {
  name: string;
  description?: string;
}

export const SERIES_FILE = "_data/series.yml";
export const TAGS_FILE = "_data/tags.yml";
export const SERIES_ID = /^[a-z0-9][a-z0-9-]{0,39}$/;
const TAG_BAD = /[,#|\n\r\t"<>]/;

function text(v: unknown, max: number, label: string): string | undefined {
  if (v === undefined || v === null || v === "") return undefined;
  if (typeof v !== "string") throw new HttpError(400, `${label} 형식이 맞지 않아요.`);
  const s = v.replace(/\s+/g, " ").trim();
  if (s.length > max) throw new HttpError(400, `${label}이(가) 너무 길어요 (${max}자까지).`);
  return s || undefined;
}

export function cleanTagName(v: unknown): string {
  const name = text(v, 30, "태그");
  if (!name) throw new HttpError(400, "태그 이름을 입력해 주세요.");
  if (TAG_BAD.test(name)) throw new HttpError(400, `태그에는 쉼표, #, |, 따옴표, <, >를 쓸 수 없어요.`);
  return name;
}

export function cleanSeries(input: Record<string, unknown>, existingIds: string[], now = Date.now()): Series {
  const title = text(input.title, 80, "시리즈 이름");
  if (!title) throw new HttpError(400, "시리즈 이름을 입력해 주세요.");
  let id = typeof input.id === "string" ? input.id.trim().toLowerCase() : "";
  if (id && !SERIES_ID.test(id)) throw new HttpError(400, "시리즈 주소 이름은 영어 소문자, 숫자, -만 쓸 수 있어요 (40자까지).");
  if (!id) {
    // 제목에서 영어와 숫자만 뽑아 쓰고, 없으면(한글 제목) 시간으로 만들어요.
    const ascii = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32);
    id = ascii.length >= 3 ? ascii : `s-${now.toString(36)}`;
    let n = 2;
    const base = id;
    while (existingIds.includes(id)) id = `${base}-${n++}`;
  }
  const link = text(input.link, 300, "링크");
  if (link && !/^https?:\/\//.test(link)) throw new HttpError(400, "링크는 http:// 나 https:// 로 시작해야 해요.");
  return { id, title, description: text(input.description, 300, "설명"), link };
}

function compact<T extends object>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== "")) as T;
}

async function readList<T>(env: Env, path: string): Promise<{ items: T[]; sha?: string }> {
  try {
    const f = await getFile(env, path);
    const data = parseYaml(f.text);
    return { items: Array.isArray(data) ? (data as T[]) : [], sha: f.sha };
  } catch (e) {
    if (e instanceof HttpError && e.status === 404) return { items: [] };
    throw e;
  }
}

function dump(header: string, items: object[]): string {
  return `# ${header}\n# 블로그 글쓰기 화면이나 관리 화면에서 바뀌어요. 직접 고쳐도 돼요.\n` + (items.length ? stringifyYaml(items.map(compact), { lineWidth: 0 }) : "[]\n");
}

/** 읽고, 바꾸고, 저장해요. 그사이 다른 저장이 끼어들면(409) 한 번 다시 읽어서 해요. */
async function modify<T>(env: Env, path: string, header: string, message: string, change: (items: T[]) => T[] | null): Promise<T[]> {
  for (let attempt = 0; ; attempt++) {
    const { items, sha } = await readList<T>(env, path);
    const next = change(items.slice());
    if (!next) return items; // 바꿀 게 없어요
    try {
      await putFile(env, path, dump(header, next as object[]), message, sha);
      return next;
    } catch (e) {
      if (attempt === 0 && e instanceof HttpError && e.status === 409) continue;
      throw e;
    }
  }
}

export async function getTaxonomy(env: Env) {
  const [s, t] = await Promise.all([readList<Series>(env, SERIES_FILE), readList<Tag>(env, TAGS_FILE)]);
  return { series: s.items, tags: t.items };
}

export async function saveSeries(env: Env, input: Record<string, unknown>, now = Date.now()) {
  let saved: Series | null = null;
  const editing = typeof input.id === "string" && input.id !== "" && input.create !== true;
  const items = await modify<Series>(env, SERIES_FILE, "시리즈 목록", "시리즈 저장", (list) => {
    const ids = list.map((s) => s.id);
    if (editing) {
      const i = list.findIndex((s) => s.id === input.id);
      if (i === -1) throw new HttpError(404, "그 시리즈를 찾지 못했어요.");
      saved = cleanSeries(input, ids, now);
      list[i] = saved;
      return list;
    }
    if (typeof input.id === "string" && input.id && ids.includes(String(input.id).toLowerCase())) {
      throw new HttpError(409, "같은 주소 이름의 시리즈가 이미 있어요.");
    }
    saved = cleanSeries({ ...input, id: input.id || "" }, ids, now);
    if (list.some((s) => s.title === saved!.title)) throw new HttpError(409, "같은 이름의 시리즈가 이미 있어요.");
    list.push(saved);
    return list;
  });
  return { series: saved as Series | null, all: items };
}

export async function deleteSeries(env: Env, id: string) {
  const items = await modify<Series>(env, SERIES_FILE, "시리즈 목록", `시리즈 삭제: ${id}`, (list) => {
    const next = list.filter((s) => s.id !== id);
    if (next.length === list.length) throw new HttpError(404, "그 시리즈를 찾지 못했어요.");
    return next;
  });
  return { deleted: id, all: items };
}

export async function saveTag(env: Env, input: Record<string, unknown>) {
  const name = cleanTagName(input.name);
  const description = text(input.description, 200, "설명");
  const items = await modify<Tag>(env, TAGS_FILE, "태그 목록", `태그 저장: ${name}`, (list) => {
    const i = list.findIndex((t) => t.name.toLowerCase() === name.toLowerCase());
    if (i === -1) { list.push({ name, description }); return list; }
    if (input.create === true) throw new HttpError(409, "같은 이름의 태그가 이미 있어요.");
    if (list[i].description === description && list[i].name === name) return null;
    list[i] = { name, description };
    return list;
  });
  return { tag: { name, description }, all: items };
}

export async function deleteTag(env: Env, name: string) {
  const items = await modify<Tag>(env, TAGS_FILE, "태그 목록", `태그 삭제: ${name}`, (list) => {
    const next = list.filter((t) => t.name !== name);
    if (next.length === list.length) throw new HttpError(404, "그 태그를 찾지 못했어요.");
    return next;
  });
  return { deleted: name, all: items };
}

/** 글에 달린 태그 중 목록에 없는 건 목록에 더해요. 없으면 아무것도 저장하지 않아요. */
export async function ensureTags(env: Env, names: string[]) {
  if (!names.length) return;
  await modify<Tag>(env, TAGS_FILE, "태그 목록", "새 태그 추가", (list) => {
    const known = new Set(list.map((t) => t.name.toLowerCase()));
    const missing = names.filter((n) => !known.has(n.toLowerCase()));
    if (!missing.length) return null;
    return list.concat(missing.map((name) => ({ name })));
  });
}

export async function assertSeriesExists(env: Env, id: string | undefined) {
  if (!id) return;
  const { items } = await readList<Series>(env, SERIES_FILE);
  if (!items.some((s) => s.id === id)) throw new HttpError(400, "그 시리즈가 없어요. 시리즈를 먼저 만들어 주세요.");
}
