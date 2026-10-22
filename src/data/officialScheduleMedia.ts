/**
 * 이 파일은 날짜별 공식 계정 사진을 일정·분류에 연결하는 정적 목록과 경로 생성기를 제공합니다.
 */

import type { Schedule } from '../types/archive';

type OfficialScheduleMedia = Pick<
  NonNullable<Schedule['media']>,
  'officialGroupPhotos' | 'officialIndividualPhotos' | 'officialReels'
>;
type OfficialPhotoCategory = 'group' | 'individual';

// GitHub Pages 하위 경로와 로컬 개발 경로를 모두 지원합니다.
/** 공식 사진 파일의 저장소 공개 경로를 생성해 일정 분류에 연결합니다. */
export function officialPhoto(
  date: Schedule['date'],
  category: OfficialPhotoCategory,
  filename: string,
) {
  return `${import.meta.env.BASE_URL}media/official/${date}/${category}/${filename}`;
}

// 사진은 게시물에 적힌 행사 날짜의 폴더에 넣고 일정 ID로 연결합니다.
// 경로: public/media/official/<YYYY-MM-DD>/<분류>/
// 예: 'schedule-2026-05-02-01': {
//   officialGroupPhotos: [officialPhoto('2026-05-02', 'group', '01.webp')],
//   officialIndividualPhotos: [officialPhoto('2026-05-02', 'individual', '01.webp')],
//   officialReels: ['https://www.instagram.com/reel/게시물ID/'],
// },
/** 공식 사진을 준비하면 해당 일정 ID에 그룹·개인 사진 경로를 추가합니다. */
export const officialScheduleMediaByScheduleId: Partial<
  Record<Schedule['id'], OfficialScheduleMedia>
> = {};
