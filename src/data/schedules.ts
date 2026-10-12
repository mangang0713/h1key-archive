import type { Schedule } from "../types/archive";
import { locations } from "./locations";
import { songs } from "./songs";

// 기능 확인용 가상 스케줄이며 실제 H1-KEY 행사가 아닙니다.
const defaultSetlist = [
  "rose-between-buildings",
  "to-my-first-love",
  "lets-get-hot",
  "it-was-summer",
  "romantic-overdose",
] as const;

export const schedules: Schedule[] = [
  {
    id: "demo-1",
    locationId: "seoul",
    eventFormat: "in-person",
    title: "[가상] 서울 별빛 리허설",
    date: "2099-05-01",
    startTime: "14:00",
    orderInDay: 1,
    setlistStatus: "known",
    setlist: [...defaultSetlist],
  },
  {
    id: "demo-2",
    locationId: "incheon",
    eventFormat: "in-person",
    title: "[가상] 인천 바람 음악회",
    date: "2099-05-03",
    startTime: "18:00",
    orderInDay: 1,
    setlistStatus: "known",
    setlist: [...defaultSetlist],
  },
  {
    id: "demo-3",
    locationId: "daejeon",
    eventFormat: "in-person",
    title: "[가상] 대전 봄빛 쇼케이스",
    date: "2099-05-05",
    orderInDay: 1,
    setlistStatus: "known",
    setlist: [...defaultSetlist],
  },
  {
    id: "demo-4",
    locationId: "daegu",
    eventFormat: "in-person",
    title: "[가상] 대구 구름 페스티벌",
    date: "2099-05-07",
    startTime: "13:00",
    orderInDay: 1,
    setlistStatus: "known",
    setlist: [...defaultSetlist],
  },
  {
    // 같은 날짜의 두 번째 행사: 전체 데이터의 다섯 번째와 구별합니다.
    id: "demo-5",
    locationId: "busan",
    eventFormat: "in-person",
    title: "[가상] 부산 파도 음악회",
    date: "2099-05-07",
    startTime: "19:00",
    orderInDay: 2,
    setlistStatus: "known",
    setlist: [...defaultSetlist],
  },
  {
    id: "demo-6",
    locationId: "seoul",
    eventFormat: "in-person",
    title: "[가상] 서울 달빛 앙코르",
    date: "2099-05-11",
    startTime: "20:00",
    orderInDay: 1,
    setlistStatus: "unknown",
    setlist: [],
  },
  {
    id: "demo-7",
    eventFormat: "online",
    title: "[가상] 온라인 영상통화 팬사인회",
    date: "2099-05-09",
    startTime: "19:00",
    orderInDay: 1,
    setlistStatus: "unknown",
    setlist: [],
  },
];

// 새 데이터를 추가할 때도 잘못된 ID 연결을 즉시 발견합니다.
for (const [name, entries] of [
  ["Location", locations],
  ["Song", songs],
  ["Schedule", schedules],
] as const) {
  const ids = entries.map((entry) => entry.id);
  if (new Set(ids).size !== ids.length)
    throw new Error(`${name} ID가 중복되었습니다.`);
}
const locationIds = new Set(locations.map((location) => location.id));
const songIds = new Set(songs.map((song) => song.id));
const dayOrders = new Set<string>();
for (const schedule of schedules) {
  if (schedule.locationId && !locationIds.has(schedule.locationId))
    throw new Error(`${schedule.id}: 존재하지 않는 locationId`);
  if (schedule.eventFormat === "online" && schedule.locationId)
    throw new Error(`${schedule.id}: 온라인 일정에는 장소를 연결할 수 없습니다.`);
  for (const songId of schedule.setlist) {
    if (!songIds.has(songId))
      throw new Error(`${schedule.id}: 존재하지 않는 songId (${songId})`);
  }
  if (schedule.orderInDay !== undefined) {
    const key = `${schedule.date}:${schedule.orderInDay}`;
    if (
      !Number.isInteger(schedule.orderInDay) ||
      schedule.orderInDay < 1 ||
      dayOrders.has(key)
    ) {
      throw new Error(
        `${schedule.id}: 같은 날짜의 행사 순서가 잘못되었거나 중복되었습니다.`,
      );
    }
    dayOrders.add(key);
  }
}
