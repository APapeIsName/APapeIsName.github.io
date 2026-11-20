import type { Env } from "./env";
import { HttpError } from "./http";
import { COURSE_PROJECT_ID, SERIES_FILE, modify, readList, type Series } from "./taxonomy";

/**
 * 링크 모음: 공부하며 본 사이트를 프로젝트별로 모아 둬요. _data/links.yml 에 저장해요.
 * project가 "cs"면 CS 과정, 프로젝트 id면 그 프로젝트, 비어 있으면 "기타"예요.
 */
export interface Link {
  id: string;
  title: string;
  url: string;
  note?: string;
  project?: string;
  added: string;
}
export const LINKS_FILE = "_data/links.yml";
const MAX_LINKS = 500;

function str(v: unknown, max: number, label: string): string | undefined {
  if (v === undefined || v === null || v === "") return undefined;
  if (typeof v !== "string") throw new HttpError(400, `${label} 형식이 맞지 않아요.`);
  const s = v.replace(/\s+/g, " ").trim();
  if (s.length > max) throw new HttpError(400, `${label}이(가) 너무 길어요 (${max}자까지).`);
  return s || undefined;
}

function kstDate(now: number): string {
  return new Date(now + 9 * 3600_000).toISOString().slice(0, 10);
}

/** 주소만 넣으면 제목은 주소에서 만들어요 (예: missing.csail.mit.edu/2026). */
export function titleFromUrl(url: string): string {
  const u = new URL(url);
  const path = u.pathname.replace(/\/+$/, "");
  return (u.hostname.replace(/^www\./, "") + (path && path !== "/" ? path : "")).slice(0, 100);
}

export function cleanLink(input: Record<string, unknown>, projects: string[], now = Date.now()): Omit<Link, "id" | "added"> {
  const url = str(input.url, 500, "주소");
  if (!url) throw new HttpError(400, "링크 주소를 넣어 주세요.");
  let parsed: URL;
  try { parsed = new URL(url); } catch { throw new HttpError(400, "링크 주소가 올바르지 않아요."); }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") throw new HttpError(400, "링크는 http:// 나 https:// 로 시작해야 해요.");
  const project = str(input.project, 40, "프로젝트");
  if (project && project !== COURSE_PROJECT_ID && !projects.includes(project)) throw new HttpError(400, "그 프로젝트를 찾지 못했어요. 먼저 프로젝트를 만들어 주세요.");
  void now;
  return {
    title: str(input.title, 100, "제목") || titleFromUrl(parsed.href),
    url: parsed.href,
    note: str(input.note, 300, "메모"),
    project,
  };
}

function newId(now: number): string {
  return now.toString(36) + Math.random().toString(36).slice(2, 6);
}

/** id가 있으면 고치고, 없으면 새로 넣어요. 새 링크는 맨 앞에 넣어요. */
export async function saveLink(env: Env, input: Record<string, unknown>, now = Date.now()) {
  const { items: series } = await readList<Series>(env, SERIES_FILE);
  const clean = cleanLink(input, series.map((s) => s.id), now);
  const editId = typeof input.id === "string" && input.id ? input.id : "";
  let saved: Link | null = null;
  const all = await modify<Link>(env, LINKS_FILE, "링크 모음", editId ? `링크 고치기: ${clean.title}` : `링크 추가: ${clean.title}`, (list) => {
    if (editId) {
      const i = list.findIndex((l) => l.id === editId);
      if (i < 0) throw new HttpError(404, "그 링크를 찾지 못했어요.");
      saved = { ...list[i], ...clean, id: editId };
      if (!clean.note) delete saved.note;
      if (!clean.project) delete saved.project;
      list[i] = saved;
      return list;
    }
    if (list.length >= MAX_LINKS) throw new HttpError(400, `링크는 ${MAX_LINKS}개까지 둘 수 있어요.`);
    if (list.some((l) => l.url === clean.url && (l.project || "") === (clean.project || ""))) {
      throw new HttpError(409, "이미 같은 곳에 넣은 링크예요.");
    }
    saved = { id: newId(now), ...clean, added: kstDate(now) };
    return [saved, ...list];
  });
  return { link: saved, all };
}

export async function deleteLink(env: Env, id: string) {
  if (!id) throw new HttpError(400, "지울 링크를 골라 주세요.");
  const all = await modify<Link>(env, LINKS_FILE, "링크 모음", `링크 지우기: ${id}`, (list) => {
    const next = list.filter((l) => l.id !== id);
    if (next.length === list.length) throw new HttpError(404, "그 링크를 찾지 못했어요.");
    return next;
  });
  return { deleted: id, all };
}

export async function getLinks(env: Env) {
  return (await readList<Link>(env, LINKS_FILE)).items;
}
