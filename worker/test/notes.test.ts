import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parse as parseYaml } from "yaml";
import worker, { type Env } from "../src/index";
import { signSession } from "../src/auth";
import { base64ToUtf8, utf8ToBase64 } from "../src/github";
import { buildNote, notePath, noteUrl, parseNote, validateNote } from "../src/notes";
import { cleanSeries } from "../src/taxonomy";
import { postStatus } from "../src/posts";

const SECRET = "x".repeat(40);
const env: Env = {
  BLOG_ORIGIN: "https://apapeisname.github.io", OWNER_GITHUB_ID: "1001", REPO_OWNER: "o", REPO_NAME: "r", REPO_BRANCH: "main",
  GITHUB_CLIENT_ID: "c", GITHUB_CLIENT_SECRET: "s", SESSION_SECRET: SECRET, GITHUB_REPO_TOKEN: "t",
};
const owner = () => signSession({ sub: "1001", login: "o", avatar: "", role: "owner" }, SECRET);
const guest = () => signSession({ sub: "2", login: "g", avatar: "", role: "guest" }, SECRET);

/** 메모리 속 가짜 저장소. GitHub Contents API처럼 sha가 맞아야 덮어써요. */
let repo: Map<string, { text: string; sha: string }>;
let commits: string[];
function fakeGitHub() {
  let n = 0;
  vi.stubGlobal("fetch", async (url: string, init: RequestInit = {}) => {
    const path = decodeURIComponent(new URL(url).pathname.replace("/repos/o/r/contents/", ""));
    const f = repo.get(path);
    const method = init.method || "GET";
    if (method === "GET") {
      if (!f) return new Response("{}", { status: 404 });
      return new Response(JSON.stringify({ path, sha: f.sha, content: utf8ToBase64(f.text) }));
    }
    const body = JSON.parse(init.body as string);
    if ((f && body.sha !== f.sha) || (!f && body.sha)) return new Response("{}", { status: 409 });
    if (method === "DELETE") { repo.delete(path); commits.push(body.message); return new Response("{}"); }
    const sha = `sha${++n}`;
    repo.set(path, { text: base64ToUtf8(body.content), sha });
    commits.push(body.message);
    return new Response(JSON.stringify({ content: { sha }, commit: { sha: "c" } }), { status: f ? 200 : 201 });
  });
}
const api = async (path: string, method = "GET", body?: unknown, who = owner) =>
  worker.fetch(new Request(`https://api.dev${path}`, { method, headers: { Authorization: `Bearer ${await who()}` }, body: body ? JSON.stringify(body) : undefined }), env);

beforeEach(() => { repo = new Map(); commits = []; fakeGitHub(); });
afterEach(() => vi.unstubAllGlobals());

const note = { title: "토비의 스프링 1장: 오브젝트와 의존관계", date: "2026-11-16", series: "toby-spring", tags: ["Spring", "DI", "spring"], hours: 1.5, summary: "DAO를 리팩터링하며 IoC를 이해했다", body: "## 관심사 분리\n\n`{{ not liquid }}`" };

describe("노트 형식", () => {
  it("검사하고, 파일로 만들고, 다시 읽으면 같아요", () => {
    const f = validateNote(note);
    expect(f.tags).toEqual(["Spring", "DI"]); // 대소문자만 다른 태그는 하나로
    const back = parseNote(buildNote(f));
    expect(back).toEqual(f);
    expect(buildNote(f)).toContain("{% raw %}");
  });
  it("잘못된 값을 막아요", () => {
    expect(() => validateNote({ ...note, title: "" })).toThrow("제목");
    expect(() => validateNote({ ...note, series: "토비" })).toThrow("시리즈");
    expect(() => validateNote({ ...note, tags: ["a,b"] })).toThrow("쉼표");
    expect(() => validateNote({ ...note, tags: Array.from({ length: 11 }, (_, i) => `t${i}`) })).toThrow("10개");
    expect(() => validateNote({ ...note, body: "x {% endraw %}" })).toThrow();
  });
  it("경로와 주소", () => {
    const p = notePath(validateNote(note), new Date(Date.UTC(2026, 10, 16, 5, 30)));
    expect(p).toBe("_notes/2026-11-16-toby-spring-1430.md");
    expect(noteUrl(env, p)).toBe("https://apapeisname.github.io/notes/2026/11/16/toby-spring-1430/");
    expect(notePath(validateNote({ ...note, series: "" }), new Date(Date.UTC(2026, 10, 16, 5, 30)))).toBe("_notes/2026-11-16-note-1430.md");
  });
  it("발행 확인은 노트 주소도 봐요", async () => {
    const r = await postStatus(env, "_notes/2026-11-16-note-1430.md", (async () => new Response("", { status: 200 })) as typeof fetch);
    expect(r.state).toBe("published");
    expect(r.url).toContain("/notes/2026/11/16/note-1430/");
  });
  it("한글 시리즈 이름은 시간으로 주소 이름을 만들어요", () => {
    expect(cleanSeries({ title: "토비의 스프링 3.1" }, [], 1e12).id).toMatch(/^[a-z0-9-]+$/);
    expect(cleanSeries({ title: "Clean Code" }, ["clean-code"]).id).toBe("clean-code-2");
    expect(() => cleanSeries({ title: "x", id: "Bad Id" }, [])).toThrow("영어 소문자");
  });
});

describe("시리즈와 태그 API", () => {
  it("손님은 못 만들어요", async () => {
    expect((await api("/api/series", "POST", { title: "x" }, guest)).status).toBe(403);
  });
  it("시리즈를 만들고, 고치고, 지워요", async () => {
    let r = await api("/api/series", "POST", { create: true, title: "토비의 스프링", id: "toby-spring", description: "3.1" });
    expect(r.status).toBe(200);
    expect(parseYaml(repo.get("_data/series.yml")!.text)).toEqual([{ id: "toby-spring", title: "토비의 스프링", description: "3.1" }]);
    expect((await api("/api/series", "POST", { create: true, title: "다른", id: "toby-spring" })).status).toBe(409);
    r = await api("/api/series", "POST", { id: "toby-spring", title: "토비의 스프링 3.1", link: "https://example.com" });
    expect((await r.json()).series.title).toBe("토비의 스프링 3.1");
    expect((await api("/api/series", "POST", { id: "nope", title: "x" })).status).toBe(404);
    r = await api("/api/taxonomy");
    expect((await r.json()).series[0].link).toBe("https://example.com");
    expect((await api("/api/series?id=toby-spring", "DELETE")).status).toBe(200);
    expect(parseYaml(repo.get("_data/series.yml")!.text)).toEqual([]);
  });
  it("태그를 만들고 설명을 고치고 지워요", async () => {
    await api("/api/tags", "POST", { create: true, name: "JUnit" });
    expect((await api("/api/tags", "POST", { create: true, name: "junit" })).status).toBe(409);
    await api("/api/tags", "POST", { name: "JUnit", description: "자바 테스트" });
    expect(parseYaml(repo.get("_data/tags.yml")!.text)).toEqual([{ name: "JUnit", description: "자바 테스트" }]);
    expect((await api("/api/tags?name=JUnit", "DELETE")).status).toBe(200);
  });
});

describe("노트 API", () => {
  it("없는 시리즈로는 못 써요", async () => {
    const r = await api("/api/notes", "POST", note);
    expect(r.status).toBe(400);
    expect((await r.json()).error).toContain("시리즈를 먼저");
  });
  it("쓰면 새 태그가 목록에 더해지고, 고치고 지울 수 있어요", async () => {
    await api("/api/series", "POST", { create: true, id: "toby-spring", title: "토비의 스프링" });
    await api("/api/tags", "POST", { create: true, name: "Spring" });
    const r = await api("/api/notes", "POST", note);
    expect(r.status).toBe(201);
    const { path } = await r.json();
    expect(path).toMatch(/^_notes\/2026-11-16-toby-spring-\d{4}\.md$/);
    expect(parseYaml(repo.get("_data/tags.yml")!.text).map((t: { name: string }) => t.name)).toEqual(["Spring", "DI"]);
    const got = await (await api(`/api/notes/item?path=${encodeURIComponent(path)}`)).json();
    expect(got.fields.title).toBe(note.title);
    const n = commits.length;
    const put = await api(`/api/notes/item?path=${encodeURIComponent(path)}`, "PUT", { ...got.fields, title: "고친 제목", sha: got.sha });
    expect(put.status).toBe(200);
    expect(commits.length).toBe(n + 1); // 태그가 그대로면 태그 파일은 안 건드려요
    expect((await api(`/api/notes/item?path=${encodeURIComponent(path)}`, "PUT", { ...got.fields, sha: got.sha })).status).toBe(409);
    const fresh = await (await api(`/api/notes/item?path=${encodeURIComponent(path)}`)).json();
    expect((await api(`/api/notes/item?path=${encodeURIComponent(path)}&sha=${fresh.sha}`, "DELETE")).status).toBe(200);
    expect(repo.has(path)).toBe(false);
  });
  it("노트 경로가 아니면 거절해요", async () => {
    expect((await api("/api/notes/item?path=_config.yml")).status).toBe(400);
    expect((await api("/api/notes/item?path=" + encodeURIComponent("_notes/../_config.md"))).status).toBe(400);
  });
});
