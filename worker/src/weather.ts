/** 서울의 지금 날씨와 시간대. 날씨는 Open-Meteo(무료, 키 없음, CC BY 4.0)에서 가져와요. */

export type Weather = "clear" | "partly" | "cloudy" | "fog" | "drizzle" | "rain" | "snow" | "thunder";
export type Phase = "dawn" | "day" | "dusk" | "night";

export interface Conditions {
  weather: Weather;
  code: number;
  tempC: number | null;
  sunrise: number | null; // epoch ms
  sunset: number | null;
  fetchedAt: number;
}

export const SEOUL = { lat: 37.5665, lon: 126.978 };
const TTL = 20 * 60 * 1000;
const KST = 9 * 3600 * 1000;

/** WMO 날씨 코드를 그림에서 쓰는 날씨로 바꿔요. */
export function weatherOf(code: number): Weather {
  if (code === 0) return "clear";
  if (code === 1 || code === 2) return "partly";
  if (code === 3) return "cloudy";
  if (code === 45 || code === 48) return "fog";
  if (code >= 51 && code <= 57) return "drizzle";
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return "rain";
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "snow";
  if (code >= 95) return "thunder";
  return "cloudy";
}

export function weatherLabel(code: number): string {
  if (code === 0) return "맑음";
  if (code === 1) return "구름 조금";
  if (code === 2) return "구름 많음";
  if (code === 3) return "흐림";
  if (code === 45 || code === 48) return "안개";
  if (code === 56 || code === 57 || code === 66 || code === 67) return "어는 비";
  if (code >= 51 && code <= 55) return "이슬비";
  if (code >= 80 && code <= 82) return "소나기";
  if (code >= 61 && code <= 65) return "비";
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "눈";
  if (code >= 95) return "뇌우";
  return "흐림";
}

/** 해 뜨고 지는 시각 앞뒤로 새벽/노을을 둬요. 해 시각을 모르면 한국 시간으로 어림해요. */
export function phaseOf(now: number, sunrise: number | null, sunset: number | null): Phase {
  if (sunrise && sunset) {
    const m = 60 * 1000;
    if (now >= sunrise - 50 * m && now < sunrise + 40 * m) return "dawn";
    if (now >= sunset - 50 * m && now < sunset + 40 * m) return "dusk";
    if (now >= sunrise + 40 * m && now < sunset - 50 * m) return "day";
    return "night";
  }
  const h = new Date(now + KST).getUTCHours();
  if (h >= 5 && h < 7) return "dawn";
  if (h >= 7 && h < 17) return "day";
  if (h >= 17 && h < 19) return "dusk";
  return "night";
}

/** "2026-11-16T07:05" (서울 시간)을 epoch ms로 */
function kstToEpoch(s: unknown): number | null {
  if (typeof s !== "string") return null;
  const t = Date.parse(s + ":00Z");
  return Number.isNaN(t) ? null : t - KST;
}

let memo: Conditions | null = null;

export async function getConditions(now = Date.now(), fetcher: typeof fetch = fetch): Promise<Conditions | null> {
  if (memo && now - memo.fetchedAt < TTL) return memo;
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${SEOUL.lat}&longitude=${SEOUL.lon}&current=temperature_2m,weather_code,is_day&daily=sunrise,sunset&timezone=Asia%2FSeoul&forecast_days=1`;
  try {
    const res = await fetcher(url, { headers: { "User-Agent": "cs-study-api (profile scene)" }, cf: { cacheTtl: 900, cacheEverything: true } } as RequestInit);
    if (!res.ok) throw new Error(String(res.status));
    const d = (await res.json()) as {
      current?: { temperature_2m?: number; weather_code?: number };
      daily?: { sunrise?: string[]; sunset?: string[] };
    };
    const code = Number(d.current?.weather_code ?? 3);
    memo = {
      weather: weatherOf(code),
      code,
      tempC: typeof d.current?.temperature_2m === "number" ? d.current.temperature_2m : null,
      sunrise: kstToEpoch(d.daily?.sunrise?.[0]),
      sunset: kstToEpoch(d.daily?.sunset?.[0]),
      fetchedAt: now,
    };
    return memo;
  } catch {
    // 날씨를 못 가져오면 예전 값을 쓰고, 그것도 없으면 시간만 반영해요.
    return memo;
  }
}

/** 테스트용 */
export function resetWeatherMemo() {
  memo = null;
}
