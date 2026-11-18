"""GitHub 프로필 진도 카드(_includes/progress-card.svg)에 넣는 픽셀 글꼴을 만들어요.

자주 쓰는 한글 2,350자(KS X 1001)와 영어, 숫자, 기호만 남겨서 base64로 넣어요.
프로젝트 이름이나 할 일에 어떤 글자를 써도 대부분 픽셀 글꼴로 보여요.
드문 글자(예: 똠, 쓩)는 보는 사람 컴퓨터의 기본 글꼴로 보일 수 있어요.

    python3 scripts/make_progress_font.py
"""
import base64
import io
import pathlib

from fontTools import subset

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "assets/fonts/Galmuri11.woff2"
OUT = ROOT / "_includes/progress-font.css"


def charset() -> str:
    chars = set(chr(c) for c in range(0x20, 0x7F))
    for b1 in range(0xB0, 0xC9):
        for b2 in range(0xA1, 0xFF):
            try:
                chars.add(bytes([b1, b2]).decode("euc-kr"))
            except UnicodeDecodeError:
                pass
    chars |= set("·…“”‘’→←↑↓★☆♪✓%°×")
    # 데이터 파일에 이미 쓴 글자도 빠짐없이 넣어요
    for p in [ROOT / "_config.yml", *sorted((ROOT / "_data").glob("*.yml")), *sorted((ROOT / "_data").glob("*.csv"))]:
        chars |= set(p.read_text(encoding="utf-8"))
    return "".join(c for c in chars if c.isprintable())


def main() -> None:
    opts = subset.Options()
    opts.flavor = "woff2"
    opts.layout_features = []
    opts.name_IDs = ["*"]
    font = subset.load_font(str(SRC), opts)
    sub = subset.Subsetter(opts)
    sub.populate(text=charset())
    sub.subset(font)
    buf = io.BytesIO()
    font.flavor = "woff2"
    font.save(buf)
    b64 = base64.b64encode(buf.getvalue()).decode()
    OUT.write_text("@font-face{font-family:'Px';src:url(data:font/woff2;base64," + b64 + ") format('woff2')}", encoding="utf-8")
    print(f"{OUT.relative_to(ROOT)}: {len(b64) // 1024}KB")


if __name__ == "__main__":
    main()
