import { afterEach, describe, expect, it, vi } from "vitest";
import worker, { type Env } from "../src/index";
import { signSession } from "../src/auth";
import { interview, parseDraft, toApiMessages } from "../src/interview";

const SECRET = "x".repeat(40);
const env: Env = {
  BLOG_ORIGIN: "https://apapeisname.github.io", OWNER_GITHUB_ID: "1001", REPO_OWNER: "o", REPO_NAME: "r", REPO_BRANCH: "main",
  GITHUB_CLIENT_ID: "c", GITHUB_CLIENT_SECRET: "s", SESSION_SECRET: SECRET, GITHUB_REPO_TOKEN: "t", ANTHROPIC_API_KEY: "sk-test",
};
const call = async (body: unknown, who: "owner" | "guest", e: Env = env) => {
  const t = await signSession({ sub: who === "owner" ? "1001" : "2002", login: "x", avatar: "", role: who }, SECRET);
  return worker.fetch(new Request("https://api.example.dev/api/interview", { method: "POST", headers: { Authorization: `Bearer ${t}` }, body: JSON.stringify(body) }), e);
};
const claudeSays = (text: string, seen: { url: string; body: any; headers: any }[] = []) =>
  (async (url: string, init: RequestInit = {}) => {
    seen.push({ url, body: JSON.parse(String(init.body)), headers: init.headers });
    return new Response(JSON.stringify({ content: [{ type: "text", text }] }), { status: 200 });
  }) as unknown as typeof fetch;

afterEach(() => vi.unstubAllGlobals());

describe("리포트 인터뷰", () => {
  it("주인만 쓸 수 있어요", async () => {
    vi.stubGlobal("fetch", claudeSays("안녕하세요"));
    expect((await call({ mode: "chat", messages: [] }, "guest")).status).toBe(403);
    const r = await call({ mode: "chat", messages: [] }, "owner");
    expect(r.status).toBe(200);
    expect((await r.json()).reply).toBe("안녕하세요");
  });
  it("API 키가 없으면 503으로 알려요", async () => {
    const r = await call({ mode: "chat", messages: [] }, "owner", { ...env, ANTHROPIC_API_KEY: undefined });
    expect(r.status).toBe(503);
    expect((await r.json()).error).toContain("ANTHROPIC_API_KEY");
  });
  it("대화를 user로 시작해 번갈아 보내고, 과제 정보와 지식을 가르치지 말라는 지시를 넣어요", async () => {
    const seen: { url: string; body: any; headers: any }[] = [];
    await interview(env, { mode: "chat", quest: { quest: "SICP 1.1", resource: "SICP" }, messages: [
      { role: "assistant", content: "오늘은 어떤 내용을 공부했어요?" }, { role: "user", content: "재귀" }, { role: "user", content: "그리고 반복" },
    ] }, claudeSays("좋아요", seen));
    const b = seen[0].body;
    expect(seen[0].url).toBe("https://api.anthropic.com/v1/messages");
    expect(seen[0].headers["x-api-key"]).toBe("sk-test");
    expect(b.model).toBe("claude-haiku-5-5");
    expect(b.messages.map((m: any) => m.role)).toEqual(["user", "assistant", "user"]);
    expect(b.messages[2].content).toBe("재귀\n\n그리고 반복");
    expect(b.system).toContain("가르치거나 설명하지 마");
    expect(b.system).toContain("SICP 1.1");
  });
  it("정리하기는 사용자 말만으로 세 칸을 돌려줘요", async () => {
    const seen: { url: string; body: any; headers: any }[] = [];
    const out = await interview(env, { mode: "draft", messages: [{ role: "assistant", content: "무엇을?" }, { role: "user", content: "재귀를 배웠어요" }] },
      claudeSays('정리했어요\n{"body": "재귀를 배웠어요", "thoughts": "", "sparks": ""}', seen));
    expect(out).toEqual({ fields: { body: "재귀를 배웠어요", thoughts: "", sparks: "" } });
    expect(seen[0].body.system).toContain("사용자(user)가 한 말만");
    await expect(interview(env, { mode: "draft", messages: [{ role: "assistant", content: "무엇을?" }] }, claudeSays("{}"))).rejects.toThrow("나눈 이야기");
  });
  it("형식이 틀리거나 너무 길면 막아요", async () => {
    await expect(interview(env, { mode: "chat", messages: [{ role: "system", content: "x" }] }, claudeSays(""))).rejects.toThrow("형식");
    await expect(interview(env, { mode: "chat", messages: Array(61).fill({ role: "user", content: "a" }) }, claudeSays(""))).rejects.toThrow("너무 길어요");
    await expect(interview(env, { mode: "x" }, claudeSays(""))).rejects.toThrow("mode");
    expect(() => parseDraft("JSON 없음")).toThrow("정리하지 못했어요");
  });
  it("AI 서버 오류를 알아듣게 바꿔요", async () => {
    const bad = (async () => new Response(JSON.stringify({ error: { message: "invalid x-api-key" } }), { status: 401 })) as unknown as typeof fetch;
    await expect(interview(env, { mode: "chat", messages: [] }, bad)).rejects.toThrow("API 키를 거절");
  });
  it("같은 쪽 말이 이어지면 합쳐요", () => {
    expect(toApiMessages([{ role: "user", content: "a" }], "시작")).toEqual([{ role: "user", content: "시작\n\na" }]);
  });
});
