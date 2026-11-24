import type { Env } from "./env";
import { handleCallback, handleLogin, requireOwner, requireUser } from "./auth";
import { HttpError, json, readJson, withCors } from "./http";
import { interview } from "./interview";
import { deleteLink, saveLink } from "./links";

/** 배포할 때마다 바뀌는 건 아니고, 기능이 크게 바뀔 때 올려요. /api/health 에 보여요. */
export const VERSION = "2026-11-20 리포트 인터뷰";
import { deletePost, getPost, listPosts, postStatus, publishPost, updatePost } from "./posts";
import { deleteNote, getNote, publishNote, updateNote } from "./notes";
import { deleteSeries, deleteTag, getTaxonomy, saveSeries, saveTag, setMain } from "./taxonomy";
import { getConditions, phaseOf, weatherLabel } from "./weather";
import { pickRandomEvent, renderScene, situation, type SceneEvents } from "./scene";
import { activityAt } from "./schedule";
import { getSignals } from "./activity";
import { deleteCheckin, editCheckin, getStatus, startCheckin } from "./checkins";

/** 블로그 로파이 플레이어용: 서울의 시간대와 날씨, 생활 시간표, 출석 상태 */
export async function nowState(env: Env, now = Date.now(), fetcher: typeof fetch = fetch) {
  const c = await getConditions(now, fetcher);
  let checkin = false;
  try { checkin = !!(await getStatus(env, now)).current; } catch { /* 출석 기록을 못 읽어도 음악은 나와요 */ }
  return {
    phase: phaseOf(now, c?.sunrise ?? null, c?.sunset ?? null),
    weather: c?.weather ?? "clear",
    label: c ? weatherLabel(c.code) : null,
    tempC: c?.tempC ?? null,
    activity: activityAt(now),
    checkin,
  };
}

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

  // 배포된 버전과 켜진 기능을 브라우저에서 바로 볼 수 있어요. 비밀값 자체는 절대 보여주지 않아요.
  if (p === "/api/health") return json({ ok: true, version: VERSION, interview: !!env.ANTHROPIC_API_KEY });
  if (p === "/scene.svg" && m === "GET") return sceneResponse(url, Date.now(), fetch, env);
  if (p === "/api/now" && m === "GET") return json(await nowState(env));

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

  // 출석부: 보는 건 누구나, 출석과 공부 시간 적기는 주인만
  if (p === "/api/status" && m === "GET") return json(await getStatus(env));
  if (p === "/api/checkins" && m === "POST") {
    await requireOwner(req, env);
    return json(await startCheckin(env, await readJson(req)), 201);
  }
  if (p === "/api/checkins/edit" && m === "POST") {
    await requireOwner(req, env);
    return json(await editCheckin(env, await readJson(req)));
  }
  if (p === "/api/checkins" && m === "DELETE") {
    await requireOwner(req, env);
    return json(await deleteCheckin(env, url.searchParams.get("date") || ""));
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
  if (p === "/api/links") {
    await requireOwner(req, env);
    if (m === "POST") return json(await saveLink(env, await readJson(req)));
    if (m === "DELETE") return json(await deleteLink(env, url.searchParams.get("id") || ""));
  }
  if (p === "/api/interview" && m === "POST") {
    await requireOwner(req, env);
    return json(await interview(env, await readJson(req)));
  }
  if (p === "/api/main" && m === "POST") {
    await requireOwner(req, env);
    return json(await setMain(env, await readJson(req)));
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
