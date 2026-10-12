export type Location = {
  id: string
  name: string
  coordinates: [number, number] // [경도, 위도]
}

export type Song = {
  id: string
  title: string
}

export type ScheduleMedia = {
  photos?: string[]
  youtube?: string[]
  xPosts?: string[]
}

export type EventFormat = 'in-person' | 'online' | 'hybrid' | 'unknown'

type Hour = `${'0' | '1'}${0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9}` | `2${0 | 1 | 2 | 3}`
type Minute = `${0 | 1 | 2 | 3 | 4 | 5}${0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9}`

export type Schedule = {
  id: string
  locationId?: Location['id'] // 실제 장소가 없는 온라인 행사나 아직 장소를 모르는 행사에서는 생략
  eventFormat: EventFormat
  title: string
  date: string // YYYY-MM-DD
  startTime?: `${Hour}:${Minute}` // HH:mm (00:00~23:59), 미확인일 때 생략
  orderInDay?: number // 같은 날짜의 행사 순서 (1부터), 전체 순번 아님
  media?: ScheduleMedia // 외부 URL만 저장하며 파일을 직접 보관하지 않음
} & (
  // 배열 순서는 공연 순서입니다. 곡별 누적 공연 순번은 저장하지 않습니다.
  | { setlistStatus: 'known'; setlist: [Song['id'], ...Song['id'][]] }
  | { setlistStatus: 'unknown'; setlist: [] } // 세트리스트 미확인
  | { setlistStatus: 'none'; setlist: [] } // 곡 공연이 없었음을 확인
)
