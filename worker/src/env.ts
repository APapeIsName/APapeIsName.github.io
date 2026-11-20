export interface Env {
  BLOG_ORIGIN: string;
  OWNER_GITHUB_ID: string;
  REPO_OWNER: string;
  REPO_NAME: string;
  REPO_BRANCH: string;
  GITHUB_CLIENT_ID: string;
  // 비밀값
  GITHUB_CLIENT_SECRET: string;
  SESSION_SECRET: string;
  GITHUB_REPO_TOKEN: string;
  /** 리포트 인터뷰(AI)용. 없으면 인터뷰만 꺼져요. */
  ANTHROPIC_API_KEY?: string;
  /** 인터뷰에 쓸 모델 (기본 claude-haiku-5-5) */
  INTERVIEW_MODEL?: string;
}
