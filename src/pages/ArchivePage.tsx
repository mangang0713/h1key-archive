/**
 * 이 페이지는 지도 중심 아카이브 탐색과 지역·시간순 이동 기능을 한 화면에 조립합니다.
 */

import ArchiveMap from '../components/map/ArchiveMap';
import './ArchivePage.css';

/** 지도 탐색 상태와 여정·지역 패널을 묶는 아카이브 시작 화면입니다. */
function ArchivePage() {
  return (
    <div className="archive-page">
      <ArchiveMap />
    </div>
  );
}

export default ArchivePage;
