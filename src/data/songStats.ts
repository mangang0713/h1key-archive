import { schedules } from './schedules'
import { songs } from './songs'
import type { Schedule, Song } from '../types/archive'

export type SongPerformanceStat = {
  song: Song
  scheduleCount: number
  fullyConfirmedCount: number
  partiallyConfirmedCount: number
}

// known/partial 일정에 확인된 곡만 세고, 한 일정 안의 중복 songId는 한 번만 계산합니다.
export function getSongPerformanceStats(
  sourceSchedules: Schedule[] = schedules,
  sourceSongs: Song[] = songs,
): SongPerformanceStat[] {
  const stats = new Map(sourceSongs.map((song) => [song.id, {
    song,
    scheduleCount: 0,
    fullyConfirmedCount: 0,
    partiallyConfirmedCount: 0,
  }]))

  for (const schedule of sourceSchedules) {
    if (schedule.setlistStatus !== 'known' && schedule.setlistStatus !== 'partial') continue
    for (const songId of new Set(schedule.setlist)) {
      const stat = stats.get(songId)
      if (!stat) continue
      stat.scheduleCount += 1
      if (schedule.setlistStatus === 'known') stat.fullyConfirmedCount += 1
      else stat.partiallyConfirmedCount += 1
    }
  }

  return [...stats.values()].sort((a, b) =>
    b.scheduleCount - a.scheduleCount || a.song.title.localeCompare(b.song.title, 'ko'))
}
