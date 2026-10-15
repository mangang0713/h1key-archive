import { useEffect, useRef, useState } from 'react'
import { LngLatBounds, Map as MapLibreMap, Marker, Popup, setWorkerUrl } from 'maplibre-gl'
import type { GeoJSONSource } from 'maplibre-gl'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import 'maplibre-gl/dist/maplibre-gl.css'
import './ArchiveMap.css'
import { createSchedulePopupContent } from './SchedulePopupContent'
import {
  archiveRegions,
  locationPoints,
  locationsById,
  nearestRegionCode,
  schedulesByLocation,
  videoCallSchedules,
  type MappedLocation,
} from './archiveMapData'
import LocationlessSchedulePanel from '../schedule/LocationlessSchedulePanel'
import ArchiveExplorerPanel from '../archive/ArchiveExplorerPanel'
import { schedules } from '../../data/schedules'
import type { CountryCode, Schedule } from '../../types/archive'

setWorkerUrl(workerUrl)

const sourceId = 'archive-locations'
const INITIAL_CAMERA = { center: [127.8, 36.3] as [number, number], zoom: 6, bearing: 0, pitch: 0 }
const DETAIL_ZOOM = 12
const CAMERA_DURATION = 450
type SavedCamera = { center: [number, number]; zoom: number; bearing: number; pitch: number }

function ArchiveMap() {
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const homeButtonRef = useRef<HTMLButtonElement>(null)
  const locationlessButtonRef = useRef<HTMLButtonElement>(null)
  const regionNavigationButtonRef = useRef<HTMLButtonElement>(null)
  const archiveDataButtonRef = useRef<HTMLButtonElement>(null)
  const regionPanelRef = useRef<HTMLElement>(null)
  const dismissMapSelectionRef = useRef<(() => void) | undefined>(undefined)
  const navigateToRegionRef = useRef<((countryCode: CountryCode) => void) | undefined>(undefined)
  const [locationlessOpen, setLocationlessOpen] = useState(false)
  const [locationlessSelected, setLocationlessSelected] = useState<Schedule>()
  const [regionNavigationOpen, setRegionNavigationOpen] = useState(false)
  const [archiveDataOpen, setArchiveDataOpen] = useState(false)
  const [currentRegionCode, setCurrentRegionCode] = useState<CountryCode>('KR')
  const otherRegions = archiveRegions.filter((region) => region.countryCode !== currentRegionCode)

  useEffect(() => {
    if (regionNavigationOpen) regionPanelRef.current?.focus()
  }, [regionNavigationOpen])

  useEffect(() => {
    if (!mapContainerRef.current) return

    const map = new MapLibreMap({
      container: mapContainerRef.current,
      style: 'https://tiles.openfreemap.org/styles/liberty',
      ...INITIAL_CAMERA,
      minPitch: 0,
      maxPitch: 0,
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
    })

    map.touchZoomRotate.disableRotation()

    let disposed = false
    const popup = new Popup({ maxWidth: 'min(300px, calc(100vw - 24px))', offset: 48, anchor: 'bottom' })
    let savedCamera: SavedCamera | undefined
    let selectedLocationId: string | undefined
    let selectedLocationCenter: [number, number] | undefined
    let cameraRequest = 0
    const duration = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : CAMERA_DURATION
    const discardSelection = () => {
      // 처음으로/클러스터 선택은 이전 카메라로 복원하지 않습니다.
      savedCamera = undefined
      selectedLocationId = undefined
      selectedLocationCenter = undefined
      popup.remove()
    }
    let popupEvents: AbortController | undefined
    const clearPopupEvents = () => {
      popupEvents?.abort()
      popupEvents = undefined
    }
    const closeSelection = () => {
      clearPopupEvents()
      const previous = savedCamera
      const selectedCenter = selectedLocationCenter
      savedCamera = undefined
      selectedLocationId = undefined
      selectedLocationCenter = undefined
      if (disposed || !previous) return
      cameraRequest++
      map.stop()
      map.easeTo({ ...previous, center: selectedCenter ?? previous.center, duration: duration() })
      map.getCanvas().focus()
    }
    dismissMapSelectionRef.current = () => {
      if (popup.isOpen()) popup.remove()
      else closeSelection()
    }
    popup.on('close', closeSelection)
    const runCameraTransition = (
      request: number,
      milliseconds: number,
      apply: (durationMs: number) => void,
    ) => new Promise<boolean>((resolve) => {
      if (disposed || request !== cameraRequest) {
        resolve(false)
        return
      }
      const durationMs = duration() === 0 ? 0 : milliseconds
      if (durationMs === 0) {
        apply(0)
        resolve(!disposed && request === cameraRequest)
        return
      }
      let completed = false
      const finish = () => {
        if (completed) return
        completed = true
        map.off('moveend', finish)
        resolve(!disposed && request === cameraRequest)
      }
      map.once('moveend', finish)
      apply(durationMs)
      if (!map.isMoving()) finish()
    })
    const navigateToRegion = (countryCode: CountryCode) => {
      const region = archiveRegions.find((candidate) => candidate.countryCode === countryCode)
      if (!region || region.locations.length === 0) return
      setCurrentRegionCode(countryCode)
      const bounds = region.locations.reduce(
        (result, location) => result.extend(location.coordinates),
        new LngLatBounds(region.locations[0].coordinates, region.locations[0].coordinates),
      )
      const request = ++cameraRequest
      map.stop()
      discardSelection()
      setLocationlessOpen(false)
      setLocationlessSelected(undefined)
      setRegionNavigationOpen(false)
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
    navigateToRegionRef.current = navigateToRegion
    const goHome = () => {
      cameraRequest++
      map.stop()
      discardSelection()
      setLocationlessOpen(false)
      setLocationlessSelected(undefined)
      setRegionNavigationOpen(false)
      setCurrentRegionCode('KR')
      map.easeTo({ ...INITIAL_CAMERA, duration: duration() })
    }
    const homeButton = homeButtonRef.current
    homeButton?.addEventListener('click', goHome)

    const openPopup = (location: MappedLocation, selected?: Schedule) => {
      clearPopupEvents()
      popupEvents = new AbortController()
      const signal = popupEvents.signal
      const locationSchedules = schedulesByLocation.get(location.id) ?? []
      const { content, focusTarget } = createSchedulePopupContent({
        location,
        schedules: locationSchedules,
        selected,
        signal,
        onSelect: (schedule) => openPopup(location, schedule),
        onBack: () => openPopup(location),
        onClose: () => popup.remove(),
      })
      popup.setLngLat(location.coordinates).setDOMContent(content)
      if (!popup.isOpen()) popup.addTo(map)
      // 상세 제목 또는 첫 목록 항목으로 포커스를 이동합니다.
      focusTarget.focus()
    }

    const selectLocation = (location: MappedLocation) => {
      setLocationlessOpen(false)
      setLocationlessSelected(undefined)
      setRegionNavigationOpen(false)
      cameraRequest++
      if (selectedLocationId !== location.id) {
        map.stop()
        const center = map.getCenter()
        savedCamera = {
          center: [center.lng, center.lat],
          zoom: map.getZoom(),
          bearing: map.getBearing(),
          pitch: map.getPitch(),
        }
        selectedLocationId = location.id
        // 핀을 화면 아래쪽에 두고 위쪽 Popup을 위한 공간을 확보합니다.
        map.easeTo({
          center: location.coordinates,
          zoom: Math.max(DETAIL_ZOOM, map.getZoom()),
          offset: [0, Math.min(map.getContainer().clientHeight * 0.25, 180)],
          duration: duration(),
        })
      }
      selectedLocationCenter = location.coordinates
      const locationSchedules = schedulesByLocation.get(location.id) ?? []
      openPopup(location, locationSchedules.length === 1 ? locationSchedules[0] : undefined)
    }

    const visibleMarkers = new Map<string, { marker: Marker; remove: () => void }>()
    const updateMarkers = () => {
      if (disposed || !map.getSource(sourceId) || !map.isSourceLoaded(sourceId)) return
      const visibleKeys = new Set<string>()
      const bounds = map.getBounds()
      for (const feature of map.querySourceFeatures(sourceId)) {
        if (feature.geometry.type !== 'Point') continue
        const coordinates: [number, number] = [feature.geometry.coordinates[0], feature.geometry.coordinates[1]]
        if (!bounds.contains(coordinates)) continue
        const isCluster = Boolean(feature.properties.cluster)
        const clusterId = Number(feature.properties.cluster_id)
        const locationId = String(feature.properties.locationId)
        const key = isCluster ? `cluster:${clusterId}` : `location:${locationId}`
        if (visibleKeys.has(key)) continue // 타일 경계에서 중복되는 장소·클러스터 제외
        visibleKeys.add(key)
        const existing = visibleMarkers.get(key)
        if (existing) {
          continue
        }

        const location = locationsById.get(locationId)
        const locationSchedules = schedulesByLocation.get(locationId) ?? []
        if (!isCluster && !location) continue
        const count = isCluster ? Number(feature.properties.point_count) : locationSchedules.length
        const button = document.createElement('button')
        button.type = 'button'
        const isSingleSchedule = !isCluster && count === 1
        button.className = isCluster ? 'cluster-marker' : 'pin-marker'
        if (!isCluster) {
          const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
          svg.setAttribute('viewBox', '0 0 44 44')
          svg.setAttribute('aria-hidden', 'true')
          const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
          path.setAttribute('d', 'M22 2C12 2 6 9 6 18c0 11 16 24 16 24s16-13 16-24C38 9 32 2 22 2Z')
          const center = document.createElementNS('http://www.w3.org/2000/svg', isSingleSchedule ? 'circle' : 'text')
          if (isSingleSchedule) {
            center.setAttribute('cx', '22')
            center.setAttribute('cy', '18')
            center.setAttribute('r', '6')
          } else {
            center.setAttribute('x', '22')
            center.setAttribute('y', '23')
            center.setAttribute('text-anchor', 'middle')
            center.textContent = String(count)
          }
          svg.append(path, center)
          button.append(svg)
        } else {
          button.textContent = String(count)
        }
        button.setAttribute('aria-label', isCluster
          ? `가까운 장소 ${count}곳, 확대하여 장소 보기`
          : `${location!.name}, 스케줄 ${count}개 보기`)
        if (!isCluster) button.setAttribute('aria-haspopup', 'dialog')
        const events = new AbortController()
        const selectMarker = async (event: MouseEvent) => {
          // 새 Popup이 동일한 클릭으로 즉시 닫히는 것을 방지합니다.
          event.stopPropagation()
          if (!isCluster) {
            if (location) selectLocation(location)
            return
          }
          const request = ++cameraRequest
          map.stop()
          discardSelection()
          try {
            const source = map.getSource(sourceId) as GeoJSONSource
            const zoom = await source.getClusterExpansionZoom(clusterId)
            if (disposed || events.signal.aborted || request !== cameraRequest) return
            map.easeTo({ center: coordinates, zoom: Math.min(zoom, map.getMaxZoom()), duration: duration() })
          } catch (error) {
            if (!disposed && !events.signal.aborted) console.error('장소 클러스터 확대 실패', error)
          }
        }
        button.addEventListener('click', selectMarker, { signal: events.signal })
        const marker = new Marker({ element: button, anchor: isCluster ? 'center' : 'bottom' })
          .setLngLat(coordinates).addTo(map)
        visibleMarkers.set(key, { marker, remove: () => {
          events.abort()
          marker.remove()
        } })
      }
      for (const [key, entry] of visibleMarkers) {
        if (!visibleKeys.has(key)) {
          entry.remove()
          visibleMarkers.delete(key)
        }
      }
    }

    const addLocations = () => {
      map.addSource(sourceId, {
        type: 'geojson',
        data: locationPoints,
        cluster: true,
        clusterRadius: 35,
        clusterMaxZoom: 14,
      })
      // HTML 버튼 마커를 사용하되, 소스 타일은 지도 레이어를 통해 로드합니다.
      map.addLayer({
        id: 'archive-location-source',
        type: 'circle',
        source: sourceId,
        paint: { 'circle-radius': 0, 'circle-opacity': 0 },
      })
    }
    map.on('load', addLocations)
    map.on('render', updateMarkers)
    const updateCurrentRegion = () => {
      const center = map.getCenter()
      const nextRegion = nearestRegionCode([center.lng, center.lat])
      setCurrentRegionCode((current) => current === nextRegion ? current : nextRegion)
    }
    map.on('moveend', updateCurrentRegion)

    return () => {
      disposed = true
      cameraRequest++
      homeButton?.removeEventListener('click', goHome)
      map.stop()
      map.off('load', addLocations)
      map.off('render', updateMarkers)
      map.off('moveend', updateCurrentRegion)
      visibleMarkers.forEach((entry) => entry.remove())
      visibleMarkers.clear()
      popup.remove()
      popup.off('close', closeSelection)
      clearPopupEvents()
      dismissMapSelectionRef.current = undefined
      navigateToRegionRef.current = undefined
      map.remove()
    }
  }, [])

  return (
    <main
      className="archive-map"
      onPointerDown={(event) => {
        if ((!locationlessOpen && !archiveDataOpen) || !(event.target instanceof Element)) return
        if (event.target.closest('#locationless-schedules, #archive-data-panel, .archive-explorer-actions')) return
        if (locationlessOpen) {
          setLocationlessOpen(false)
          setLocationlessSelected(undefined)
        }
        if (archiveDataOpen) setArchiveDataOpen(false)
      }}
    >
      <div
        ref={mapContainerRef}
        className="map-container"
        role="region"
        aria-label="H1-KEY Activity Archive 대한민국 지도"
      />
      <button ref={homeButtonRef} type="button" className="map-home" aria-label="처음으로: 대한민국 초기 지도" title="처음으로">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 10 12 3l9 7v11h-6v-7H9v7H3Z" /></svg>
        <span>처음으로</span>
      </button>
      {(otherRegions.length > 0 || videoCallSchedules.length > 0 || schedules.length > 0) && (
        <section className="archive-explorer" aria-label="아카이브 탐색">
          <h2 className="archive-explorer-title">아카이브 탐색</h2>
          <div className="archive-explorer-actions">
            {otherRegions.length > 0 && (
              <button
                ref={regionNavigationButtonRef}
                type="button"
                className="archive-explorer-action"
                aria-expanded={regionNavigationOpen}
                aria-controls="region-navigation-panel"
                onClick={() => {
                  if (!regionNavigationOpen) {
                    setLocationlessOpen(false)
                    setLocationlessSelected(undefined)
                    setArchiveDataOpen(false)
                  }
                  setRegionNavigationOpen((open) => !open)
                }}
              >
                <span className="archive-explorer-icon archive-explorer-icon-region" aria-hidden="true">
                  <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18" /></svg>
                </span>
                <span className="archive-explorer-label">지역 이동</span>
                <span className="archive-explorer-count">{otherRegions.length}개국</span>
              </button>
            )}
            {videoCallSchedules.length > 0 && (
              <button
                ref={locationlessButtonRef}
                type="button"
                className="archive-explorer-action"
                aria-label={`영상통화 일정 ${videoCallSchedules.length}건`}
                aria-expanded={locationlessOpen}
                aria-controls="locationless-schedules"
                onClick={() => {
                  if (!locationlessOpen) {
                    dismissMapSelectionRef.current?.()
                    setRegionNavigationOpen(false)
                    setArchiveDataOpen(false)
                  }
                  setLocationlessSelected(undefined)
                  setLocationlessOpen((open) => !open)
                }}
              >
                <span className="archive-explorer-icon archive-explorer-icon-video" aria-hidden="true">
                  <svg viewBox="0 0 24 24"><rect x="3" y="6" width="12" height="12" rx="3" /><path d="m15 10 6-3v10l-6-3" /></svg>
                </span>
                <span className="archive-explorer-label">영상통화</span>
                <span className="archive-explorer-count">{videoCallSchedules.length}건</span>
              </button>
            )}
            <button
              ref={archiveDataButtonRef}
              type="button"
              className="archive-explorer-action"
              aria-label={`전체 일정 및 곡 기록 ${schedules.length}건`}
              aria-expanded={archiveDataOpen}
              aria-controls="archive-data-panel"
              onClick={() => {
                if (!archiveDataOpen) {
                  dismissMapSelectionRef.current?.()
                  setLocationlessOpen(false)
                  setLocationlessSelected(undefined)
                  setRegionNavigationOpen(false)
                }
                setArchiveDataOpen((open) => !open)
              }}
            >
              <span className="archive-explorer-icon archive-explorer-icon-data" aria-hidden="true">
                <svg viewBox="0 0 24 24"><path d="M4 5h16M4 12h16M4 19h16" /><circle cx="8" cy="5" r="1" /><circle cx="15" cy="12" r="1" /><circle cx="10" cy="19" r="1" /></svg>
              </span>
              <span className="archive-explorer-label">전체 기록</span>
              <span className="archive-explorer-count">{schedules.length}건</span>
            </button>
          </div>
          {regionNavigationOpen && (
            <aside
              ref={regionPanelRef}
              id="region-navigation-panel"
              className="region-navigation-panel"
              aria-label="이동할 지역 선택"
              tabIndex={-1}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  setRegionNavigationOpen(false)
                  regionNavigationButtonRef.current?.focus()
                }
              }}
            >
              <header>
                <h2>이동할 지역 선택</h2>
                <button
                  type="button"
                  className="region-navigation-close"
                  aria-label="지역 선택 메뉴 닫기"
                  onClick={() => {
                    setRegionNavigationOpen(false)
                    regionNavigationButtonRef.current?.focus()
                  }}
                >×</button>
              </header>
              <ul>
                {otherRegions.map((region) => (
                  <li key={region.countryCode}>
                    <button
                      type="button"
                      className="region-navigation-choice"
                      onClick={() => navigateToRegionRef.current?.(region.countryCode)}
                    >
                      <strong>{region.label}</strong>
                      <span>장소 {region.locations.length}곳 · 일정 {region.scheduleCount}건</span>
                    </button>
                  </li>
                ))}
              </ul>
            </aside>
          )}
          {locationlessOpen && (
            <LocationlessSchedulePanel
              schedules={videoCallSchedules}
              selected={locationlessSelected}
              onSelect={setLocationlessSelected}
              onBack={() => setLocationlessSelected(undefined)}
              onClose={() => {
                setLocationlessOpen(false)
                setLocationlessSelected(undefined)
                locationlessButtonRef.current?.focus()
              }}
            />
          )}
          {archiveDataOpen && (
            <ArchiveExplorerPanel
              onClose={() => {
                setArchiveDataOpen(false)
                archiveDataButtonRef.current?.focus()
              }}
            />
          )}
        </section>
      )}
    </main>
  )
}

export default ArchiveMap

