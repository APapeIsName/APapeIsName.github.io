/** GitHub 공개 활동에서 그림에 얹을 사건을 찾아요. 몇 분씩 모아서 확인해요. */
import type { Env } from "./env";

export interface GitHubSignals {
  commitAt: number | null; // 마지막 커밋 푸시 (블로그 글 커밋 제외)
  postAt: number | null; // 블로그에 노트나 리포트를 올린 때
  mergedAt: number | null; // PR 머지
  starAt: number | null; // 블로그 저장소에 스타가 달린 때
  streak: number; // 오늘(또는 어제)까지 연속으로 푸시한 날 수
  fetchedAt: number;
}

const TTL = 4 * 60 * 1000;
const KST = 9 * 3600 * 1000;
let memo: GitHubSignals | null = null;

interface GhEvent {
  type: string;
  created_at: string;
  repo?: { name?: string };
  payload?: { action?: string; commits?: { message?: string }[]; pull_request?: { merged?: boolean } };
}

const dayKey = (t: number) => new Date(t + KST).toISOString().slice(0, 10);

/** 연속 활동 일수: 오늘 했으면 오늘부터, 안 했으면 어제부터 거꾸로 세요. */
export function streakOf(days: Set<string>, now: number): number {
  let t = now;
  if (!days.has(dayKey(t))) t -= 86400000;
  let n = 0;
  while (days.has(dayKey(t))) { n++; t -= 86400000; }
  return n;
}

export function signalsFrom(events: GhEvent[], stars: { starred_at?: string }[], now: number): GitHubSignals {
  let commitAt: number | null = null, postAt: number | null = null, mergedAt: number | null = null;
  const days = new Set<string>();
  for (const e of events) {
    const t = Date.parse(e.created_at);
    if (Number.isNaN(t)) continue;
    if (e.type === "PushEvent") {
      days.add(dayKey(t));
      const msgs = (e.payload?.commits || []).map((c) => c.message || "");
      if (msgs.length > 0 && msgs.every((msg) => /^(출석|상황 종료|출석 기록)/.test(msg))) continue; // 출석 체크는 커밋으로 치지 않아요
      const isPost = msgs.length > 0 && msgs.every((msg) => /^(노트|리포트|시리즈|태그|새 태그)/.test(msg));
      if (isPost) postAt = Math.max(postAt ?? 0, t);
      else commitAt = Math.max(commitAt ?? 0, t);
    } else if (e.type === "PullRequestEvent" && e.payload?.action === "closed" && e.payload.pull_request?.merged) {
      mergedAt = Math.max(mergedAt ?? 0, t);
    }
  }
  let starAt: number | null = null;
  for (const s of stars) {
    const t = Date.parse(s.starred_at || "");
    if (!Number.isNaN(t)) starAt = Math.max(starAt ?? 0, t);
  }
  return { commitAt, postAt, mergedAt, starAt, streak: streakOf(days, now), fetchedAt: now };
}

export async function getSignals(env: Env, now = Date.now(), fetcher: typeof fetch = fetch): Promise<GitHubSignals | null> {
  if (memo && now - memo.fetchedAt < TTL) return memo;
  const headers: Record<string, string> = { Accept: "application/vnd.github+json", "User-Agent": "cs-study-api" };
  if (env.GITHUB_REPO_TOKEN) headers.Authorization = `Bearer ${env.GITHUB_REPO_TOKEN}`;
  try {
    const [er, sr] = await Promise.all([
      fetcher(`https://api.github.com/users/${env.REPO_OWNER}/events/public?per_page=100`, { headers }),
      fetcher(`https://api.github.com/repos/${env.REPO_OWNER}/${env.REPO_NAME}/stargazers?per_page=100`, { headers: { ...headers, Accept: "application/vnd.github.star+json" } }),
    ]);
    const events = er.ok ? ((await er.json()) as GhEvent[]) : [];
    const stars = sr.ok ? ((await sr.json()) as { starred_at?: string }[]) : [];
    if (!er.ok && memo) return memo;
    memo = signalsFrom(Array.isArray(events) ? events : [], Array.isArray(stars) ? stars : [], now);
    return memo;
  } catch {
    return memo;
  }
}

export function resetSignalsMemo() {
  memo = null;
}
