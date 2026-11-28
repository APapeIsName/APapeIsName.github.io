/**
 * 사진 올리기: 리포트나 공부 노트에 넣을 사진(손으로 그린 노트, 화면 캡처)을 저장소 assets/uploads/연-월/ 에 올려요.
 * 크기는 브라우저에서 미리 줄여 보내요(가로 1600픽셀, WebP). 여기서는 형식과 크기만 다시 확인해요.
 */
import type { Env } from "./env";
import { putBinary } from "./github";
import { HttpError } from "./http";

export const UPLOAD_DIR = "assets/uploads";
export const MAX_BYTES = 5 * 1024 * 1024;
const TYPES: Record<string, string> = { "image/webp": "webp", "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif" };

/** 파일 머리의 서명으로 진짜 그 형식인지 봐요 (확장자나 type만 믿지 않아요). */
function sniff(b: Uint8Array): string | null {
  const at = (i: number, ...xs: number[]) => xs.every((x, k) => b[i + k] === x);
  if (at(0, 0x89, 0x50, 0x4e, 0x47)) return "image/png";
  if (at(0, 0xff, 0xd8, 0xff)) return "image/jpeg";
  if (at(0, 0x47, 0x49, 0x46, 0x38)) return "image/gif";
  if (at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50)) return "image/webp";
  return null;
}

/** 파일 이름을 주소에 쓰기 좋게: 영문, 숫자, 한글, 하이픈만 남겨요. */
export function slugName(name: unknown): string {
  const base = String(typeof name === "string" ? name : "").replace(/\.[a-z0-9]+$/i, "");
  const s = base.normalize("NFC").replace(/[^0-9A-Za-z가-힣]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40).toLowerCase();
  return s || "image";
}

export async function uploadImage(env: Env, input: Record<string, unknown>, now = Date.now()) {
  const data = typeof input.data === "string" ? input.data.replace(/^data:[^,]*,/, "") : "";
  if (!data) throw new HttpError(400, "올릴 사진이 없어요.");
  if (!/^[A-Za-z0-9+/]+=*$/.test(data)) throw new HttpError(400, "사진 데이터를 읽지 못했어요.");
  const bytes = Math.floor((data.length * 3) / 4) - (data.endsWith("==") ? 2 : data.endsWith("=") ? 1 : 0);
  if (bytes > MAX_BYTES) throw new HttpError(413, "사진이 너무 커요. 5MB까지 올릴 수 있어요.");
  const head = Uint8Array.from(atob(data.slice(0, 24)), (c) => c.charCodeAt(0));
  const type = sniff(head);
  if (!type || !TYPES[type]) throw new HttpError(415, "사진은 PNG, JPEG, WebP, GIF만 올릴 수 있어요.");
  const kst = new Date(now + 9 * 3600 * 1000).toISOString();
  const month = kst.slice(0, 7);
  const stamp = kst.slice(8, 10) + kst.slice(11, 13) + kst.slice(14, 16) + kst.slice(17, 19);
  const path = `${UPLOAD_DIR}/${month}/${slugName(input.name)}-${stamp}${Math.random().toString(36).slice(2, 5)}.${TYPES[type]}`;
  await putBinary(env, path, data, `사진 올림: ${path.split("/").pop()}`);
  return { path, url: `/${path}`, bytes, type };
}
