import type { Schedule } from '../types/archive'

// 기능 확인용 가상 스케줄이며 실제 H1-KEY 행사가 아닙니다.
export const schedules: Schedule[] = [
  { id: 'demo-1', locationId: 'seoul', title: '[가상] 서울 별빛 리허설', date: '2099-05-01', order: 1 },
  { id: 'demo-2', locationId: 'incheon', title: '[가상] 인천 바람 음악회', date: '2099-05-03', order: 2 },
  { id: 'demo-3', locationId: 'daejeon', title: '[가상] 대전 봄빛 쇼케이스', date: '2099-05-05', order: 3 },
  { id: 'demo-4', locationId: 'daegu', title: '[가상] 대구 구름 페스티벌', date: '2099-05-07', order: 4 },
  { id: 'demo-5', locationId: 'busan', title: '[가상] 부산 파도 음악회', date: '2099-05-09', order: 5 },
  { id: 'demo-6', locationId: 'seoul', title: '[가상] 서울 달빛 앙코르', date: '2099-05-11', order: 6 },
]
