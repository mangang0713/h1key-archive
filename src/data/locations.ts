import type { Location } from '../types/archive'

// 모든 장소명과 행사는 기능 확인용 가상 데이터입니다.
export const locations: Location[] = [
  { id: 'seoul', name: '서울 가상 테스트 광장', coordinates: [126.978, 37.5665] },
  { id: 'incheon', name: '인천 가상 테스트 무대', coordinates: [126.7052, 37.4563] },
  { id: 'daejeon', name: '대전 가상 테스트 홀', coordinates: [127.3845, 36.3504] },
  { id: 'daegu', name: '대구 가상 테스트 공원', coordinates: [128.6014, 35.8714] },
  { id: 'busan', name: '부산 가상 테스트 센터', coordinates: [129.0756, 35.1796] },
]
