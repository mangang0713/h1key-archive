/**
 * 이 모듈은 원본 일정·장소 데이터를 지도 마커와 국가별 탐색 데이터로 구성합니다.
 */

import type { FeatureCollection, Point } from 'geojson';
import { locations } from '../../data/locations';
import { schedules } from '../../data/schedules';
import type { CountryCode, Location } from '../../types/archive';

/** 지도 엔진이 사용 가능한 좌표가 실제로 포함된 장소 자료입니다. */
export type MappedLocation = Location & { coordinates: [number, number] };

const hasCoordinates = (location: Location): location is MappedLocation =>
  location.coordinates !== undefined;

const mappedLocations = locations.filter(hasCoordinates);

function compareSchedules(
  a: (typeof schedules)[number],
  b: (typeof schedules)[number],
) {
  return (
    a.date.localeCompare(b.date) ||
    (a.orderInDay ?? Infinity) - (b.orderInDay ?? Infinity) ||
    (a.startTime ?? '99').localeCompare(b.startTime ?? '99') ||
    a.id.localeCompare(b.id)
  );
}

/** 마커를 눌렀을 때 원본 장소 정보를 빠르게 찾는 조회표입니다. */
export const locationsById = new Map(
  mappedLocations.map((location) => [location.id, location]),
);

/** 각 장소에 연결된 행사를 날짜순으로 보여주기 위한 인덱스입니다. */
export const schedulesByLocation = new Map(
  locations.map((location) => [
    location.id,
    schedules
      .filter((schedule) => schedule.locationId === location.id)
      .sort(compareSchedules),
  ]),
);

/** 지도 좌표가 없어 장소 마커 대신 영상통화 목록에 표시할 일정입니다. */
export const videoCallSchedules = schedules
  .filter(
    (schedule) =>
      schedule.eventFormat === 'online' && schedule.locationId === undefined,
  )
  .sort(compareSchedules);

/** MapLibre가 클러스터와 위치 마커를 그리는 GeoJSON 피처 모음입니다. */
export const locationPoints: FeatureCollection<Point> = {
  type: 'FeatureCollection',
  features: mappedLocations.map((location) => ({
    type: 'Feature',
    id: location.id,
    geometry: { type: 'Point', coordinates: location.coordinates },
    properties: {
      locationId: location.id,
      scheduleCount: schedulesByLocation.get(location.id)?.length ?? 0,
    },
  })),
};

const regionLabels: Array<{ countryCode: CountryCode; label: string }> = [
  { countryCode: 'KR', label: '한국' },
  { countryCode: 'CN', label: '중국' },
  { countryCode: 'JP', label: '일본' },
  { countryCode: 'TH', label: '태국' },
];

/** 실제 일정이 있는 국가만 지역 이동 메뉴에 남긴 목록입니다. */
export const archiveRegions = regionLabels
  .map(({ countryCode, label }) => {
    const regionLocations = mappedLocations.filter(
      (location) =>
        (location.countryCode ?? 'KR') === countryCode &&
        (schedulesByLocation.get(location.id)?.length ?? 0) > 0,
    );
    const scheduleCount = regionLocations.reduce(
      (total, location) =>
        total + (schedulesByLocation.get(location.id)?.length ?? 0),
      0,
    );
    return { countryCode, label, locations: regionLocations, scheduleCount };
  })
  .filter((region) => region.locations.length > 0);

// 지도 중심에서 가장 가까운 일정 장소의 국가를 현재 탐색 지역으로 사용합니다.
/** 지도 중심에서 가장 가까운 일정 장소의 국가를 현재 탐색 지역으로 계산합니다. */
export function nearestRegionCode(center: [number, number]): CountryCode {
  const [longitude, latitude] = center;
  let nearestCode: CountryCode = 'KR';
  let nearestDistance = Infinity;
  for (const region of archiveRegions) {
    for (const location of region.locations) {
      const latitudeScale = Math.cos(
        (((location.coordinates[1] + latitude) / 2) * Math.PI) / 180,
      );
      const distance = Math.hypot(
        (location.coordinates[0] - longitude) * latitudeScale,
        location.coordinates[1] - latitude,
      );
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestCode = region.countryCode;
      }
    }
  }
  return nearestCode;
}
