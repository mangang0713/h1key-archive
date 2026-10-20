import { Link, useParams } from 'react-router-dom'
import './CommunityPages.css'

function CommunityPolicyPage() {
  const { policyType } = useParams()
  const privacy = policyType === 'privacy'
  return <article className="community-page policy-page">
    <Link className="back-link" to={privacy ? '/account' : '/guestbook'}>← 돌아가기</Link>
    <div className="community-heading"><span className="community-eyebrow">DRAFT · 2026-10-20</span><h1>{privacy ? '개인정보 및 공개 안내' : '커뮤니티 운영 원칙'}</h1><p>{privacy ? '운영자 문의 방법과 서비스 데이터의 보관·폐기 예정일을 안내합니다.' : '사용자 기능 출시를 위해 준비한 운영 원칙입니다.'}</p></div>
    {privacy ? <>
      <section className="policy-section"><h2>수집·이용하는 정보</h2><p>소셜 로그인 제공자는 인증에 필요한 계정 식별 정보와 프로필 정보를 전달할 수 있습니다. 사이트는 로그인 이메일을 공개 화면에 표시하지 않고, 공개 표시 이름과 계정 식별자를 사용자 게시물의 수정·삭제 권한 확인에 사용합니다.</p></section>
      <section className="policy-section"><h2>공개되는 내용</h2><p>방명록 글, 일정 후기, 별점, 공개 표시 이름, 사용자가 첨부한 사진은 방문자에게 공개됩니다. 사진 파일은 비공개 저장소에 보관하고 게시된 사진을 보여줄 때 만료되는 링크를 사용합니다. 링크를 받은 사람은 만료 전 사진을 볼 수 있으므로 민감한 사진을 올리지 마세요.</p></section>
      <section className="policy-section"><h2>보관과 삭제</h2><p>사용자는 본인 글과 후기를 삭제하고 계정을 탈퇴할 수 있습니다. 탈퇴하면 작성 글은 “익명 사용자” 이름으로 남고 계정 연결, 좋아요, 첨부 사진은 삭제합니다. 신고 기록은 운영 검토를 위해 계정과 분리해 보관할 수 있습니다. 사이트가 직접 관리하는 일정·장소·곡 기록, 계정 및 프로필, 글·후기·반응·신고 기록, 첨부 사진과 미디어 연결 정보 등 서비스 데이터는 2027년 12월 31일 이후 모두 폐기할 예정입니다. 다만 Supabase 등 처리 서비스의 백업이나 보안 로그에 남은 복사본은 각 제공자의 삭제 정책과 주기에 따라 제거될 수 있습니다.</p></section>
      <section className="policy-section"><h2>처리 서비스와 문의</h2><p>인증, 데이터베이스, 사진 저장은 Supabase를 사용하고 웹 사이트는 GitHub Pages에서 제공합니다. X 게시물 미디어는 기존 공개 X URL 또는 임베드를 이용합니다. 악용 방지 요청 제한을 위해 네트워크 주소를 해시한 값을 임시로 사용할 수 있습니다. 게시물은 자동 신고만으로 숨겨지지 않으며 운영자가 확인합니다. 개인정보 처리와 삭제에 관한 문의는 X 계정 <a href="https://x.com/hessxl_" target="_blank" rel="noreferrer">@hessxl_</a>로 보내 주세요.</p></section>
    </> : <>
      <section className="policy-section"><h2>작성 기준</h2><p>축하와 응원을 중심으로 서로 존중하는 글을 남겨 주세요. 타인의 개인정보, 모욕·괴롭힘, 광고·스팸, 권리를 침해하는 사진은 게시하지 마세요.</p></section>
      <section className="policy-section"><h2>사진</h2><p>JPG, PNG, WebP만 사용할 수 있습니다. 파일은 자동으로 줄여 장당 1MB 이하로 저장하고, 게시물당 최대 3장, 계정당 총 10장·10MB까지 허용합니다. 계정 탈퇴 시 첨부 사진은 삭제됩니다.</p></section>
      <section className="policy-section"><h2>신고와 운영 조치</h2><p>로그인 사용자는 공개 글과 후기를 신고할 수 있습니다. 신고만으로 자동 숨김 처리하지 않으며, 운영자가 내용을 검토해 기각·숨김·삭제할 수 있습니다. 작성자는 본인 게시물을 수정하거나 삭제할 수 있습니다.</p></section>
    </>}
  </article>
}

export default CommunityPolicyPage
