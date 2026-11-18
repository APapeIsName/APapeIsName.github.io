import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import type { Env } from "./env";
import { HttpError } from "./http";
import { getFile, putFile } from "./github";

/** 할 일 하나. */
export interface Todo {
  text: string;
  done?: boolean;
}
export const PROJECT_STATUS = ["진행 중", "잠시 쉼", "끝남"] as const;
export type ProjectStatus = (typeof PROJECT_STATUS)[number];

/**
 * 프로젝트(= 시리즈): 책이나 강의, 주제처럼 이어지는 공부 묶음. _data/series.yml 에 저장해요.
 * 노트의 series 값이 이 id면 그 프로젝트의 글이에요.
 */
export interface Series {
  id: string;
  title: string;
  description?: string;
  link?: string;
  status?: ProjectStatus;
  goal?: string;
  values?: string[];
  todos?: Todo[];
}
/** 태그: 글에 자유롭게 다는 꼬리표. _data/tags.yml 에 저장해요. */
export interface Tag {
  name: string;
  description?: string;
}

export const SERIES_FILE = "_data/series.yml";
export const SETTINGS_FILE = "_data/settings.yml";
/** 메인 프로젝트 자리에 둘 수 있는 기본 과정(CS 기본기 독학 과정)의 id예요. */
export const COURSE_PROJECT_ID = "cs";
const MAX_VALUES = 10;
const MAX_TODOS = 60;
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
  const title = text(input.title, 80, "프로젝트 이름");
  if (!title) throw new HttpError(400, "프로젝트 이름을 입력해 주세요.");
  let id = typeof input.id === "string" ? input.id.trim().toLowerCase() : "";
  if (id && !SERIES_ID.test(id)) throw new HttpError(400, "프로젝트 주소 이름은 영어 소문자, 숫자, -만 쓸 수 있어요 (40자까지).");
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
  if (id === COURSE_PROJECT_ID) throw new HttpError(400, `'${COURSE_PROJECT_ID}'는 CS 과정이 쓰는 이름이라 다른 이름을 골라 주세요.`);
  let status: ProjectStatus | undefined;
  if (input.status !== undefined && input.status !== null && input.status !== "") {
    if (!PROJECT_STATUS.includes(input.status as ProjectStatus)) throw new HttpError(400, "상태는 진행 중, 잠시 쉼, 끝남 중 하나예요.");
    status = input.status as ProjectStatus;
  }
  return {
    id,
    title,
    description: text(input.description, 300, "설명"),
    link,
    status,
    goal: text(input.goal, 300, "목표"),
    values: cleanValues(input.values),
    todos: cleanTodos(input.todos),
  };
}

function cleanValues(v: unknown): string[] | undefined {
  if (v === undefined || v === null || v === "") return undefined;
  const raw = typeof v === "string" ? v.split("\n") : v;
  if (!Array.isArray(raw)) throw new HttpError(400, "가치관 형식이 맞지 않아요.");
  const out = raw.map((x, i) => text(x, 200, `가치관 ${i + 1}번째 줄`)).filter((x): x is string => !!x);
  if (out.length > MAX_VALUES) throw new HttpError(400, `가치관은 ${MAX_VALUES}줄까지 적을 수 있어요.`);
  return out.length ? out : undefined;
}

export function cleanTodos(v: unknown): Todo[] | undefined {
  if (v === undefined || v === null) return undefined;
  if (!Array.isArray(v)) throw new HttpError(400, "할 일 형식이 맞지 않아요.");
  const out: Todo[] = [];
  for (const [i, t] of v.entries()) {
    const item = typeof t === "string" ? { text: t } : (t as Record<string, unknown>);
    if (!item || typeof item !== "object") throw new HttpError(400, "할 일 형식이 맞지 않아요.");
    const body = text(item.text, 200, `할 일 ${i + 1}번`);
    if (!body) continue;
    out.push(item.done === true ? { text: body, done: true } : { text: body });
  }
  if (out.length > MAX_TODOS) throw new HttpError(400, `할 일은 ${MAX_TODOS}개까지 둘 수 있어요.`);
  return out.length ? out : undefined;
}

function compact<T extends object>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== "")) as T;
}

export async function readList<T>(env: Env, path: string): Promise<{ items: T[]; sha?: string }> {
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
export async function modify<T>(env: Env, path: string, header: string, message: string, change: (items: T[]) => T[] | null): Promise<T[]> {
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
  const [s, t, main] = await Promise.all([readList<Series>(env, SERIES_FILE), readList<Tag>(env, TAGS_FILE), getMain(env)]);
  return { series: s.items, tags: t.items, main };
}

export async function saveSeries(env: Env, input: Record<string, unknown>, now = Date.now()) {
  let saved: Series | null = null;
  const editing = typeof input.id === "string" && input.id !== "" && input.create !== true;
  const items = await modify<Series>(env, SERIES_FILE, "프로젝트 목록", "프로젝트 저장", (list) => {
    const ids = list.map((s) => s.id);
    if (editing) {
      const i = list.findIndex((s) => s.id === input.id);
      if (i === -1) throw new HttpError(404, "그 프로젝트를 찾지 못했어요.");
      // 보낸 칸만 바꾸고 나머지(할 일, 가치관 등)는 그대로 둬요. 비우려면 빈 값을 보내요.
      const { create: _c, ...patch } = input;
      saved = cleanSeries({ ...list[i], ...patch, id: list[i].id }, ids.filter((x) => x !== list[i].id), now);
      list[i] = saved;
      return list;
    }
    if (typeof input.id === "string" && input.id && ids.includes(String(input.id).toLowerCase())) {
      throw new HttpError(409, "같은 주소 이름의 프로젝트가 이미 있어요.");
    }
    saved = cleanSeries({ ...input, id: input.id || "" }, ids, now);
    if (list.some((s) => s.title === saved!.title)) throw new HttpError(409, "같은 이름의 프로젝트가 이미 있어요.");
    list.push(saved);
    return list;
  });
  return { series: saved as Series | null, all: items };
}

export async function deleteSeries(env: Env, id: string) {
  const items = await modify<Series>(env, SERIES_FILE, "프로젝트 목록", `프로젝트 삭제: ${id}`, (list) => {
    const next = list.filter((s) => s.id !== id);
    if (next.length === list.length) throw new HttpError(404, "그 프로젝트를 찾지 못했어요.");
    return next;
  });
  // 메인이던 프로젝트를 지우면 메인은 CS 과정으로 돌아가요.
  let main = await getMain(env);
  if (main === id) main = (await writeMain(env, COURSE_PROJECT_ID)).main;
  return { deleted: id, all: items, main };
}

/** _data/settings.yml 의 main_project. 없으면 CS 과정이에요. */
export async function getMain(env: Env): Promise<string> {
  try {
    const f = await getFile(env, SETTINGS_FILE);
    const data = parseYaml(f.text) as Record<string, unknown> | null;
    const v = data && typeof data.main_project === "string" ? data.main_project : "";
    return v || COURSE_PROJECT_ID;
  } catch (e) {
    if (e instanceof HttpError && e.status === 404) return COURSE_PROJECT_ID;
    throw e;
  }
}

async function writeMain(env: Env, id: string) {
  let sha: string | undefined;
  let data: Record<string, unknown> = {};
  try {
    const f = await getFile(env, SETTINGS_FILE);
    sha = f.sha;
    const parsed = parseYaml(f.text);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) data = parsed as Record<string, unknown>;
  } catch (e) {
    if (!(e instanceof HttpError && e.status === 404)) throw e;
  }
  if (data.main_project === id) return { main: id };
  data.main_project = id;
  const body = `# 블로그 설정\n# main_project: 홈과 GitHub 프로필 진도 카드에 크게 보일 프로젝트예요. ${COURSE_PROJECT_ID}는 CS 기본기 독학 과정이에요.\n` + stringifyYaml(data, { lineWidth: 0 });
  await putFile(env, SETTINGS_FILE, body, `메인 프로젝트: ${id}`, sha);
  return { main: id };
}

/** 메인 프로젝트를 바꿔요. CS 과정(cs)이나 있는 프로젝트만 고를 수 있어요. */
export async function setMain(env: Env, input: Record<string, unknown>) {
  const id = typeof input.id === "string" ? input.id.trim() : "";
  if (!id) throw new HttpError(400, "메인으로 둘 프로젝트를 골라 주세요.");
  if (id !== COURSE_PROJECT_ID) {
    const { items } = await readList<Series>(env, SERIES_FILE);
    if (!items.some((s) => s.id === id)) throw new HttpError(404, "그 프로젝트를 찾지 못했어요.");
  }
  return writeMain(env, id);
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
  if (!items.some((s) => s.id === id)) throw new HttpError(400, "그 프로젝트가 없어요. 프로젝트를 먼저 만들어 주세요.");
}
