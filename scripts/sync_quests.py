#!/usr/bin/env python3
"""시트(퀘스트 탭)에서 내려받은 CSV로 사이트의 과제 목록을 갱신해요.

사용법:
    python3 scripts/sync_quests.py ~/Downloads/퀘스트.csv

하는 일:
  1. CSV에서 '완료'로 시작하는 헤더 행을 찾아 그 아래 행만 읽어요(위쪽 요약 칸은 건너뜀).
  2. _data/quests.csv를 영어 열 이름으로 다시 써요. 각 과제에는 고정 id가 붙어요.
     id는 '시즌 코드 + 시즌·과제 이름의 해시'라서, 시트에서 행 순서를 바꿔도 그대로예요.
     (과제 이름을 고치면 id가 바뀌니, 그 과제에 이미 낸 리포트의 quest 값도 고쳐야 해요.)
  3. .pages.yml의 과제 드롭다운 목록을 새 목록으로 바꿔요.

인자 없이 실행하면 지금 _data/quests.csv를 다시 읽어 id와 드롭다운만 새로 맞춰요.
"""
import csv
import hashlib
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "_data" / "quests.csv"
PAGES = ROOT / ".pages.yml"

HEADER_MAP = {
    "완료": "done", "인출": "recalled", "시즌": "season", "종류": "type",
    "퀘스트": "quest", "인출 방법": "recall", "자료": "resource",
    "예상(h)": "hours", "완료일": "date",
}
COLUMNS = ["id", "done", "recalled", "season", "type", "quest",
           "recall", "resource", "hours", "date"]


def to_bool(value: str) -> str:
    return "TRUE" if str(value).strip().lower() in {"true", "1", "y", "yes", "o", "✓", "✔"} else "FALSE"


def to_date(value: str) -> str:
    m = re.search(r"(\d{4})\D+(\d{1,2})\D+(\d{1,2})", str(value or ""))
    return f"{m.group(1)}-{int(m.group(2)):02d}-{int(m.group(3)):02d}" if m else ""


def quest_id(season: str, quest: str) -> str:
    code = season.split()[0] if season.strip() else "S?"
    digest = hashlib.sha1(f"{season.strip()}|{quest.strip()}".encode("utf-8")).hexdigest()[:6]
    return f"{code}-{digest}"


def read_rows(path: Path):
    with path.open(encoding="utf-8-sig", newline="") as f:
        rows = list(csv.reader(f))
    for i, row in enumerate(rows):
        first = (row[0] if row else "").strip()
        if first in ("완료", "done", "id"):
            header = [h.strip() for h in row]
            keys = [HEADER_MAP.get(h, h) for h in header]
            out = []
            for raw in rows[i + 1:]:
                rec = {k: (raw[j].strip() if j < len(raw) else "") for j, k in enumerate(keys)}
                if rec.get("quest"):
                    out.append(rec)
            return out
    sys.exit("헤더 행('완료' 또는 'done'으로 시작)을 찾지 못했어요. 시트의 '퀘스트' 탭을 CSV로 내려받았는지 확인해 주세요.")


def write_data(records):
    seen = set()
    with DATA.open("w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(COLUMNS)
        for r in records:
            qid = quest_id(r.get("season", ""), r["quest"])
            if qid in seen:
                sys.exit(f"같은 시즌에 이름이 같은 과제가 둘 있어요: {r['season']} / {r['quest']}")
            seen.add(qid)
            hours = r.get("hours", "").replace(",", "")
            w.writerow([qid, to_bool(r.get("done")), to_bool(r.get("recalled")),
                        r.get("season", ""), r.get("type", ""), r["quest"],
                        r.get("recall", ""), r.get("resource", ""), hours,
                        to_date(r.get("date", ""))])
            r["id"] = qid
    return records


def yaml_str(s: str) -> str:
    return '"' + s.replace("\\", "\\\\").replace('"', '\\"') + '"'


def update_pages_yml(records):
    if not PAGES.exists():
        return
    text = PAGES.read_text(encoding="utf-8")
    start, end = "# >>> quests", "# <<< quests"
    if start not in text or end not in text:
        print(".pages.yml에서 과제 목록 표시(# >>> quests)를 찾지 못해 건너뛰었어요.")
        return
    indent = re.search(r"\n([ \t]*)" + re.escape(start), text).group(1)
    lines = [f"{indent}{start}"]
    for r in records:
        code = r["season"].split()[0] if r.get("season") else ""
        label = f"[{code}] {r['quest']}"
        lines.append(f"{indent}- name: {yaml_str(r['id'])}")
        lines.append(f"{indent}  label: {yaml_str(label)}")
    lines.append(f"{indent}{end}")
    pattern = re.compile(r"[ \t]*" + re.escape(start) + r".*?" + re.escape(end), re.S)
    PAGES.write_text(pattern.sub(lambda _: "\n".join(lines), text, count=1), encoding="utf-8")


def main():
    src = Path(sys.argv[1]).expanduser() if len(sys.argv) > 1 else DATA
    records = write_data(read_rows(src))
    update_pages_yml(records)
    done = sum(1 for r in records if to_bool(r.get("done")) == "TRUE")
    print(f"과제 {len(records)}개를 반영했어요 (완료 {done}개). 이제 커밋하고 푸시하면 사이트에 반영돼요.")


if __name__ == "__main__":
    main()
