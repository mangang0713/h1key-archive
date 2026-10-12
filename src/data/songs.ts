import type { Song } from '../types/archive'

// 실제 곡 제목을 사용하는 기능 확인용 목록입니다.
// 이 곡 목록을 참조하는 schedules.ts의 행사는 모두 가상 일정입니다.
export const songs: Song[] = [
  { id: 'rose-between-buildings', title: '건물 사이에 피어난 장미' },
  { id: 'to-my-first-love', title: '나의 첫사랑에게' },
  { id: 'lets-get-hot', title: '뜨거워지자' },
  { id: 'it-was-summer', title: '여름이었다' },
  { id: 'romantic-overdose', title: '낭만한도초과' },
]
