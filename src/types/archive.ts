export type Location = {
  id: string
  name: string
  coordinates: [number, number]
}

export type Schedule = {
  id: string
  locationId: Location['id']
  title: string
  date: string // YYYY-MM-DD
  order: number // 전체 테스트 스케줄의 순서
}
