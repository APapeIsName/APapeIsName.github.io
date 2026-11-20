import type { Env } from "./env";
import { HttpError } from "./http";

/**
 * 리포트 인터뷰: 공부한 걸 이야기하듯 꺼내도록 묻고 공감하는 상담형 AI예요.
 * 지식은 가르치지 않아요. 대화가 끝나면 내가 한 말로 리포트 세 칸을 채워요.
 *
 *   mode "chat"   대화를 이어가요 → { reply }
 *   mode "draft"  지금까지 대화로 칸을 채워요 → { fields: { body, thoughts, sparks } }
 */

const API_URL = "https://api.anthropic.com/v1/messages";
const API_VERSION = "2023-06-01";
const DEFAULT_MODEL = "claude-haiku-5-5";
const MAX_TURNS = 60;
const MAX_CHARS = 4000;

export interface Turn {
  role: "user" | "assistant";
  content: string;
}
interface QuestInfo {
  title?: string;
  quest?: string;
  resource?: string;
}

const CHAT_SYSTEM = `너는 공부 기록 블로그 주인의 "리포트 인터뷰어"야. 상담하듯 따뜻하게 이야기를 들어 주는 역할이야.
이 사람은 시험이나 능력 평가를 위해서가 아니라, 지식을 얻는 재미 그 자체로 공부해. 리포트는 그 재미를 내 말로 남기는 자리야.

인터뷰는 이 흐름을 따라가:
1. 오늘은 어떤 내용을 공부했어요? (지식)
2. 그 내용들에 대해 어떻게 생각해요? (연결: 재미있던 점, 의외였던 점, 예전에 알던 것과 닮거나 다른 점)
3. 이번 학습을 통해 떠오른 게 있었나요? (호기심과 인출, 선택이라 없으면 넘어가)

지켜야 할 것:
- 한 번에 질문은 하나만. 짧게, 두세 문장 안으로 말해.
- 먼저 상대가 한 말에 공감하거나 그대로 비춰 준 다음, 더 꺼내 볼 수 있게 가볍게 물어. 캐묻거나 시험하지 마.
- 지식은 절대 가르치거나 설명하지 마. 개념이 맞는지 틀린지 판단하지도, 고쳐 주지도 마. 사실을 덧붙이지도 마.
- 상대가 지식을 물어보면 답하지 말고, 그 궁금증 자체에 공감한 뒤 직접 파 보도록 응원해. "그 궁금증, 지금 바로 파 보면 재미있겠어요" 같은 식으로. 리포트의 "떠오른 것"에 남길 수 있다고 알려 줘도 좋아.
- 칭찬은 과장하지 말고 구체적으로.
- 존댓말(해요체)로 말해. 마크다운 제목이나 목록은 쓰지 마.
- 세 가지를 다 들었으면 "이제 '칸에 정리해 넣기'를 누르면 이 대화로 리포트 칸을 채워 드릴게요"라고 알려 줘.`;

const DRAFT_SYSTEM = `너는 인터뷰 대화를 리포트 세 칸으로 옮겨 적는 정리 담당이야.
반드시 사용자(user)가 한 말만 써. 인터뷰어(assistant)의 말, 네가 아는 지식, 사용자가 하지 않은 해석은 넣지 마.
사용자의 표현과 말투를 최대한 그대로 살리고, 군더더기("음", "그러니까" 같은 것)와 반복만 다듬어.
- body: 오늘 공부한 내용. 사용자가 말한 대로. 여러 가지면 문단이나 "- " 목록으로 나눠도 돼.
- thoughts: 그 내용에 대한 사용자의 생각, 느낌, 예전에 알던 것과의 연결.
- sparks: 새로 생긴 궁금증이나 해 보고 싶어진 것. 사용자가 말하지 않았으면 빈 문자열.
사용자가 어떤 칸에 대해 아무 말도 하지 않았으면 그 칸은 빈 문자열로 둬.
JSON 객체 하나만 출력해: {"body": "...", "thoughts": "...", "sparks": "..."}`;

function cleanTurns(v: unknown): Turn[] {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) throw new HttpError(400, "대화 형식이 맞지 않아요.");
  if (v.length > MAX_TURNS) throw new HttpError(400, `대화가 너무 길어요 (${MAX_TURNS}개까지). 칸에 정리해 넣고 새로 시작해 주세요.`);
  return v.map((t, i) => {
    const r = t as Record<string, unknown>;
    if (!r || (r.role !== "user" && r.role !== "assistant") || typeof r.content !== "string") {
      throw new HttpError(400, `대화 ${i + 1}번째 형식이 맞지 않아요.`);
    }
    const content = r.content.trim().slice(0, MAX_CHARS);
    return { role: r.role as Turn["role"], content };
  }).filter((t) => t.content);
}

function questLine(q: QuestInfo): string {
  const parts = [];
  if (q.quest) parts.push(`과제: ${String(q.quest).slice(0, 200)}`);
  if (q.resource) parts.push(`자료: ${String(q.resource).slice(0, 200)}`);
  if (q.title) parts.push(`리포트 제목: ${String(q.title).slice(0, 200)}`);
  return parts.length ? `\n\n참고로 오늘 리포트의 과제 정보야 (대화 맥락으로만 써):\n${parts.join("\n")}` : "";
}

/** API는 user로 시작하고 user/assistant가 번갈아야 해요. 같은 쪽이 이어지면 합쳐요. */
export function toApiMessages(turns: Turn[], opener: string): Turn[] {
  const out: Turn[] = [{ role: "user", content: opener }];
  for (const t of turns) {
    const last = out[out.length - 1];
    if (last.role === t.role) last.content += "\n\n" + t.content;
    else out.push({ ...t });
  }
  return out;
}

async function callClaude(env: Env, system: string, messages: Turn[], maxTokens: number, fetcher: typeof fetch): Promise<string> {
  if (!env.ANTHROPIC_API_KEY) throw new HttpError(503, "AI 인터뷰를 쓰려면 Worker에 ANTHROPIC_API_KEY를 넣어 주세요.");
  const res = await fetcher(API_URL, {
    method: "POST",
    headers: { "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": API_VERSION, "content-type": "application/json" },
    body: JSON.stringify({ model: env.INTERVIEW_MODEL || DEFAULT_MODEL, max_tokens: maxTokens, system, messages }),
  });
  if (!res.ok) {
    let detail = "";
    try { detail = ((await res.json()) as { error?: { message?: string } }).error?.message || ""; } catch { /* 본문 없음 */ }
    if (res.status === 401) throw new HttpError(502, "AI 서버가 API 키를 거절했어요. ANTHROPIC_API_KEY를 확인해 주세요.");
    if (res.status === 429) throw new HttpError(503, "AI 서버가 잠시 바빠요. 조금 뒤에 다시 보내 주세요.");
    throw new HttpError(502, `AI 서버에서 답을 받지 못했어요 (${res.status}${detail ? `: ${detail}` : ""}).`);
  }
  const data = (await res.json()) as { content?: { type: string; text?: string }[] };
  const text = (data.content || []).filter((b) => b.type === "text").map((b) => b.text || "").join("").trim();
  if (!text) throw new HttpError(502, "AI 서버가 빈 답을 보냈어요. 다시 보내 주세요.");
  return text;
}

export function parseDraft(text: string): { body: string; thoughts: string; sparks: string } {
  const m = /\{[\s\S]*\}/.exec(text);
  if (!m) throw new HttpError(502, "대화를 칸으로 정리하지 못했어요. 한 번 더 눌러 주세요.");
  let obj: Record<string, unknown>;
  try { obj = JSON.parse(m[0]); } catch { throw new HttpError(502, "대화를 칸으로 정리하지 못했어요. 한 번 더 눌러 주세요."); }
  const s = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  return { body: s(obj.body), thoughts: s(obj.thoughts), sparks: s(obj.sparks) };
}

export async function interview(env: Env, input: Record<string, unknown>, fetcher: typeof fetch = fetch) {
  const turns = cleanTurns(input.messages);
  const quest = (input.quest && typeof input.quest === "object" ? input.quest : {}) as QuestInfo;
  if (input.mode === "draft") {
    if (!turns.some((t) => t.role === "user")) throw new HttpError(400, "아직 나눈 이야기가 없어요. 먼저 인터뷰에 답해 주세요.");
    const transcript = turns.map((t) => `${t.role === "user" ? "사용자" : "인터뷰어"}: ${t.content}`).join("\n\n");
    const text = await callClaude(env, DRAFT_SYSTEM, [{ role: "user", content: `인터뷰 대화:\n\n${transcript}` }], 2000, fetcher);
    return { fields: parseDraft(text) };
  }
  if (input.mode !== "chat") throw new HttpError(400, "mode는 chat이나 draft예요.");
  const opener = "(리포트 인터뷰를 시작해요. 인사하고 첫 질문을 해 주세요.)";
  const reply = await callClaude(env, CHAT_SYSTEM + questLine(quest), toApiMessages(turns, opener), 600, fetcher);
  return { reply };
}
