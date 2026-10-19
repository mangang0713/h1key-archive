# Supabase 커뮤니티 기능 설정

현재 코드에는 스키마 마이그레이션과 `community-api` Edge Function이 준비되어 있습니다. 실제 Supabase 프로젝트, OAuth 앱, Turnstile 키를 연결하기 전에는 커뮤니티 기능을 사용할 수 없으며, 지도와 정적 일정은 계속 동작합니다. 이 문서는 기능을 실제로 켜기 위한 운영자 작업 목록입니다.

## 배포 전 준비

1. Supabase 프로젝트를 만들고 `Project URL`과 publishable key를 로컬 `.env`에 넣습니다. `.env.example`을 복사해 시작할 수 있습니다. publishable key는 브라우저에 노출되는 용도이며, `service_role` 키는 절대 `.env`의 `VITE_` 변수나 프런트엔드에 넣지 않습니다.
2. Supabase SQL Editor 또는 Supabase CLI를 사용해 `migrations/202610190001_community_foundation.sql`을 적용합니다.
3. Supabase Auth의 사이트 URL과 Redirect URLs에 `http://localhost:5173/`, `http://127.0.0.1:5173/`, `https://mangang0713.github.io/h1key-archive/`를 등록합니다.
4. X OAuth 2.0, Google, Kakao 제공자 자격 증명을 Supabase Auth에 설정합니다. X는 로그인에만 사용하며 X 게시물을 자동 수집하지 않습니다. OAuth 제공자가 요구하는 공개 개인정보 안내와 이용약관 URL은 정책 문서를 최종 검토한 뒤 등록합니다.
5. Cloudflare Turnstile 위젯을 만들고 사이트 키를 `VITE_TURNSTILE_SITE_KEY`에 둡니다. Edge Function에는 `TURNSTILE_SECRET_KEY`를 비밀 설정으로 등록합니다. 두 키가 모두 설정된 배포에서 게시물·후기 작성과 사진 업로드에 서버 검증이 적용됩니다.
6. `community-api` Edge Function을 배포하고 다음 비밀 설정이 있는지 확인합니다: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `TURNSTILE_SECRET_KEY`, `ALLOWED_ORIGINS`. `ALLOWED_ORIGINS`에는 로컬 주소와 실제 배포 주소만 쉼표로 지정합니다. 서비스 역할 키는 Edge Function 비밀 설정에만 둡니다.
7. 첫 로그인을 마친 뒤 해당 Auth 사용자 UUID를 확인해 `admin_members`에 관리자 행을 추가합니다. 이 작업은 Supabase SQL Editor에서 직접 수행하며 UUID를 공개 문서에 적지 않습니다.
8. 로그인, 작성·수정·삭제, 신고, 관리자 숨김·삭제, 사진 한도, 중단 스위치를 익명·일반 사용자·관리자로 각각 시험합니다. 개인정보 안내의 연락처, 운영 주체, 보유 기간을 정하고 초안 문구를 확정한 뒤에만 공개합니다.

## 한도와 운영

- 사진은 JPG/PNG/WebP만 받습니다. 브라우저는 1MB가 넘는 이미지를 긴 변 2,000px 이내 WebP로 줄이고, Edge Function은 실제 MIME과 파일 헤더, 실제 바이트 수를 다시 확인합니다.
- 방명록은 계정당 시간당 3회, 후기는 시간당 5회, 사진 업로드는 시간당 6회로 제한합니다. 신고와 좋아요에도 별도 계정별 제한이 적용됩니다. 개인정보 안내 문구가 바뀌면 Edge Function의 동의 버전도 함께 올려 새 동의를 받습니다.
- 파일 하나는 1MB, 게시물 하나는 3장, 계정 하나는 총 10장·10MB입니다. 전체 사용자 사진 사용량은 700MB부터 주의하고 800MB에서 업로드를 거부합니다. DB 예약 행을 먼저 확보해 동시 업로드도 한도에 포함합니다.
- DB가 400MB에 도달하면 서버가 사용자 콘텐츠 쓰기를 중단합니다. 관리자는 `/admin/settings`에서 커뮤니티 쓰기, 업로드, 사진 열람을 따로 중단할 수 있습니다. DB 경고 기준 350MB와 월 egress 경고 3.5GB·중단 4GB는 Supabase 대시보드의 실제 사용량을 확인해 대응합니다.
- Supabase Free만으로 대규모 DDoS 가용성을 보장하지 않습니다. Auth와 계정별 요청 제한, Turnstile, 사용량 감시와 중단 스위치를 함께 사용합니다. 지도·일정은 정적 자산이므로 커뮤니티 기능 장애 때도 계속 조회할 수 있습니다.
- 사진은 private Storage에 저장하며, 공개 게시물에서 보여줄 때 5분짜리 signed URL을 발급합니다. 사진 열람 스위치를 끄면 새 URL을 발급하지 않습니다. 이미 발급한 URL은 만료 시각까지 유효할 수 있습니다.
- 계정 삭제 시 본문과 후기는 “익명 사용자”로 남기고 작성 계정 연결, 좋아요, 첨부 사진은 삭제합니다.

> 무료 등급의 정확한 제한은 서비스 운영 시점과 조직의 다른 프로젝트 사용량에 따라 달라질 수 있으므로 공개 전 Supabase Dashboard의 Billing/Usage를 다시 확인하세요. 사용자 지정 도메인과 외부 보호 서비스를 추가하기 전까지 `github.io`와 Supabase API를 Cloudflare가 자동 보호한다고 가정하지 않습니다.
