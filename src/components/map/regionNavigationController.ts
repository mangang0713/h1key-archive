import { LngLatBounds, Map as MapLibreMap } from 'maplibre-gl'
import { archiveRegions } from './archiveMapData'
import type { CountryCode } from '../../types/archive'

type RegionNavigationControllerOptions = {
  map: MapLibreMap
  duration: () => number
  discardSelection: () => void
  nextCameraRequest: () => number
  isCameraRequestCurrent: (request: number) => boolean
  onNavigateStart: (countryCode: CountryCode) => void
}

export function createRegionNavigationController({
  map,
  duration,
  discardSelection,
  nextCameraRequest,
  isCameraRequestCurrent,
  onNavigateStart,
}: RegionNavigationControllerOptions) {
  const runCameraTransition = (
    request: number,
    milliseconds: number,
    apply: (durationMs: number) => void,
  ) => new Promise<boolean>((resolve) => {
    if (!isCameraRequestCurrent(request)) {
      resolve(false)
      return
    }
    const durationMs = duration() === 0 ? 0 : milliseconds
    if (durationMs === 0) {
      apply(0)
      resolve(isCameraRequestCurrent(request))
      return
    }
    let completed = false
    const finish = () => {
      if (completed) return
      completed = true
      map.off('moveend', finish)
      resolve(isCameraRequestCurrent(request))
    }
    map.once('moveend', finish)
    apply(durationMs)
    if (!map.isMoving()) finish()
  })

  const navigate = (countryCode: CountryCode) => {
    const region = archiveRegions.find((candidate) => candidate.countryCode === countryCode)
    if (!region || region.locations.length === 0) return

    onNavigateStart(countryCode)
    const bounds = region.locations.reduce(
      (result, location) => result.extend(location.coordinates),
      new LngLatBounds(region.locations[0].coordinates, region.locations[0].coordinates),
    )
    const request = nextCameraRequest()
    map.stop()
    discardSelection()
    const current = map.getCenter()
    const overviewZoom = Math.min(map.getZoom(), 3.5)

    const transition = async () => {
      const zoomedOut = await runCameraTransition(request, 300, (durationMs) => {
        const camera = { center: [current.lng, current.lat] as [number, number], zoom: overviewZoom, bearing: 0, pitch: 0 }
        if (durationMs === 0) map.jumpTo(camera)
        else map.easeTo({ ...camera, duration: durationMs })
      })
      if (!zoomedOut) return

      const movedAcross = await runCameraTransition(request, 480, (durationMs) => {
        const camera = { center: bounds.getCenter().toArray() as [number, number], zoom: overviewZoom, bearing: 0, pitch: 0 }
        if (durationMs === 0) map.jumpTo(camera)
        else map.easeTo({ ...camera, duration: durationMs })
      })
      if (!movedAcross) return

      await runCameraTransition(request, 500, (durationMs) => {
        map.fitBounds(bounds, {
          padding: { top: 88, right: 84, bottom: 88, left: 24 },
          maxZoom: 8,
          duration: durationMs,
        })
      })
    }

    void transition()
  }

  return { navigate }
}
