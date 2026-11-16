import type { Env } from "./env";
import { handleCallback, handleLogin, requireOwner, requireUser } from "./auth";
import { HttpError, json, readJson, withCors } from "./http";
import { deletePost, getPost, listPosts, postStatus, publishPost, updatePost } from "./posts";
import { deleteNote, getNote, publishNote, updateNote } from "./notes";
import { deleteSeries, deleteTag, getTaxonomy, saveSeries, saveTag } from "./taxonomy";

export type { Env };

async function route(req: Request, env: Env, url: URL): Promise<Response> {
  const { pathname: p } = url;
  const m = req.method;

  if (p === "/api/health") return json({ ok: true });

  // 로그인: 누구나
  if (p === "/auth/login" && m === "GET") return handleLogin(env, url);
  if (p === "/auth/callback" && m === "GET") return handleCallback(env, req, url);

  if (p === "/api/me" && m === "GET") {
    const s = await requireUser(req, env);
    const owner = !!env.OWNER_GITHUB_ID && s.sub === String(env.OWNER_GITHUB_ID);
    return json({ id: s.sub, login: s.login, avatar: s.avatar, role: owner ? "owner" : "guest" });
  }

  // 리포트: 주인만
  if (p === "/api/posts") {
    await requireOwner(req, env);
    if (m === "GET") return json(await listPosts(env));
    if (m === "POST") return json(await publishPost(env, await readJson(req)), 201);
  }
  if (p === "/api/posts/item") {
    await requireOwner(req, env);
    const path = url.searchParams.get("path") || "";
    if (m === "GET") return json(await getPost(env, path));
    if (m === "PUT") return json(await updatePost(env, path, await readJson(req)));
    if (m === "DELETE") return json(await deletePost(env, path, url.searchParams.get("sha")));
  }
  if (p === "/api/posts/status" && m === "GET") {
    await requireOwner(req, env);
    return json(await postStatus(env, url.searchParams.get("path") || ""));
  }

  // 공부 노트: 주인만
  if (p === "/api/notes" && m === "POST") {
    await requireOwner(req, env);
    return json(await publishNote(env, await readJson(req)), 201);
  }
  if (p === "/api/notes/item") {
    await requireOwner(req, env);
    const path = url.searchParams.get("path") || "";
    if (m === "GET") return json(await getNote(env, path));
    if (m === "PUT") return json(await updateNote(env, path, await readJson(req)));
    if (m === "DELETE") return json(await deleteNote(env, path, url.searchParams.get("sha")));
  }

  // 시리즈와 태그: 주인만
  if (p === "/api/taxonomy" && m === "GET") {
    await requireOwner(req, env);
    return json(await getTaxonomy(env));
  }
  if (p === "/api/series") {
    await requireOwner(req, env);
    if (m === "POST") return json(await saveSeries(env, await readJson(req)));
    if (m === "DELETE") return json(await deleteSeries(env, url.searchParams.get("id") || ""));
  }
  if (p === "/api/tags") {
    await requireOwner(req, env);
    if (m === "POST") return json(await saveTag(env, await readJson(req)));
    if (m === "DELETE") return json(await deleteTag(env, url.searchParams.get("name") || ""));
  }

  throw new HttpError(404, "없는 주소예요.");
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    if (req.method === "OPTIONS") return withCors(env, new Response(null, { status: 204 }));
    const url = new URL(req.url);
    try {
      return withCors(env, await route(req, env, url));
    } catch (e) {
      if (e instanceof HttpError) {
        if (e.detail) console.warn(e.status, e.message, e.detail.slice(0, 500));
        return withCors(env, json({ error: e.message }, e.status));
      }
      console.error(e);
      return withCors(env, json({ error: "서버에서 오류가 났어요." }, 500));
    }
  },
};
