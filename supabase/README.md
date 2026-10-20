# Supabase 커뮤니티 기능 설정

Supabase 프로젝트와 X·Google·Kakao OAuth는 연결되어 있습니다. 커뮤니티 DB 마이그레이션과 Turnstile 위젯 설정은 적용됐지만, `community-api` Edge Function 배포와 프런트 빌드 Site Key 연결이 완료되기 전까지 커뮤니티 쓰기 기능은 완전히 동작하지 않습니다. 지도와 정적 일정은 계속 동작합니다. 이 문서는 DB와 서버 기능의 배포·운영 절차를 정리합니다.

## 배포 전 준비

1. 연결된 Supabase 프로젝트의 `Project URL`과 publishable key를 로컬 `.env`에 넣습니다. `.env.example`을 복사해 시작할 수 있습니다. publishable key는 브라우저에 노출되는 용도이며, `service_role` 키는 절대 `.env`의 `VITE_` 변수나 프런트엔드에 넣지 않습니다.
2. Supabase SQL Editor 또는 Supabase CLI를 사용해 `migrations/202610190001_community_foundation.sql`, `migrations/202610200001_profile_onboarding.sql`, `migrations/202610200002_hessxl_admin.sql` 순서대로 적용합니다. 첫 마이그레이션은 커뮤니티 테이블과 읽기 API를 만들고, 두 번째는 기존 로그인 계정 프로필 보완과 공개 표시 이름 저장을, 세 번째는 `hessxl_` X 계정만 관리자로 판정하도록 설정합니다. 세 마이그레이션은 원격 프로젝트에 적용된 상태입니다.
3. Supabase Auth의 사이트 URL과 Redirect URLs에 `http://localhost:5173/`, `http://127.0.0.1:5173/`, `https://mangang0713.github.io/h1key-archive/`를 등록합니다.
4. X OAuth 2.0, Google, Kakao 제공자 자격 증명을 Supabase Auth에 설정합니다. X는 로그인에만 사용하며 X 게시물을 자동 수집하지 않습니다. OAuth 제공자가 요구하는 공개 개인정보 안내와 이용약관 URL은 정책 문서를 최종 검토한 뒤 등록합니다.
5. Cloudflare Turnstile 사이트 키는 공개 값이므로 로컬 `.env.local`과 GitHub Actions 저장소 변수 `VITE_TURNSTILE_SITE_KEY`에 둡니다. 비밀 키 `TURNSTILE_SECRET_KEY`는 Supabase Edge Function secret으로만 보관합니다.
6. `community-api` Edge Function을 배포하고 다음 설정을 확인합니다: Supabase가 제공하는 `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, 직접 등록한 `TURNSTILE_SECRET_KEY`, `ALLOWED_ORIGINS`. 현재 `ALLOWED_ORIGINS`는 로컬 주소, GitHub Pages, 임시 테스트 사이트 주소를 쉼표로 구분해 포함합니다. 서비스 역할 키는 Edge Function 비밀 설정에만 둡니다.
7. 운영 메뉴는 X 로그인 계정 `hessxl_`에만 표시됩니다. 세 번째 마이그레이션의 서버 함수가 X OAuth identity의 사용자명을 확인해 해당 계정만 `admin_members`에 등록합니다. 화면에서 이름을 흉내 내거나 프로필 표시 이름을 바꾸는 것만으로 관리자 권한을 얻을 수 없습니다.
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

## 최종 배포 후 임시 설정 정리

- 실제 공개 도메인과 운영 방식이 확정되면 Cloudflare Turnstile 위젯에서 `localhost`, `127.0.0.1`, `h1key-activity-archive-test.decentkid32.chatgpt.site`를 허용 호스트 목록에서 제거합니다. GitHub Pages를 계속 운영 도메인으로 쓸 때는 `mangang0713.github.io`를 유지하고, 자체 도메인으로 바꾸면 새 도메인을 먼저 추가·검증한 뒤 GitHub Pages 호스트를 제거합니다.
- Supabase Edge Function의 `ALLOWED_ORIGINS`에서도 로컬·임시 테스트 origin을 제거하고, 실제 운영 origin만 남깁니다.
- 테스트용 Cloudflare 위젯이나 더 이상 쓰지 않는 키가 따로 생긴 경우 운영 위젯 사용 여부를 확인한 뒤 삭제합니다. 현재 사용 중인 위젯을 정리 목적으로 성급히 삭제하지 않습니다.
