# CS 기본기 독학 과정

1년짜리 CS 독학 과정을 대학 강의처럼 기록하는 블로그예요. GitHub Pages(Jekyll)로 돌아가고, 따로 서버나 빌드 도구가 필요 없어요.

- **대시보드**: 시즌 지도, 지금 할 과제 3개, 학생증(레벨, XP, 배지), 출석부
- **계획서**: 시즌별 참고 강의와 교재, 과제 목록, 제출 여부
- **리포트**: 과제마다 낸 리포트. "이 과제를 끝냈어요"를 체크하면 진도에 바로 반영돼요.
- 라이트/다크 모드 (시스템 설정을 따르고, 오른쪽 위 버튼으로 바꿀 수 있어요)

---

## 1. 처음 한 번: 배포하기

1. GitHub에서 새 저장소를 만들어요.
   - 이름을 `내아이디.github.io`로 하면 주소가 `https://내아이디.github.io`가 돼요. (추천)
   - 다른 이름(예: `cs-study`)으로 하면 주소가 `https://내아이디.github.io/cs-study`가 되고, `_config.yml`의 `baseurl`을 `"/cs-study"`로 바꿔야 해요.
2. 이 폴더를 저장소에 올려요. `.pages.yml`처럼 점으로 시작하는 파일도 꼭 같이 올라가야 해서, 웹 업로드보다 git이 확실해요.
   ```bash
   cd cs-study-blog
   git init -b main
   git add .
   git commit -m "개강"
   git remote add origin https://github.com/내아이디/내아이디.github.io.git
   git push -u origin main
   ```
3. 저장소의 **Settings → Pages**에서 Source를 **Deploy from a branch**, 브랜치를 **main / (root)**로 저장해요.
4. 1~2분 뒤 주소로 들어가면 사이트가 떠요. 이후로는 푸시할 때마다 자동으로 다시 만들어져요.
5. `_config.yml`에서 `student`(이름), `course_start`(개강일), `weekly_hours`(주당 공부 시간)를 내 것으로 바꿔요.

## 블로그 구성

- **홈**: 최근 글(공부 노트와 과제 리포트), 메인 프로젝트 카드, 사이드 프로젝트, 태그, 공부 잔디
- **프로젝트** (`/projects/`, 하나씩은 `/project/?id=`): 메인 프로젝트 하나와 사이드 프로젝트 여러 개. 프로젝트는 `_data/series.yml`의 항목이고(= 시리즈), 가치관(`values`), 목표(`goal`), 상태(`status`: 진행 중, 잠시 쉼, 끝남), 할 일(`todos`)을 가져요. 노트의 `series`가 프로젝트 id면 그 프로젝트의 글이에요. 메인은 `_data/settings.yml`의 `main_project`이고, `cs`는 CS 기본기 독학 과정이에요. 메인이 홈 카드와 GitHub 프로필 진도 카드에 크게 보여요.
- **공부 노트** (`/notes/`, 파일은 `_notes/`): 과제와 상관없이 배운 것을 적는 기술 블로그 글. 시리즈(`_data/series.yml`)와 태그(`_data/tags.yml`)로 묶어요. `?series=toby-spring`, `?tag=Spring`처럼 걸러 볼 수 있어요.
- **CS 과정** (`/course/`): 대시보드, 계획서, 리포트, 게임 규칙, 과정 소개
- **출석 체크** (홈의 '지금' 카드, `/checkins/` 출석부): 공부를 시작할 때 한 마디로 출석하고, 끝나면 마무리 한 마디와 함께 상황 종료. 기록은 `_data/checkins.yml`에 쌓이고 공부 잔디에도 들어가요.
- **로파이 플레이어** (모든 페이지 오른쪽 아래): 음원 파일 없이 브라우저에서 합성해요. 서울의 시간대와 날씨, 생활 시간표, 출석 상태에 따라 템포와 분위기(빗소리, 바람)가 바뀌고, 16마디마다 화음 진행과 피아노 음색이 바뀌어요. 페이지를 옮기면 아무 곳이나 한 번 누를 때 이어서 나와요. 플레이어의 '로파이/유튜브' 버튼으로 `_config.yml`의 `bgm_youtube` 영상을 유튜브 공식 플레이어로 틀 수도 있어요. 코드는 `assets/js/lofi.js`.
- **글쓰기** (주인만): `/write/note/`는 공부 노트, `/write/`는 과제 리포트, `/manage/`는 시리즈와 태그 관리

## 2. 리포트 쓰기 (네 가지 방법, 결과는 모두 같은 md 파일)

### 방법 A. 블로그에서 바로 쓰기 (추천)

머리말의 **로그인**으로 GitHub 로그인을 하면, 블로그 주인 계정에만 **글쓰기** 메뉴가 생겨요. `/write/` 화면은 리포트 모양 그대로 칸을 채우는 방식이고, **제출하기**를 누르면 1~2분 뒤 블로그에 올라가요. 쓰는 동안 이 브라우저에 임시 저장되고, 리포트 아래 **이 리포트 고치기**로 다시 고치거나 지울 수 있어요.

다른 GitHub 계정도 로그인은 되지만 글쓰기는 막혀 있어요. 권한 검사는 서버에서 해요.

처음 한 번 글쓰기 서버(Cloudflare Worker)를 띄워야 해요. 순서는 [`worker/README.md`](worker/README.md)에 있어요. `_config.yml`의 `api_base`가 비어 있으면 로그인 버튼이 숨겨져요.

### 방법 B. 브라우저에서 노션처럼 쓰기: Pages CMS

1. https://app.pagescms.org 에 들어가 GitHub으로 로그인해요.
2. 이 저장소를 고르면(처음엔 GitHub 앱 설치를 물어봐요) 왼쪽에 **과제 리포트** 메뉴가 생겨요.
3. **새로 만들기** → 과제를 드롭다운에서 고르고, "오늘은 어떤 내용을 공부했어요?", "그 내용들에 대해 어떻게 생각해요?", "이번 학습을 통해 떠오른 게 있었나요?(선택)"를 채워요. 정리 칸은 서식 편집기라 굵게, 목록, 코드 블록, 이미지를 그대로 쓸 수 있어요.
4. **저장**하면 저장소에 커밋되고, 1~2분 뒤 사이트에 올라가요.

어떤 칸이 보일지는 `.pages.yml`에서 정해요.

### 방법 C. github.com에서 바로 쓰기

저장소의 `_posts` 폴더에서 **Add file → Create new file**을 눌러 `2026-11-20-S2-xxxxxx-1.md`처럼 이름을 짓고, `_drafts/report-template.md` 내용을 붙여 넣어 채워요. 과제 id는 `_data/quests.csv`의 `id` 열에 있어요.

### 방법 D. 내 편집기로 쓰고 푸시하기

VS Code, Obsidian, Typora 등으로 `_posts`에 md 파일을 만들고 커밋, 푸시하면 돼요. 형식은 방법 C와 같아요.

## 주차는 어떻게 정해지나요

대학 강의처럼 개강일부터 1주차, 2주차...로 나눠요. 메인, 보스, 복습 과제를 `weekly_hours`(주당 공부 시간)만큼씩 채워 나가고, 시즌은 항상 새 주차에서 시작해요. 사이드 과제는 주차에 넣지 않고 '선택 과제'로 따로 모아요.

- 대시보드의 **N주차 강의**에 이번 주 과제와 지난 주차에서 밀린 과제가 나와요.
- 계획서는 시즌 안에서 주차별로 묶여 있고, 이번 주가 노랗게 표시돼요.
- 학습 시트의 '주차' 열도 같은 계산이라, 시트에서 주당 공부 시간(E7)을 바꾸면 `_config.yml`의 `weekly_hours`도 같이 바꿔 주세요.

## 3. 시트의 진도를 사이트에 반영하기 (선택)

리포트에서 "이 과제를 끝냈어요"를 체크하면 시트를 건드리지 않아도 진도가 올라가요. 시트에서만 체크한 과제도 반영하고 싶을 때만 아래처럼 해요.

1. 학습 시트의 **퀘스트** 탭을 CSV로 내려받아요.
2. 터미널에서:
   ```bash
   python3 scripts/sync_quests.py ~/Downloads/퀘스트.csv
   git add _data/quests.csv .pages.yml && git commit -m "진도 반영" && git push
   ```

과제는 시트나 리포트 중 한쪽에서라도 완료면 완료로 잡혀요.

시트에서 과제 이름을 고치면 그 과제의 id가 바뀌어요. 이미 그 과제로 낸 리포트가 있다면 리포트의 `quest` 값도 새 id로 고쳐 주세요.

## 4. 내 컴퓨터에서 미리 보기 (선택)

```bash
bundle install
bundle exec jekyll serve
# http://localhost:4000
```

## 파일 구성

| 경로 | 내용 |
|---|---|
| `_config.yml` | 이름, 개강일, 주당 공부 시간, 배포 주소 |
| `_data/quests.csv` | 과제 목록 (시트에서 동기화) |
| `_data/seasons.yml` | 시즌별 과목명, 참고 강의, 교재 |
| `_posts/` | 리포트 |
| `.pages.yml` | 브라우저 편집기(Pages CMS) 설정 |
| `scripts/sync_quests.py` | 시트 CSV → 과제 목록 동기화 |
| `write.html` | 블로그 안 글쓰기 화면 (`assets/js/write.js`, 로그인은 `assets/js/auth.js`) |
| `worker/` | 로그인과 발행을 맡는 Cloudflare Worker (Jekyll 빌드에서는 빠져요) |
| `assets/lib/` | 미리보기용 marked(MIT), DOMPurify(Apache-2.0/MPL-2.0) |
| `assets/` | 스타일, 스크립트, 픽셀 폰트 |

## 폰트

픽셀 폰트는 이민서 님의 [갈무리](https://github.com/quiple/galmuri)를 SIL Open Font License 1.1에 따라 함께 배포해요. 라이선스 전문은 `assets/fonts/Galmuri-OFL.txt`에 있어요.
