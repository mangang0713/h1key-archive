import type { FeatureCollection, Point } from 'geojson'
import { locations } from '../../data/locations'
import { schedules } from '../../data/schedules'
import type { CountryCode, Location } from '../../types/archive'

export type MappedLocation = Location & { coordinates: [number, number] }

const hasCoordinates = (location: Location): location is MappedLocation =>
  location.coordinates !== undefined

const mappedLocations = locations.filter(hasCoordinates)

function compareSchedules(a: (typeof schedules)[number], b: (typeof schedules)[number]) {
  return a.date.localeCompare(b.date)
    || (a.orderInDay ?? Infinity) - (b.orderInDay ?? Infinity)
    || (a.startTime ?? '99').localeCompare(b.startTime ?? '99')
    || a.id.localeCompare(b.id)
}

export const locationsById = new Map(mappedLocations.map((location) => [location.id, location]))

export const schedulesByLocation = new Map(
  locations.map((location) => [
    location.id,
    schedules.filter((schedule) => schedule.locationId === location.id).sort(compareSchedules),
  ]),
)

export const videoCallSchedules = schedules
  .filter((schedule) => schedule.eventFormat === 'online' && schedule.locationId === undefined)
  .sort(compareSchedules)

export const locationPoints: FeatureCollection<Point> = {
  type: 'FeatureCollection',
  features: mappedLocations.map((location) => ({
    type: 'Feature',
    geometry: { type: 'Point', coordinates: location.coordinates },
    properties: { locationId: location.id },
  })),
}

const regionLabels: Array<{ countryCode: CountryCode; label: string }> = [
  { countryCode: 'KR', label: '한국' },
  { countryCode: 'CN', label: '중국' },
  { countryCode: 'JP', label: '일본' },
  { countryCode: 'TH', label: '태국' },
]

export const archiveRegions = regionLabels.map(({ countryCode, label }) => {
  const regionLocations = mappedLocations.filter((location) =>
    (location.countryCode ?? 'KR') === countryCode
      && (schedulesByLocation.get(location.id)?.length ?? 0) > 0)
  const scheduleCount = regionLocations.reduce(
    (total, location) => total + (schedulesByLocation.get(location.id)?.length ?? 0),
    0,
  )
  return { countryCode, label, locations: regionLocations, scheduleCount }
}).filter((region) => region.locations.length > 0)

// 지도 중심에서 가장 가까운 일정 장소의 국가를 현재 탐색 지역으로 사용합니다.
export function nearestRegionCode(center: [number, number]): CountryCode {
  const [longitude, latitude] = center
  let nearestCode: CountryCode = 'KR'
  let nearestDistance = Infinity
  for (const region of archiveRegions) {
    for (const location of region.locations) {
      const latitudeScale = Math.cos(((location.coordinates[1] + latitude) / 2) * Math.PI / 180)
      const distance = Math.hypot(
        (location.coordinates[0] - longitude) * latitudeScale,
        location.coordinates[1] - latitude,
      )
      if (distance < nearestDistance) {
        nearestDistance = distance
        nearestCode = region.countryCode
      }
    }
  }
  return nearestCode
}
