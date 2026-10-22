/**
 * 이 모듈은 확정된 세트리스트와 날짜 순서를 바탕으로 곡별 공연 순번을 계산합니다.
 */

import { schedules } from './schedules';
import { songs } from './songs';
import type { Schedule, Song } from '../types/archive';

/** 세트리스트가 확인된 일정 수와 완전·부분 확인 횟수를 나타냅니다. */
export type SongPerformanceStat = {
  song: Song;
  scheduleCount: number;
  fullyConfirmedCount: number;
  partiallyConfirmedCount: number;
};

function isCountableSetlist(schedule: Schedule) {
  return (
    schedule.setlistStatus === 'known' || schedule.setlistStatus === 'partial'
  );
}

function compareSameDayOrder(a: Schedule, b: Schedule) {
  if (a.orderInDay !== undefined && b.orderInDay !== undefined) {
    return a.orderInDay === b.orderInDay
      ? undefined
      : a.orderInDay < b.orderInDay
        ? -1
        : 1;
  }
  if (a.startTime && b.startTime) {
    return a.startTime === b.startTime
      ? undefined
      : a.startTime < b.startTime
        ? -1
        : 1;
  }
  return undefined;
}

// 현재 일정을 포함해 날짜순으로 해당 곡의 몇 번째 확정 기록인지 돌려줍니다.
// 같은 날 기록끼리 순서를 알 수 없으면 잘못된 순번을 만들지 않습니다.
/** 현재 일정의 곡이 아카이브 기록에서 몇 번째인지, 확정 불가면 undefined를 반환합니다. */
export function getSongPerformanceNumber(
  songId: string,
  scheduleId: string,
  sourceSchedules: Schedule[] = schedules,
): number | undefined {
  const target = sourceSchedules.find((schedule) => schedule.id === scheduleId);
  if (
    !target ||
    !isCountableSetlist(target) ||
    !target.setlist.includes(songId)
  ) {
    return undefined;
  }

  const appearances = sourceSchedules.filter(
    (schedule) =>
      isCountableSetlist(schedule) && schedule.setlist.includes(songId),
  );
  let number = 1;

  for (const appearance of appearances) {
    if (appearance.id === target.id) continue;
    if (appearance.date < target.date) {
      number += 1;
      continue;
    }
    if (appearance.date !== target.date) continue;

    const sameDayOrder = compareSameDayOrder(appearance, target);
    if (sameDayOrder === undefined) return undefined;
    if (sameDayOrder < 0) number += 1;
  }

  return number;
}

// known/partial 일정에 확인된 곡만 세고, 한 일정 안의 중복 songId는 한 번만 계산합니다.
/** 지정 기간의 세트리스트를 집계해 곡별 공연 기록 수를 계산합니다. */
export function getSongPerformanceStats(
  sourceSchedules: Schedule[] = schedules,
  sourceSongs: Song[] = songs,
): SongPerformanceStat[] {
  const stats = new Map(
    sourceSongs.map((song) => [
      song.id,
      {
        song,
        scheduleCount: 0,
        fullyConfirmedCount: 0,
        partiallyConfirmedCount: 0,
      },
    ]),
  );

  for (const schedule of sourceSchedules) {
    if (!isCountableSetlist(schedule)) continue;
    for (const songId of new Set(schedule.setlist)) {
      const stat = stats.get(songId);
      if (!stat) continue;
      stat.scheduleCount += 1;
      if (schedule.setlistStatus === 'known') stat.fullyConfirmedCount += 1;
      else stat.partiallyConfirmedCount += 1;
    }
  }

  return [...stats.values()].sort(
    (a, b) =>
      b.scheduleCount - a.scheduleCount ||
      a.song.title.localeCompare(b.song.title, 'ko'),
  );
}
