# Supabase 커뮤니티 기능 설정

Supabase 프로젝트의 커뮤니티 DB 마이그레이션과 `community-api` Edge Function을 적용했고, Turnstile도 연결했습니다. GitHub Pages 빌드에는 GitHub 저장소의 Actions 변수로 Supabase와 Turnstile 공개 설정을 전달합니다. 2026-10-21 공개 배포본에서 방명록 공개 조회를 확인했으며, 배포 환경의 로그인과 글 작성 등 전체 커뮤니티 흐름은 출시 전에 다시 점검해야 합니다. 설정이나 커뮤니티 기능에 문제가 있어도 지도와 정적 일정은 계속 동작합니다. 이 문서는 DB와 서버 기능의 배포·운영 절차를 정리합니다.

## 배포 전 준비

1. 로컬 개발에서는 연결된 Supabase 프로젝트의 URL과 publishable key를 `.env.local`에 넣습니다. `.env.example`을 참고해 시작할 수 있습니다. GitHub Pages 배포에는 저장소 **Settings → Secrets and variables → Actions → Variables**에 `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_TURNSTILE_SITE_KEY`를 등록합니다. 배포 workflow가 이 변수들을 빌드에 전달합니다. URL, publishable key, Turnstile site key는 브라우저에서 사용되는 공개 설정값입니다. `service_role` 키와 `TURNSTILE_SECRET_KEY`는 절대 `VITE_` 변수나 브라우저 번들에 넣지 말고 서버 secret으로만 보관합니다.
2. Supabase SQL Editor 또는 Supabase CLI를 사용해 `migrations/202610190001_community_foundation.sql`, `migrations/202610200001_profile_onboarding.sql`, `migrations/202610200002_hessxl_admin.sql` 순서대로 적용합니다. 첫 마이그레이션은 커뮤니티 테이블과 읽기 API를 만들고, 두 번째는 기존 로그인 계정 프로필 보완과 공개 표시 이름 저장을, 세 번째는 `hessxl_` X 계정만 관리자로 판정하도록 설정합니다. 세 마이그레이션은 원격 프로젝트에 적용된 상태입니다.
3. Supabase Auth의 사이트 URL과 Redirect URLs에 `http://localhost:5173/`, `http://127.0.0.1:5173/`, `https://mangang0713.github.io/happy-riina-day/`를 등록합니다.
4. X OAuth 2.0, Google, Kakao 제공자 자격 증명을 Supabase Auth에 설정합니다. X는 로그인에만 사용하며 X 게시물을 자동 수집하지 않습니다. OAuth 제공자가 요구하는 공개 개인정보 안내와 이용약관 URL은 정책 문서를 최종 검토한 뒤 등록합니다.
5. Cloudflare Turnstile 사이트 키는 공개 값이므로 로컬 `.env.local`과 GitHub Actions 저장소 변수 `VITE_TURNSTILE_SITE_KEY`에 둡니다. 비밀 키 `TURNSTILE_SECRET_KEY`는 Supabase Edge Function secret으로만 보관합니다.
6. `community-api` Edge Function을 배포하고 다음 설정을 확인합니다: Supabase가 제공하는 `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, 직접 등록한 `TURNSTILE_SECRET_KEY`, `ALLOWED_ORIGINS`. 현재 `ALLOWED_ORIGINS`는 로컬 주소, GitHub Pages, 임시 테스트 사이트 주소를 쉼표로 구분해 포함합니다. 서비스 역할 키는 Edge Function 비밀 설정에만 둡니다.
7. 운영 메뉴는 X 로그인 계정 `hessxl_`에만 표시됩니다. 세 번째 마이그레이션의 서버 함수가 X OAuth identity의 사용자명을 확인해 해당 계정만 `admin_members`에 등록합니다. 화면에서 이름을 흉내 내거나 프로필 표시 이름을 바꾸는 것만으로 관리자 권한을 얻을 수 없습니다.
8. 로그인, 작성·수정·삭제, 신고, 관리자 숨김·삭제, 사진 한도, 중단 스위치를 익명·일반 사용자·관리자로 각각 시험합니다. 개인정보 안내에는 X 문의 계정 `@hessxl_`와 2027년 12월 31일 이후 서비스 데이터 폐기 예정일을 반영했습니다. 공개 전에 실제 처리 흐름과 정책이 일치하는지 최종 검토합니다.
9. 커뮤니티 신고·숨김·이의제기·7일 보관 흐름을 사용하는 경우 `migrations/202610210003_community_moderation_appeals_and_retention.sql`을 적용하고 최신 `community-api` Edge Function을 배포합니다. 이 마이그레이션은 기존 숨김 글에 적용 시점부터 7일의 이의제기 기간을 부여하고, 만료 시각이 지나도 대기 중인 이의제기가 있으면 최종 판정을 기다립니다.
10. 자동 만료 정리를 활성화하려면 무작위 비밀값 하나를 정해 Edge Function Secrets에 `COMMUNITY_PURGE_SECRET`으로, Database → Vault에는 `community_purge_secret`으로 등록합니다. 두 값은 같아야 하며 코드·GitHub 저장소·공개 채팅에 넣지 않습니다. 그다음 `migrations/202610210004_schedule_community_content_purge.sql`을 적용하면 매시간 17분에 Edge Function을 호출하는 Cron 작업이 만들어집니다. Vault 비밀값이 등록되기 전에는 요청하지 않으며, 함수도 Edge secret과 값이 일치해야만 실행됩니다.
11. 이의제기 기각 시 게시글·사진을 즉시 삭제하고 결과 사유만 작성자에게 7일간 보여주는 기능은 `migrations/202610210005_community_appeal_rejection_results.sql`과 최신 `community-api` Edge Function이 필요합니다. 마이그레이션을 먼저 적용한 뒤 Edge Function을 배포해야 하며, 결과 안내는 기존 시간별 정리 작업에서 만료 후 제거됩니다.

## 한도와 운영

- 사진은 JPG/PNG/WebP만 받습니다. 브라우저는 1MB가 넘는 이미지를 긴 변 2,000px 이내 WebP로 줄이고, Edge Function은 실제 MIME과 파일 헤더, 실제 바이트 수를 다시 확인합니다.
- 방명록은 계정당 시간당 3회, 후기는 시간당 5회, 사진 업로드는 시간당 6회로 제한합니다. 신고와 좋아요에도 별도 계정별 제한이 적용됩니다. 개인정보 안내 문구가 바뀌면 Edge Function의 동의 버전도 함께 올려 새 동의를 받습니다.
- 파일 하나는 1MB, 게시물 하나는 3장, 계정 하나는 총 10장·10MB입니다. 전체 사용자 사진 사용량은 700MB부터 주의하고 800MB에서 업로드를 거부합니다. DB 예약 행을 먼저 확보해 동시 업로드도 한도에 포함합니다.
- DB가 400MB에 도달하면 서버가 사용자 콘텐츠 쓰기를 중단합니다. 관리자는 `/admin/settings`에서 커뮤니티 쓰기, 업로드, 사진 열람을 따로 중단할 수 있습니다. DB 경고 기준 350MB와 월 egress 경고 3.5GB·중단 4GB는 Supabase 대시보드의 실제 사용량을 확인해 대응합니다.
- Supabase Free만으로 대규모 DDoS 가용성을 보장하지 않습니다. Auth와 계정별 요청 제한, Turnstile, 사용량 감시와 중단 스위치를 함께 사용합니다. 지도·일정은 정적 자산이므로 커뮤니티 기능 장애 때도 계속 조회할 수 있습니다.
- 사진은 private Storage에 저장하며, 공개 게시물에서 보여줄 때 5분짜리 signed URL을 발급합니다. 사진 열람 스위치를 끄면 새 URL을 발급하지 않습니다. 이미 발급한 URL은 만료 시각까지 유효할 수 있습니다.
- 계정 삭제 시 본문과 후기는 “익명 사용자”로 남기고 작성 계정 연결, 좋아요, 첨부 사진은 삭제합니다.
- 관리자가 글을 숨길 때 사유, 숨김 시각, 삭제 예정 시각을 저장합니다. 작성자는 `/account/posts`에서 자기 글과 운영 사유를 확인하고 7일 안에 이의제기할 수 있습니다. 대기 중인 이의제기는 만료 작업을 멈추며, 승인하면 게시물이 즉시 자동 재공개됩니다. 기각하면 게시글·사진·신고 인용문·이의제기 원문을 즉시 삭제하고, 게시물 내용이 없는 기각 사유 안내만 작성자에게 7일간 제공한 뒤 자동 삭제합니다.
- 이의제기 없이 숨김 상태로 7일이 지나면 Edge Function이 private Storage 원본 사진, DB 게시물, 신고 인용문과 이의제기 기록을 함께 제거합니다. 이 작업은 되돌릴 수 없고, 제거가 끝나면 관리자 화면에도 남지 않습니다. Edge Function 배포와 두 비밀값 등록이 끝나기 전에는 자동 만료 정리가 활성화되지 않습니다.

> 무료 등급의 정확한 제한은 서비스 운영 시점과 조직의 다른 프로젝트 사용량에 따라 달라질 수 있으므로 공개 전 Supabase Dashboard의 Billing/Usage를 다시 확인하세요. 사용자 지정 도메인과 외부 보호 서비스를 추가하기 전까지 `github.io`와 Supabase API를 Cloudflare가 자동 보호한다고 가정하지 않습니다.

## 최종 배포 후 임시 설정 정리

- 실제 공개 도메인과 운영 방식이 확정되면 Cloudflare Turnstile 위젯에서 `localhost`, `127.0.0.1`, `h1key-activity-archive-test.decentkid32.chatgpt.site`를 허용 호스트 목록에서 제거합니다. GitHub Pages를 계속 운영 도메인으로 쓸 때는 `mangang0713.github.io`를 유지하고, 자체 도메인으로 바꾸면 새 도메인을 먼저 추가·검증한 뒤 GitHub Pages 호스트를 제거합니다.
- Supabase Edge Function의 `ALLOWED_ORIGINS`에서도 로컬·임시 테스트 origin을 제거하고, 실제 운영 origin만 남깁니다.
- 테스트용 Cloudflare 위젯이나 더 이상 쓰지 않는 키가 따로 생긴 경우 운영 위젯 사용 여부를 확인한 뒤 삭제합니다. 현재 사용 중인 위젯을 정리 목적으로 성급히 삭제하지 않습니다.
