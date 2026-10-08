import type { Song } from '../types/archive'

// 관계와 공연 순서 확인용 가상 곡이며 실제 H1-KEY 곡이 아닙니다.
export const songs: Song[] = [
  { id: 'test-song-1', title: '[가상 곡] 별빛 산책' },
  { id: 'test-song-2', title: '[가상 곡] 구름 너머' },
  { id: 'test-song-3', title: '[가상 곡] 파도의 편지' },
]
