import { Map as MapLibreMap, Marker } from 'maplibre-gl'
import { schedules } from '../../data/schedules'
import type { Schedule } from '../../types/archive'
import { locationsById, nearestRegionCode } from './archiveMapData'

const JOURNEY_CAMERA_DURATION = 1500
const JOURNEY_STOP_DELAY = 1800
const JOURNEY_TILE_WAIT_MAX = 1500
const JOURNEY_MIN_ZOOM = 7.5
const JOURNEY_MAX_ZOOM = 13
const JOURNEY_START_DATE = '2026-02-21'

const todayInKorea = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Asia/Seoul',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
}).format(new Date())

export const timeTravelSchedules = schedules
  .filter((schedule) => schedule.date >= JOURNEY_START_DATE && schedule.date <= todayInKorea)
  .sort((a, b) => a.date.localeCompare(b.date)
    || (a.orderInDay ?? Infinity) - (b.orderInDay ?? Infinity)
    || (a.startTime ?? '99:99').localeCompare(b.startTime ?? '99:99')
    || a.id.localeCompare(b.id))

type SavedCamera = { center: [number, number]; zoom: number; bearing: number; pitch: number }

export type TimeTravelController = {
  start: () => void
  stop: (restoreCamera: boolean) => void
  pauseMovement: () => void
  focus: (schedule: Schedule) => void
  getActiveLocationId: () => string | undefined
  isRunning: () => boolean
  dispose: () => void
}

type TimeTravelControllerOptions = {
  map: MapLibreMap
  duration: () => number
  invalidateOtherCameraTransitions: () => void
  discardSelection: () => void
  clearVisibleLocationMarkers: () => void
  highlightLocation: (locationId?: string) => void
  onStart: () => void
  setOpen: (value: boolean) => void
  setPlaying: (value: boolean) => void
  setMoving: (value: boolean) => void
  setPausedOnRoute: (value: boolean) => void
  setIndex: (value: number | null) => void
  setCurrentRegionCode: (value: ReturnType<typeof nearestRegionCode>) => void
}

export function createTimeTravelController({
  map,
  duration,
  invalidateOtherCameraTransitions,
  discardSelection,
  clearVisibleLocationMarkers,
  highlightLocation,
  onStart,
  setOpen,
  setPlaying,
  setMoving,
  setPausedOnRoute,
  setIndex,
  setCurrentRegionCode,
}: TimeTravelControllerOptions): TimeTravelController {
  let disposed = false
  let timeTravelCamera: SavedCamera | undefined
  let activeLocationId: string | undefined
  let journeyLocationMarker: Marker | undefined
  let lastJourneyCoordinates: [number, number] | undefined
  let journeyAnimationFrame: number | undefined
  let cameraRequest = 0
  let journeyTileWaitTimeout: number | undefined
  let journeyIdleHandler: (() => void) | undefined
  const visitedScheduleMarkers = new Map<string, Marker>()

  const cancelJourneyTileWait = () => {
    if (journeyTileWaitTimeout !== undefined) {
      window.clearTimeout(journeyTileWaitTimeout)
      journeyTileWaitTimeout = undefined
    }
    if (journeyIdleHandler) {
      map.off('idle', journeyIdleHandler)
      journeyIdleHandler = undefined
    }
  }

  const clearJourneyMarkers = () => {
    visitedScheduleMarkers.forEach((marker) => marker.remove())
    visitedScheduleMarkers.clear()
  }

  const revealScheduleMarker = (schedule: Schedule, coordinates: [number, number]) => {
    if (disposed || !timeTravelCamera || visitedScheduleMarkers.has(schedule.id)) return
    const eventMarker = document.createElement('div')
    eventMarker.className = 'journey-visited-marker'
    eventMarker.setAttribute('aria-hidden', 'true')
    eventMarker.title = `${schedule.date} ${schedule.title}`
    const markerLabel = document.createElement('span')
    markerLabel.textContent = String(visitedScheduleMarkers.size + 1)
    eventMarker.append(markerLabel)
    const marker = new Marker({ element: eventMarker, anchor: 'bottom' })
      .setLngLat(coordinates)
      .addTo(map)
    visitedScheduleMarkers.set(schedule.id, marker)
  }

  const clearJourneyLocation = () => {
    highlightLocation(undefined)
    activeLocationId = undefined
    journeyLocationMarker?.remove()
    journeyLocationMarker = undefined
    lastJourneyCoordinates = undefined
    clearJourneyMarkers()
    map.triggerRepaint()
  }

  const cancelMovement = () => {
    cameraRequest++
    invalidateOtherCameraTransitions()
    cancelJourneyTileWait()
    map.stop()
    if (journeyAnimationFrame !== undefined) {
      window.cancelAnimationFrame(journeyAnimationFrame)
      journeyAnimationFrame = undefined
    }
    setMoving(false)
  }

  const zoomForDistance = (from: [number, number], to: [number, number]) => {
    const radians = Math.PI / 180
    const [fromLongitude, fromLatitude] = from.map((coordinate) => coordinate * radians)
    const [toLongitude, toLatitude] = to.map((coordinate) => coordinate * radians)
    const latitudeDelta = toLatitude - fromLatitude
    const longitudeDelta = toLongitude - fromLongitude
    const haversine = Math.min(1, Math.sin(latitudeDelta / 2) ** 2
      + Math.cos(fromLatitude) * Math.cos(toLatitude) * Math.sin(longitudeDelta / 2) ** 2)
    const distanceMeters = 6_371_000 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine))
    if (distanceMeters < 30) return map.getZoom()
    const averageLatitude = (fromLatitude + toLatitude) / 2
    const worldPixelsPerZoomZero = 78_271.51696 * Math.cos(averageLatitude)
    const targetZoom = Math.log2(
      (map.getContainer().clientWidth * worldPixelsPerZoomZero) / (distanceMeters * 0.68),
    )
    return Math.max(JOURNEY_MIN_ZOOM, Math.min(JOURNEY_MAX_ZOOM, targetZoom))
  }

  const stop = (restoreCamera: boolean) => {
    const previous = timeTravelCamera
    timeTravelCamera = undefined
    cancelJourneyTileWait()
    if (previous) {
      cameraRequest++
      invalidateOtherCameraTransitions()
      map.stop()
    }
    if (journeyAnimationFrame !== undefined) {
      window.cancelAnimationFrame(journeyAnimationFrame)
      journeyAnimationFrame = undefined
    }
    clearJourneyLocation()
    setOpen(false)
    setPlaying(false)
    setMoving(false)
    setPausedOnRoute(false)
    setIndex(null)
    if (!disposed && restoreCamera && previous) map.easeTo({ ...previous, duration: duration() })
  }

  const start = () => {
    if (timeTravelSchedules.length === 0 || disposed) return
    cameraRequest++
    invalidateOtherCameraTransitions()
    cancelJourneyTileWait()
    map.stop()
    discardSelection()
    timeTravelCamera = {
      center: [map.getCenter().lng, map.getCenter().lat],
      zoom: map.getZoom(),
      bearing: map.getBearing(),
      pitch: map.getPitch(),
    }
    clearVisibleLocationMarkers()
    clearJourneyMarkers()
    map.triggerRepaint()
    onStart()
    setIndex(0)
    setMoving(false)
    setPausedOnRoute(false)
    setPlaying(true)
    setOpen(true)
  }

  const focus = (schedule: Schedule) => {
    if (!timeTravelCamera || disposed) return
    cancelJourneyTileWait()
    const location = schedule.locationId ? locationsById.get(schedule.locationId) : undefined
    highlightLocation(location?.id)
    activeLocationId = location?.id
    if (!location) {
      const markerPosition = journeyLocationMarker?.getLngLat()
      if (markerPosition) lastJourneyCoordinates = markerPosition.toArray() as [number, number]
      cameraRequest++
      invalidateOtherCameraTransitions()
      map.stop()
      if (journeyAnimationFrame !== undefined) {
        window.cancelAnimationFrame(journeyAnimationFrame)
        journeyAnimationFrame = undefined
      }
      journeyLocationMarker?.remove()
      journeyLocationMarker = undefined
      setMoving(false)
      return
    }

    const targetCoordinates = location.coordinates
    const markerPosition = journeyLocationMarker?.getLngLat()
    const fromCoordinates = markerPosition
      ? markerPosition.toArray() as [number, number]
      : lastJourneyCoordinates ?? [map.getCenter().lng, map.getCenter().lat]
    lastJourneyCoordinates = targetCoordinates
    if (!journeyLocationMarker) {
      const markerElement = document.createElement('div')
      markerElement.className = 'journey-location-marker'
      markerElement.setAttribute('aria-hidden', 'true')
      const carIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
      carIcon.setAttribute('viewBox', '0 0 36 36')
      carIcon.setAttribute('aria-hidden', 'true')
      const carBody = document.createElementNS('http://www.w3.org/2000/svg', 'path')
      carBody.setAttribute('d', 'M11 4h14l5 10v14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V14l5-10Zm1.3 3-3.5 8h18.4l-3.5-8H12.3ZM9 18v8h18v-8H9Z')
      carBody.setAttribute('fill', '#fff')
      const windshield = document.createElementNS('http://www.w3.org/2000/svg', 'path')
      windshield.setAttribute('d', 'm12 9-2 5h16l-2-5H12Z')
      windshield.setAttribute('fill', '#0f766e')
      carIcon.append(carBody, windshield)
      markerElement.append(carIcon)
      journeyLocationMarker = new Marker({ element: markerElement, anchor: 'center' })
        .setLngLat(fromCoordinates)
        .addTo(map)
    }

    const request = ++cameraRequest
    invalidateOtherCameraTransitions()
    map.stop()
    if (journeyAnimationFrame !== undefined) {
      window.cancelAnimationFrame(journeyAnimationFrame)
      journeyAnimationFrame = undefined
    }
    const motionDuration = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      ? 0
      : JOURNEY_CAMERA_DURATION
    const targetZoom = zoomForDistance(fromCoordinates, targetCoordinates)
    const finishArrival = () => {
      journeyLocationMarker?.setLngLat(targetCoordinates)
      const finishTileWait = () => {
        cancelJourneyTileWait()
        if (disposed || request !== cameraRequest) return
        revealScheduleMarker(schedule, targetCoordinates)
        setMoving(false)
      }
      setMoving(true)
      journeyIdleHandler = finishTileWait
      map.on('idle', finishTileWait)
      journeyTileWaitTimeout = window.setTimeout(finishTileWait, JOURNEY_TILE_WAIT_MAX)
      map.jumpTo({ center: targetCoordinates, zoom: targetZoom, bearing: 0, pitch: 0 })
    }

    if (motionDuration > 0 && (
      fromCoordinates[0] !== targetCoordinates[0] || fromCoordinates[1] !== targetCoordinates[1]
    )) {
      setMoving(true)
      const startedAt = performance.now()
      const startZoom = map.getZoom()
      const headingLatitude = ((fromCoordinates[1] + targetCoordinates[1]) / 2) * Math.PI / 180
      const heading = Math.atan2(
        (targetCoordinates[0] - fromCoordinates[0]) * Math.cos(headingLatitude),
        targetCoordinates[1] - fromCoordinates[1],
      ) * 180 / Math.PI
      const carIconElement = journeyLocationMarker.getElement().firstElementChild as SVGElement | null
      if (carIconElement) carIconElement.style.transform = `rotate(${heading}deg)`
      const animate = (now: number) => {
        if (disposed || request !== cameraRequest || !journeyLocationMarker) return
        const progress = Math.min((now - startedAt) / motionDuration, 1)
        const easedProgress = progress * progress * (3 - 2 * progress)
        const position: [number, number] = [
          fromCoordinates[0] + (targetCoordinates[0] - fromCoordinates[0]) * easedProgress,
          fromCoordinates[1] + (targetCoordinates[1] - fromCoordinates[1]) * easedProgress,
        ]
        journeyLocationMarker.setLngLat(position)
        const zoom = startZoom + (targetZoom - startZoom) * easedProgress
        map.jumpTo({ center: position, zoom, bearing: 0, pitch: 0 })
        if (progress < 1) journeyAnimationFrame = window.requestAnimationFrame(animate)
        else {
          journeyAnimationFrame = undefined
          finishArrival()
        }
      }
      journeyAnimationFrame = window.requestAnimationFrame(animate)
    } else finishArrival()

    if (request === cameraRequest) setCurrentRegionCode(nearestRegionCode(location.coordinates))
  }

  return {
    start,
    stop,
    pauseMovement: cancelMovement,
    focus,
    getActiveLocationId: () => activeLocationId,
    isRunning: () => timeTravelCamera !== undefined,
    dispose: () => {
      disposed = true
      timeTravelCamera = undefined
      cameraRequest++
      cancelJourneyTileWait()
      if (journeyAnimationFrame !== undefined) window.cancelAnimationFrame(journeyAnimationFrame)
      journeyAnimationFrame = undefined
      journeyLocationMarker?.remove()
      journeyLocationMarker = undefined
      clearJourneyMarkers()
      highlightLocation(undefined)
      activeLocationId = undefined
    },
  }
}

export const JOURNEY_STOP_DELAY_MS = JOURNEY_STOP_DELAY
