# 학습 블로그 API (Cloudflare Worker)

블로그에서 GitHub으로 로그인하고, 블로그 안에서 쓴 리포트를 저장소에 커밋(발행)해 주는 작은 서버예요.
누구나 로그인할 수 있지만 글쓰기 API는 `OWNER_GITHUB_ID` 계정만 쓸 수 있어요.

## 처음 한 번: 설정하기 (약 20분)

### 1. 내 GitHub 숫자 ID 확인
브라우저에서 https://api.github.com/users/APapeIsName 을 열고 `"id"` 값을 적어 두세요.
`wrangler.toml`의 `OWNER_GITHUB_ID`에 넣어요. (아이디는 바꿀 수 있지만 숫자 ID는 바뀌지 않아서 이걸로 주인을 판별해요.)

### 2. Cloudflare 가입과 로그인
1. https://dash.cloudflare.com 에서 무료로 가입해요.
2. 터미널에서:
   ```bash
   cd worker
   npm install
   npx wrangler login
   ```

### 3. 일단 한 번 배포해서 주소 받기
```bash
npx wrangler deploy
```
`https://cs-study-api.<내 서브도메인>.workers.dev` 같은 주소가 나와요. 이게 API 주소예요.

### 4. GitHub OAuth App 만들기 (로그인용)
GitHub → Settings → Developer settings → OAuth Apps → **New OAuth App**
- Application name: `CS 학습 블로그`
- Homepage URL: `https://apapeisname.github.io`
- Authorization callback URL: `https://cs-study-api.<내 서브도메인>.workers.dev/auth/callback`

만든 뒤 **Client ID**를 `wrangler.toml`의 `GITHUB_CLIENT_ID`에 넣고, **Generate a new client secret**으로 만든 값은 다음 단계에서 비밀값으로 넣어요.

### 5. 저장소 전용 토큰 만들기 (발행용)
GitHub → Settings → Developer settings → Personal access tokens → **Fine-grained tokens** → Generate new token
- Repository access: **Only select repositories** → 블로그 저장소 하나만
- Permissions → Repository permissions → **Contents: Read and write** (나머지는 건드리지 않아요)
- Expiration: 1년 정도로 정하고, 만료되면 다시 만들어 넣어요.

### 6. 비밀값 넣고 다시 배포
```bash
npx wrangler secret put GITHUB_CLIENT_SECRET   # 4단계의 Client secret
npx wrangler secret put GITHUB_REPO_TOKEN      # 5단계의 토큰
npx wrangler secret put SESSION_SECRET         # 아래 명령으로 만든 무작위 문자열
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
npx wrangler deploy
```
비밀값은 Cloudflare에만 저장돼요. 저장소에는 절대 넣지 마세요.

### 7. 블로그에 API 주소 알려주기
블로그 저장소의 `_config.yml`에서 `api_base`에 3단계의 주소를 넣고 푸시하면, 블로그 오른쪽 위에 **로그인** 버튼이 생겨요.

### 8. 확인
- `https://<API 주소>/api/health` → `{"ok":true}`
- 블로그에서 로그인 → 프로필 사진과 **글쓰기** 메뉴가 보이면 주인으로 인식된 거예요.
- 다른 GitHub 계정으로 로그인하면 글쓰기 메뉴가 안 보이고, API도 403으로 막혀요.

## 개발

```bash
npm test          # 단위 테스트
npm run typecheck # 타입 검사
npm run dev       # 로컬 실행 (비밀값은 worker/.dev.vars 에, 저장소에는 올리지 않음)
```

## API

| 메서드와 경로 | 권한 | 하는 일 |
|---|---|---|
| `GET /api/health` | 누구나 | 상태 확인 |
| `GET /auth/login?return=/경로/` | 누구나 | GitHub 로그인으로 보냄 |
| `GET /auth/callback` | 누구나 | 세션 토큰을 붙여 블로그로 돌려보냄 |
| `GET /api/me` | 로그인 | 내 정보와 역할(owner/guest) |
| `GET /api/posts` | 주인 | 리포트 파일 목록 |
| `POST /api/posts` | 주인 | 리포트 발행 |
| `GET /api/posts/item?path=` | 주인 | 리포트 읽기(수정용) |
| `PUT /api/posts/item?path=` | 주인 | 리포트 수정 (`sha` 필요) |
| `DELETE /api/posts/item?path=&sha=` | 주인 | 리포트 삭제 |
| `GET /api/posts/status?path=` | 주인 | 발행됐는지 확인 (공개 주소가 열리면 발행됨) |

## 나중에 도메인을 사면
`blog.내도메인`과 `api.내도메인`을 같은 사이트로 두고, 세션을 HttpOnly 쿠키로 바꿀 수 있어요. 지금은 로그인 뒤 토큰을 블로그 주소의 `#` 뒤로 넘겨 브라우저에 저장하는 방식이에요.
