import type { Env } from "./env";
import { HttpError } from "./http";

const API = "https://api.github.com";
const enc = new TextEncoder();
const dec = new TextDecoder();

export function utf8ToBase64(text: string): string {
  const bytes = enc.encode(text);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
export function base64ToUtf8(b64: string): string {
  const bin = atob(b64.replace(/\s/g, ""));
  return dec.decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

function contentsUrl(env: Env, path: string): string {
  const p = path.split("/").map(encodeURIComponent).join("/");
  return `${API}/repos/${env.REPO_OWNER}/${env.REPO_NAME}/contents/${p}`;
}

async function gh<T>(env: Env, url: string, init: RequestInit = {}): Promise<T> {
  if (!env.GITHUB_REPO_TOKEN) throw new HttpError(500, "GITHUB_REPO_TOKEN이 설정되지 않았어요.");
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${env.GITHUB_REPO_TOKEN}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "cs-study-api",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
    },
  });
  if (!res.ok) {
    const detail = await res.text();
    if (res.status === 404) throw new HttpError(404, "저장소에서 파일을 찾지 못했어요.", detail);
    if (res.status === 409 || res.status === 422) throw new HttpError(409, "저장소의 파일이 그사이 바뀌었어요. 새로고침한 뒤 다시 시도해 주세요.", detail);
    if (res.status === 401 || res.status === 403) throw new HttpError(502, "저장소 토큰이 없거나 권한이 부족해요. GITHUB_REPO_TOKEN을 확인해 주세요.", detail);
    throw new HttpError(502, `GitHub API 오류가 났어요 (${res.status}).`, detail);
  }
  return (await res.json()) as T;
}

export interface RepoFile {
  path: string;
  sha: string;
  text: string;
}

export async function getFile(env: Env, path: string): Promise<RepoFile> {
  const r = await gh<{ path: string; sha: string; content: string }>(env, `${contentsUrl(env, path)}?ref=${encodeURIComponent(env.REPO_BRANCH)}`);
  return { path: r.path, sha: r.sha, text: base64ToUtf8(r.content) };
}

export async function putFile(env: Env, path: string, text: string, message: string, sha?: string): Promise<{ sha: string; commit: string }> {
  const r = await gh<{ content: { sha: string }; commit: { sha: string } }>(env, contentsUrl(env, path), {
    method: "PUT",
    body: JSON.stringify({ message, content: utf8ToBase64(text), branch: env.REPO_BRANCH, ...(sha ? { sha } : {}) }),
  });
  return { sha: r.content.sha, commit: r.commit.sha };
}

/** 사진처럼 글자가 아닌 파일을 그대로(base64) 올려요. */
export async function putBinary(env: Env, path: string, base64: string, message: string): Promise<{ sha: string; commit: string }> {
  const r = await gh<{ content: { sha: string }; commit: { sha: string } }>(env, contentsUrl(env, path), {
    method: "PUT",
    body: JSON.stringify({ message, content: base64, branch: env.REPO_BRANCH }),
  });
  return { sha: r.content.sha, commit: r.commit.sha };
}

export async function deleteFile(env: Env, path: string, sha: string, message: string): Promise<void> {
  await gh(env, contentsUrl(env, path), {
    method: "DELETE",
    body: JSON.stringify({ message, sha, branch: env.REPO_BRANCH }),
  });
}

export async function listDir(env: Env, path: string): Promise<{ name: string; path: string; sha: string; type: string }[]> {
  try {
    return await gh(env, `${contentsUrl(env, path)}?ref=${encodeURIComponent(env.REPO_BRANCH)}`);
  } catch (e) {
    if (e instanceof HttpError && e.status === 404) return [];
    throw e;
  }
}
