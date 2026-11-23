import { afterEach, describe, expect, it, vi } from "vitest";
import { parse as parseYaml } from "yaml";
import worker, { type Env } from "../src/index";
import { safeReturnPath, signSession, verifySession } from "../src/auth";
import { base64ToUtf8 } from "../src/github";
import { buildMarkdown, parseMarkdown, postPath, postStatus, postUrl, validateFields } from "../src/posts";

const SECRET = "x".repeat(40);
const env: Env = {
  BLOG_ORIGIN: "https://apapeisname.github.io",
  OWNER_GITHUB_ID: "1001",
  REPO_OWNER: "APapeIsName",
  REPO_NAME: "APapeIsName.github.io",
  REPO_BRANCH: "main",
  GITHUB_CLIENT_ID: "client-id",
  GITHUB_CLIENT_SECRET: "client-secret",
  SESSION_SECRET: SECRET,
  GITHUB_REPO_TOKEN: "repo-token",
};
const owner = () => signSession({ sub: "1001", login: "APapeIsName", avatar: "a", role: "owner" }, SECRET);
const guest = () => signSession({ sub: "2002", login: "someone", avatar: "b", role: "guest" }, SECRET);
const call = (path: string, init: RequestInit = {}) => worker.fetch(new Request(`https://api.example.dev${path}`, init), env);
const sample = {
  title: 'Malloc Lab 1차 "제출"',
  date: "2026-11-20",
  quest: "S2-a1b2c3",
  kind: "보스 회고",
  hours: 3.25,
  complete: true,
  recalled: false,
  goal: "명시적 가용 리스트를 설명할 수 있다",
  recall_note: "- 헤더/푸터\n- 경계 태그",
  gaps: "병합 조건을 빠뜨렸다",
  thoughts: "경계 태그가 생각보다 단순해서 재미있었다",
  body: "## 정리\n\n```c\nprintf(\"{{ not liquid }}\");\n```",
};

afterEach(() => vi.unstubAllGlobals());

describe("세션 토큰", () => {
  it("서명하고 다시 검증할 수 있어요", async () => {
    const s = await verifySession(await owner(), SECRET);
    expect(s?.sub).toBe("1001");
    expect(s?.role).toBe("owner");
  });
  it("내용을 바꾸면 검증에 실패해요", async () => {
    const [h, , sig] = (await guest()).split(".");
    const forged = Buffer.from(JSON.stringify({ sub: "1001", login: "x", avatar: "", role: "owner", iat: 0, exp: 9e9 })).toString("base64url");
    expect(await verifySession(`${h}.${forged}.${sig}`, SECRET)).toBeNull();
  });
  it("다른 키로 서명한 토큰은 거절해요", async () => {
    const t = await signSession({ sub: "1001", login: "x", avatar: "", role: "owner" }, "y".repeat(40));
    expect(await verifySession(t, SECRET)).toBeNull();
  });
  it("7일이 지나면 만료돼요", async () => {
    const t = await signSession({ sub: "1001", login: "x", avatar: "", role: "owner" }, SECRET, Date.UTC(2026, 0, 1));
    expect(await verifySession(t, SECRET, Date.UTC(2026, 0, 7))).not.toBeNull();
    expect(await verifySession(t, SECRET, Date.UTC(2026, 0, 9))).toBeNull();
  });
});

describe("로그인 뒤 돌아갈 경로", () => {
  it("블로그 안의 경로만 허용해요", () => {
    expect(safeReturnPath("/write/")).toBe("/write/");
    expect(safeReturnPath("/syllabus/#s2")).toBe("/syllabus/");
    expect(safeReturnPath("https://evil.example")).toBe("/");
    expect(safeReturnPath("//evil.example")).toBe("/");
    expect(safeReturnPath("/\\evil")).toBe("/");
    expect(safeReturnPath(null)).toBe("/");
  });
});

describe("리포트 파일", () => {
  it("머리말과 본문을 만들고 다시 읽을 수 있어요", () => {
    const f = validateFields(sample);
    const md = buildMarkdown(f);
    const fm = parseYaml(md.split("---")[1]);
    expect(fm.title).toBe(sample.title);
    expect(fm.hours).toBe(3.3);
    expect(fm.complete).toBe(true);
    expect(fm.recall_note).toBe(sample.recall_note);
    expect(md).toContain("{% raw %}\n## 정리");
    const back = parseMarkdown(md);
    expect(back.body).toBe(sample.body);
    expect(back.quest).toBe("S2-a1b2c3");
    expect(back.date).toBe("2026-11-20");
  });
  it("기존 블로그 글(raw 없이 쓴 글)도 읽어요", () => {
    const back = parseMarkdown("---\ntitle: 개강 리포트\ndate: 2026-11-14\nquest: S0-69fab2\ncomplete: true\ngoal: |\n  목표\n---\n\n## 왜\n\n본문");
    expect(back.title).toBe("개강 리포트");
    expect(back.goal).toBe("목표\n");
    expect(back.body).toBe("## 왜\n\n본문");
  });
  it("잘못된 입력은 한국어 메시지로 거절해요", () => {
    expect(() => validateFields({ ...sample, title: " " })).toThrow("제목을 입력해 주세요.");
    expect(() => validateFields({ ...sample, quest: "S2-zzz" })).toThrow("과제를 골라 주세요.");
    // 히든 던전(HS 서버, HF 프론트, HA AI)도 리포트를 낼 수 있어요.
    expect(validateFields({ ...sample, quest: "HS-18df5a" }).quest).toBe("HS-18df5a");
    expect(() => validateFields({ ...sample, quest: "HX-18df5a" })).toThrow("과제를 골라 주세요.");
    expect(() => validateFields({ ...sample, date: "2026-13-01" })).toThrow("제출일");
    expect(() => validateFields({ ...sample, hours: -1 })).toThrow("쓴 시간");
    expect(() => validateFields({ ...sample, body: "a {% endraw %} b" })).toThrow("endraw");
  });
  it("파일 이름은 날짜-과제-한국시간이고, 주소는 블로그 permalink와 같아요", () => {
    const f = validateFields(sample);
    const p = postPath(f, new Date("2026-11-20T06:31:00Z")); // 한국 15:31
    expect(p).toBe("_posts/2026-11-20-s2-a1b2c3-1531.md");
    expect(postUrl(env, p)).toBe("https://apapeisname.github.io/reports/2026/11/20/s2-a1b2c3-1531/");
  });
  it("공개 주소가 열리면 발행된 것으로 봐요", async () => {
    const ok = await postStatus(env, "_posts/2026-11-20-s2-a1b2c3-1531.md", (async () => new Response("", { status: 200 })) as typeof fetch);
    const wait = await postStatus(env, "_posts/2026-11-20-s2-a1b2c3-1531.md", (async () => new Response("", { status: 404 })) as typeof fetch);
    expect(ok.state).toBe("published");
    expect(wait.state).toBe("building");
  });
});

describe("API 권한", () => {
  it("상태 확인은 누구나 돼요", async () => {
    expect((await call("/api/health")).status).toBe(200);
  });
  it("토큰이 없으면 401", async () => {
    expect((await call("/api/me")).status).toBe(401);
    expect((await call("/api/posts", { method: "POST" })).status).toBe(401);
  });
  it("다른 계정은 로그인은 되지만 글쓰기는 403", async () => {
    const t = await guest();
    const me = await call("/api/me", { headers: { Authorization: `Bearer ${t}` } });
    expect(me.status).toBe(200);
    expect((await me.json()).role).toBe("guest");
    const res = await call("/api/posts", { method: "POST", headers: { Authorization: `Bearer ${t}` }, body: JSON.stringify(sample) });
    expect(res.status).toBe(403);
  });
  it("토큰에 owner라고 적혀 있어도 ID가 다르면 403", async () => {
    const t = await signSession({ sub: "2002", login: "someone", avatar: "", role: "owner" }, SECRET);
    expect((await call("/api/posts", { headers: { Authorization: `Bearer ${t}` } })).status).toBe(403);
  });
  it("주인은 발행할 수 있고, 저장소에 마크다운 파일을 커밋해요", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    vi.stubGlobal("fetch", async (url: string, init: RequestInit = {}) => {
      if (!init.method || init.method === "GET") return new Response("{}", { status: 404 }); // 양식 파일 없음 → 기본 필수 칸
      calls.push({ url, init });
      return new Response(JSON.stringify({ content: { sha: "s1" }, commit: { sha: "c1" } }), { status: 201 });
    });
    const res = await call("/api/posts", { method: "POST", headers: { Authorization: `Bearer ${await owner()}` }, body: JSON.stringify(sample) });
    expect(res.status).toBe(201);
    const out = await res.json();
    expect(out.path).toMatch(/^_posts\/2026-11-20-s2-a1b2c3-\d{4}\.md$/);
    expect(calls).toHaveLength(1); // 양식 읽기(GET)는 빼고 쓰기만 세요
    expect(calls[0].url).toContain("/repos/APapeIsName/APapeIsName.github.io/contents/_posts/2026-11-20-s2-a1b2c3-");
    expect(calls[0].init.method).toBe("PUT");
    const sent = JSON.parse(calls[0].init.body as string);
    expect(sent.branch).toBe("main");
    expect(base64ToUtf8(sent.content)).toContain('title: "Malloc Lab 1차 \\"제출\\""');
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe("Bearer repo-token");
  });
  it("CORS는 블로그 주소만 허용해요", async () => {
    const res = await call("/api/health");
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("https://apapeisname.github.io");
  });
  it("로그인 시작은 GitHub으로 보내고 state 쿠키를 남겨요", async () => {
    const res = await call("/auth/login?return=/write/");
    expect(res.status).toBe(302);
    const loc = new URL(res.headers.get("Location")!);
    expect(loc.host).toBe("github.com");
    expect(loc.searchParams.get("client_id")).toBe("client-id");
    expect(loc.searchParams.get("redirect_uri")).toBe("https://api.example.dev/auth/callback");
    expect(res.headers.get("Set-Cookie")).toMatch(/^oauth_state=.+HttpOnly; Secure/);
  });
  it("state가 맞지 않으면 로그인을 거절해요", async () => {
    const res = await call("/auth/callback?code=abc&state=forged", { headers: { Cookie: "oauth_state=real.Lw" } });
    expect(res.status).toBe(400);
  });
  it("콜백이 성공하면 역할이 담긴 토큰과 함께 블로그로 돌려보내요", async () => {
    vi.stubGlobal("fetch", async (url: string) => {
      if (url.includes("access_token")) return new Response(JSON.stringify({ access_token: "gh" }));
      return new Response(JSON.stringify({ id: 1001, login: "APapeIsName", avatar_url: "https://x" }));
    });
    const ret = Buffer.from("/write/").toString("base64url");
    const res = await call("/auth/callback?code=abc&state=st", { headers: { Cookie: `oauth_state=st.${ret}` } });
    expect(res.status).toBe(302);
    const loc = res.headers.get("Location")!;
    expect(loc.startsWith("https://apapeisname.github.io/write/#token=")).toBe(true);
    const s = await verifySession(loc.split("#token=")[1], SECRET);
    expect(s?.role).toBe("owner");
  });
});
