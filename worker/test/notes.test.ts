import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parse as parseYaml } from "yaml";
import worker, { type Env } from "../src/index";
import { signSession } from "../src/auth";
import { base64ToUtf8, utf8ToBase64 } from "../src/github";
import { buildNote, notePath, noteUrl, parseNote, validateNote } from "../src/notes";
import { cleanSeries } from "../src/taxonomy";
import { isFilled, postStatus } from "../src/posts";

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
    expect(() => validateNote({ ...note, series: "토비" })).toThrow("프로젝트");
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
  it("한글 프로젝트 이름은 시간으로 주소 이름을 만들어요", () => {
    expect(cleanSeries({ title: "토비의 스프링 3.1" }, [], 1e12).id).toMatch(/^[a-z0-9-]+$/);
    expect(cleanSeries({ title: "Clean Code" }, ["clean-code"]).id).toBe("clean-code-2");
    expect(() => cleanSeries({ title: "x", id: "Bad Id" }, [])).toThrow("영어 소문자");
  });
});

describe("프로젝트와 태그 API", () => {
  it("손님은 못 만들어요", async () => {
    expect((await api("/api/series", "POST", { title: "x" }, guest)).status).toBe(403);
  });
  it("프로젝트를 만들고, 고치고, 지워요", async () => {
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
  it("프로젝트 칸(목표, 가치관, 할 일, 상태)을 저장하고, 일부만 고치면 나머지는 남아요", async () => {
    await api("/api/series", "POST", {
      create: true, id: "side-a", title: "사이드 A", goal: "  끝까지 만든다 ",
      values: "작게 자주\n\n직접 부딪혀 본다", status: "진행 중",
      todos: [{ text: "설계", done: true }, "구현", { text: "  " }],
    });
    let saved = parseYaml(repo.get("_data/series.yml")!.text)[0];
    expect(saved).toEqual({ id: "side-a", title: "사이드 A", status: "진행 중", goal: "끝까지 만든다", values: ["작게 자주", "직접 부딪혀 본다"], todos: [{ text: "설계", done: true }, { text: "구현" }] });
    await api("/api/series", "POST", { id: "side-a", todos: [{ text: "설계", done: true }, { text: "구현", done: true }] });
    saved = parseYaml(repo.get("_data/series.yml")!.text)[0];
    expect(saved.goal).toBe("끝까지 만든다");
    expect(saved.todos[1].done).toBe(true);
    await api("/api/series", "POST", { id: "side-a", goal: "", values: [] });
    saved = parseYaml(repo.get("_data/series.yml")!.text)[0];
    expect(saved.goal).toBeUndefined();
    expect(saved.values).toBeUndefined();
    expect((await api("/api/series", "POST", { id: "side-a", status: "대충" })).status).toBe(400);
    expect((await api("/api/series", "POST", { create: true, id: "cs", title: "x" })).status).toBe(400);
  });
  it("메인 프로젝트를 바꾸고, 메인을 지우면 CS 과정으로 돌아가요", async () => {
    expect((await (await api("/api/taxonomy")).json()).main).toBe("cs");
    expect((await api("/api/main", "POST", { id: "side-a" }, guest)).status).toBe(403);
    expect((await api("/api/main", "POST", { id: "nope" })).status).toBe(404);
    await api("/api/series", "POST", { create: true, id: "side-a", title: "사이드 A" });
    expect((await api("/api/main", "POST", { id: "side-a" })).status).toBe(200);
    expect(parseYaml(repo.get("_data/settings.yml")!.text)).toEqual({ main_project: "side-a" });
    expect((await (await api("/api/taxonomy")).json()).main).toBe("side-a");
    const r = await api("/api/series?id=side-a", "DELETE");
    expect((await r.json()).main).toBe("cs");
    expect(parseYaml(repo.get("_data/settings.yml")!.text).main_project).toBe("cs");
  });
  it("링크를 넣고 고치고 지워요 (프로젝트별, 제목 없으면 주소로)", async () => {
    expect((await api("/api/links", "POST", { url: "https://missing-semester-kr.github.io/" }, guest)).status).toBe(403);
    let r = await api("/api/links", "POST", { url: "https://missing-semester-kr.github.io/", project: "cs", note: "  시간 날 때 " });
    expect(r.status).toBe(200);
    const first = (await r.json()).link;
    expect(first).toMatchObject({ title: "missing-semester-kr.github.io", project: "cs", note: "시간 날 때" });
    expect(first.added).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect((await api("/api/links", "POST", { url: "https://missing-semester-kr.github.io/", project: "cs" })).status).toBe(409);
    expect((await api("/api/links", "POST", { url: "ftp://x.y" })).status).toBe(400);
    expect((await api("/api/links", "POST", { url: "https://a.b", project: "nope" })).status).toBe(400);
    await api("/api/series", "POST", { create: true, id: "shell", title: "쉘" });
    r = await api("/api/links", "POST", { url: "https://a.b/c/", title: "쉘 자료", project: "shell" });
    const second = (await r.json()).link;
    let saved = parseYaml(repo.get("_data/links.yml")!.text);
    expect(saved.map((l: { id: string }) => l.id)).toEqual([second.id, first.id]);
    await api("/api/links", "POST", { id: first.id, url: first.url, title: "Missing Semester 한국어", project: "cs" });
    saved = parseYaml(repo.get("_data/links.yml")!.text);
    expect(saved[1].title).toBe("Missing Semester 한국어");
    expect(saved[1].note).toBeUndefined();
    expect((await (await api("/api/taxonomy")).json()).links).toHaveLength(2);
    expect((await api(`/api/links?id=${second.id}`, "DELETE")).status).toBe(200);
    expect((await api(`/api/links?id=${second.id}`, "DELETE")).status).toBe(404);
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
  it("없는 프로젝트로는 못 써요", async () => {
    const r = await api("/api/notes", "POST", note);
    expect(r.status).toBe(400);
    expect((await r.json()).error).toContain("프로젝트를 먼저");
  });
  it("CS 과정(메인)에도 노트를 쓸 수 있고, 과제를 붙일 수 있어요", async () => {
    const r = await api("/api/notes", "POST", { ...note, series: "cs", quest: "S0-863670" });
    expect(r.status).toBe(201);
    const { path } = await r.json();
    expect(path).toMatch(/^_notes\/2026-11-16-cs-\d{4}\.md$/);
    expect(repo.get(path)!.text).toContain('quest: "S0-863670"');
    const got = await (await api(`/api/notes/item?path=${encodeURIComponent(path)}`)).json();
    expect(got.fields.quest).toBe("S0-863670");
    expect((await api("/api/notes", "POST", { ...note, series: "cs", quest: "아무거나" })).status).toBe(400);
    expect((await api("/api/notes", "POST", { ...note, title: "던전 노트", series: "cs", quest: "HA-83eed1" })).status).toBe(201);
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

describe("리포트 완성 기준", () => {
  const report = { title: "S1 리포트", date: "2026-11-16", quest: "S1-62a82f", kind: "과제 리포트", complete: true, recalled: true, body: "재귀와 반복", thoughts: "생각보다 재미있다" };
  const tpl = "sections:\n  - key: body\n    title: 오늘은 어떤 내용을 공부했어요?\n    required: true\n    recall: true\n  - key: thoughts\n    title: 그 내용들에 대해 어떻게 생각해요?\n    required: true\n  - key: sparks\n    title: 떠오른 것\n";
  it("옛 안내 문구는 빈 칸으로 쳐요", () => {
    expect(isFilled("(책을 덮고 떠올린 게임 규칙 5개를 여기에 그대로 적어보세요.)")).toBe(false);
    expect(isFilled("  ")).toBe(false);
    expect(isFilled("(괄호로 시작하지만) 내용이 있어요")).toBe(true);
  });
  it("필수 칸을 다 채우면 과제 클리어로 낼 수 있고, 새 칸이 파일에 남아요", async () => {
    repo.set("_data/report_template.yml", { text: tpl, sha: "t" });
    expect((await api("/api/posts", "POST", { ...report, sparks: "꼬리 재귀가 궁금" })).status).toBe(201);
    const saved = [...repo.entries()].find(([k]) => k.startsWith("_posts/"))![1].text;
    expect(saved).toContain('thoughts: "생각보다 재미있다"');
    expect(saved).toContain('sparks: "꼬리 재귀가 궁금"');
  });
  it("필수 칸이 비면 과제 클리어를 막아요", async () => {
    repo.set("_data/report_template.yml", { text: tpl, sha: "t" });
    const r = await api("/api/posts", "POST", { ...report, thoughts: "" });
    expect(r.status).toBe(400);
    expect((await r.json()).error).toContain("어떻게 생각해요");
  });
  it("과제 클리어를 안 찍으면 진행 중 리포트로 낼 수 있어요", async () => {
    repo.set("_data/report_template.yml", { text: tpl, sha: "t" });
    expect((await api("/api/posts", "POST", { ...report, complete: false, thoughts: "" })).status).toBe(201);
  });
  it("인출 OK는 양식의 recall 칸이 있어야 해요", async () => {
    repo.set("_data/report_template.yml", { text: tpl, sha: "t" });
    const r = await api("/api/posts", "POST", { ...report, complete: false, body: "" });
    expect(r.status).toBe(400);
    expect((await r.json()).error).toContain("인출 OK");
  });
  it("양식이 없으면 기본 칸(공부한 내용, 생각)을 써요", async () => {
    expect((await api("/api/posts", "POST", { ...report, thoughts: "" })).status).toBe(400);
    expect((await api("/api/posts", "POST", report)).status).toBe(201);
  });
});

import { dayMinutes, editCheckin, normalize, resetCheckinMemo, startCheckin } from "../src/checkins";
describe("출석부", () => {
  beforeEach(() => resetCheckinMemo());
  const T = Date.parse("2026-11-24T09:24:30+09:00");
  it("누구나 오늘 출석했는지 볼 수 있어요", async () => {
    const r = await worker.fetch(new Request("https://api.dev/api/status"), env);
    expect(r.status).toBe(200);
    expect((await r.json()).today).toBe(null);
  });
  it("손님은 출석하지 못해요", async () => {
    expect((await api("/api/checkins", "POST", { text: "OS 3장" }, guest)).status).toBe(403);
    expect((await api("/api/checkins/edit", "POST", { date: "2026-11-24", minutes: 30 }, guest)).status).toBe(403);
  });
  it("버튼 한 번이면 그날 출석이고, 두 번 눌러도 하루 하나예요", async () => {
    let d = await startCheckin(env, {}, T);
    expect(d.today).toEqual({ date: "2026-11-24", at: "09:24" });
    expect(commits.at(-1)).toBe("출석: 2026-11-24");
    d = await startCheckin(env, { text: "S1 1.1 읽기" }, T + 3600000);
    expect(d.today).toEqual({ date: "2026-11-24", at: "09:24", text: "S1 1.1 읽기" });
    expect(parseYaml(repo.get("_data/checkins.yml")!.text).filter((c: { date: string }) => c.date === "2026-11-24")).toHaveLength(1);
  });
  it("얼마나 했는지는 나중에 적고, 빈 값을 보내면 지워요", async () => {
    await startCheckin(env, {}, T);
    let d = await editCheckin(env, { date: "2026-11-24", minutes: 150, note: "셸 강의 2강까지" }, T + 10 * 3600000);
    expect(d.today).toMatchObject({ minutes: 150, note: "셸 강의 2강까지" });
    d = await editCheckin(env, { date: "2026-11-24", note: "" }, T + 10 * 3600000);
    expect(d.today!.note).toBeUndefined();
    expect(d.today!.minutes).toBe(150);
    await expect(editCheckin(env, { date: "2026-11-24", minutes: 2000 }, T)).rejects.toThrow("24시간");
    await expect(editCheckin(env, { date: "2026-11-01", minutes: 30 }, T)).rejects.toThrow("출석 기록이 없어요");
    const r = await api("/api/checkins?date=2026-11-24", "DELETE");
    expect(r.status).toBe(200);
  });
  it("공부한 시간은 몇 시부터 몇 시까지로, 하루에 여러 번 적어요", async () => {
    await startCheckin(env, {}, T);
    await editCheckin(env, { date: "2026-11-24", minutes: 60 }, T);
    const d = await editCheckin(env, { date: "2026-11-24", sessions: [{ from: "20:00", to: "22:30" }, { from: "09:30", to: "11:00" }] }, T);
    expect(d.today!.sessions).toEqual([{ from: "09:30", to: "11:00" }, { from: "20:00", to: "22:30" }]); // 시간 순으로
    expect(d.today!.minutes).toBeUndefined(); // 예전 방식의 분은 지워요
    expect(dayMinutes(d.today!)).toBe(240);
    // 자정을 넘긴 시간대
    const n = await editCheckin(env, { date: "2026-11-24", sessions: [{ from: "23:00", to: "01:00" }] }, T);
    expect(dayMinutes(n.today!)).toBe(120);
    await expect(editCheckin(env, { date: "2026-11-24", sessions: [{ from: "10:00", to: "12:00" }, { from: "11:00", to: "13:00" }] }, T)).rejects.toThrow("겹쳐요");
    await expect(editCheckin(env, { date: "2026-11-24", sessions: [{ from: "9:00", to: "10:00" }] }, T)).rejects.toThrow("13:00");
    await expect(editCheckin(env, { date: "2026-11-24", sessions: [{ from: "10:00", to: "10:00" }] }, T)).rejects.toThrow("같아요");
    const cleared = await editCheckin(env, { date: "2026-11-24", sessions: [] }, T);
    expect(cleared.today!.sessions).toBeUndefined();
  });
  it("예전 기록(시작, 끝)은 하루 하나로 합치고, 끝내기를 잊은 긴 기록은 시간을 비워요", () => {
    const list = normalize([
      { id: "a", kind: "공부", text: "Missing Semester", start: "2026-11-20T16:28:15+09:00", end: "2026-11-20T20:45:47+09:00", note: "셸 다음엔 Git" },
      { id: "b", kind: "공부", text: "셸", start: "2026-11-22T20:22:04+09:00", end: "2026-11-23T21:24:40+09:00" },
      { id: "c", kind: "공부", text: "한 번 더", start: "2026-11-20T21:00:00+09:00", end: "2026-11-20T21:30:00+09:00" },
    ]);
    expect(list).toEqual([
      { date: "2026-11-20", at: "16:28", text: "Missing Semester", sessions: [{ from: "16:28", to: "20:45" }, { from: "21:00", to: "21:30" }], note: "셸 다음엔 Git" },
      { date: "2026-11-22", at: "20:22", text: "셸" },
    ]);
    expect(dayMinutes(list[0])).toBe(257 + 30);
  });
});

describe("사진 올리기", () => {
  // 1x1 PNG
  const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
  it("주인만, 진짜 사진만 올리고 assets/uploads/연-월/ 에 저장해요", async () => {
    expect((await api("/api/uploads", "POST", { name: "x.png", data: PNG }, guest)).status).toBe(403);
    const r = await api("/api/uploads", "POST", { name: "프로세스 그림 1.png", data: "data:image/png;base64," + PNG });
    expect(r.status).toBe(201);
    const j = await r.json();
    expect(j.path).toMatch(/^assets\/uploads\/\d{4}-\d{2}\/프로세스-그림-1-\d{8}[a-z0-9]{3}\.png$/);
    expect(j.url).toBe("/" + j.path);
    expect(repo.has(j.path)).toBe(true);
    expect(commits.at(-1)).toMatch(/^사진 올림: /);
  });
  it("사진이 아니거나 너무 크면 거절해요", async () => {
    expect((await api("/api/uploads", "POST", { name: "a.txt", data: btoa("hello, not an image") })).status).toBe(415);
    expect((await api("/api/uploads", "POST", { name: "a.png", data: "!!!" })).status).toBe(400);
    expect((await api("/api/uploads", "POST", { name: "big.png", data: PNG.slice(0, 20) + "A".repeat(7 * 1024 * 1024) })).status).toBe(413);
  });
});
