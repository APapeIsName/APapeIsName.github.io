import type { Env } from "./env";
import { handleCallback, handleLogin, requireOwner, requireUser } from "./auth";
import { HttpError, json, readJson, withCors } from "./http";
import { deletePost, getPost, listPosts, postStatus, publishPost, updatePost } from "./posts";
import { deleteNote, getNote, publishNote, updateNote } from "./notes";
import { deleteSeries, deleteTag, getTaxonomy, saveSeries, saveTag } from "./taxonomy";
import { getConditions, phaseOf, weatherLabel } from "./weather";
import { pickRandomEvent, renderScene, situation, type SceneEvents } from "./scene";
import { activityAt } from "./schedule";
import { getSignals } from "./activity";

/** 프로필 README 그림: 서울의 시간대와 날씨대로 그때그때 그려요. 누구나 볼 수 있어요. */
export async function sceneResponse(url: URL, now = Date.now(), fetcher: typeof fetch = fetch, env?: Env, roll: () => number = Math.random): Promise<Response> {
  const theme = url.searchParams.get("theme") === "dark" ? "dark" : "light";
  const [c, g] = await Promise.all([getConditions(now, fetcher), env ? getSignals(env, now, fetcher) : Promise.resolve(null)]);
  const month = new Date(now + 9 * 3600 * 1000).getUTCMonth() + 1;
  const phase = phaseOf(now, c?.sunrise ?? null, c?.sunset ?? null);
  const weather = c?.weather ?? "clear";
  const within = (t: number | null | undefined, min: number) => !!t && now - t >= -60000 && now - t < min * 60000;
  const events: SceneEvents = {
    commit: within(g?.commitAt, 30),
    post: within(g?.postAt, 60),
    merged: within(g?.mergedAt, 120),
    star: within(g?.starAt, 24 * 60),
    streak: g?.streak ?? 0,
  };
  const activity = activityAt(now);
  const shown = situation(activity, events).shown;
  const svg = renderScene({
    theme,
    phase,
    weather,
    label: c ? weatherLabel(c.code) : "날씨 모름",
    tempC: c?.tempC ?? null,
    now,
    month,
    activity,
    events,
    random: { kind: pickRandomEvent(shown, phase, weather, roll), offset: roll() * 40 },
  });
  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      // GitHub 이미지 프록시와 브라우저가 오래 저장하지 않게 해요. 시계가 맞으려면 매번 새로 받아야 해요.
      "Cache-Control": "no-cache, no-store, max-age=0, must-revalidate",
      Expires: "0",
    },
  });
}

export type { Env };

async function route(req: Request, env: Env, url: URL): Promise<Response> {
  const { pathname: p } = url;
  const m = req.method;

  if (p === "/api/health") return json({ ok: true });
  if (p === "/scene.svg" && m === "GET") return sceneResponse(url, Date.now(), fetch, env);

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
