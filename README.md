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

## 2. 리포트 쓰기 (세 가지 방법, 결과는 모두 같은 md 파일)

### 방법 A. 브라우저에서 노션처럼 쓰기: Pages CMS (추천)

1. https://app.pagescms.org 에 들어가 GitHub으로 로그인해요.
2. 이 저장소를 고르면(처음엔 GitHub 앱 설치를 물어봐요) 왼쪽에 **과제 리포트** 메뉴가 생겨요.
3. **새로 만들기** → 과제를 드롭다운에서 고르고, 학습 목표 / 백지 인출 결과 / 정리 / 못 떠올린 것 / 막힌 점 / 다음에 할 일을 채워요. 정리 칸은 서식 편집기라 굵게, 목록, 코드 블록, 이미지를 그대로 쓸 수 있어요.
4. **저장**하면 저장소에 커밋되고, 1~2분 뒤 사이트에 올라가요.

어떤 칸이 보일지는 `.pages.yml`에서 정해요.

### 방법 B. github.com에서 바로 쓰기

저장소의 `_posts` 폴더에서 **Add file → Create new file**을 눌러 `2026-11-20-S2-xxxxxx-1.md`처럼 이름을 짓고, `_drafts/report-template.md` 내용을 붙여 넣어 채워요. 과제 id는 `_data/quests.csv`의 `id` 열에 있어요.

### 방법 C. 내 편집기로 쓰고 푸시하기

VS Code, Obsidian, Typora 등으로 `_posts`에 md 파일을 만들고 커밋, 푸시하면 돼요. 형식은 방법 B와 같아요.

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
| `assets/` | 스타일, 스크립트, 픽셀 폰트 |

## 폰트

픽셀 폰트는 이민서 님의 [갈무리](https://github.com/quiple/galmuri)를 SIL Open Font License 1.1에 따라 함께 배포해요. 라이선스 전문은 `assets/fonts/Galmuri-OFL.txt`에 있어요.
