/** 생활 시간표: 서울 시간으로 지금 무엇을 하고 있을지 정해요. */

export type Activity = "sleep" | "wash" | "study" | "ready" | "work" | "rest";

export const ACTIVITY_KO: Record<Activity, string> = {
  sleep: "자는 중",
  wash: "씻는 중",
  study: "공부 중",
  ready: "출근 준비 중",
  work: "출근 중",
  rest: "쉬는 중",
};

const KST = 9 * 3600 * 1000;
type Slot = [number, Activity]; // [시작 분(0~1439), 활동] 다음 칸 시작 전까지

const m = (h: number, mm = 0) => h * 60 + mm;

/** 평일: 4:30 기상, 8:40 출근, 19:30 귀가, 20:30 취침 */
export const WEEKDAY: Slot[] = [
  [m(0), "sleep"],
  [m(4, 30), "wash"],
  [m(5), "study"],
  [m(8, 10), "ready"],
  [m(8, 40), "work"],
  [m(19, 30), "wash"],
  [m(20), "rest"],
  [m(20, 30), "sleep"],
];

/** 주말: 출근 대신 공부, 점심 무렵 쉬기 */
export const WEEKEND: Slot[] = [
  [m(0), "sleep"],
  [m(4, 30), "wash"],
  [m(5), "study"],
  [m(12), "rest"],
  [m(13, 30), "study"],
  [m(19, 30), "wash"],
  [m(20), "rest"],
  [m(20, 30), "sleep"],
];

export function activityAt(now: number): Activity {
  const d = new Date(now + KST);
  const minute = d.getUTCHours() * 60 + d.getUTCMinutes();
  const day = d.getUTCDay();
  const table = day === 0 || day === 6 ? WEEKEND : WEEKDAY;
  let cur: Activity = table[0][1];
  for (const [start, act] of table) if (minute >= start) cur = act;
  return cur;
}

/** 집에 있는지 */
export function isHome(a: Activity) {
  return a !== "work";
}
