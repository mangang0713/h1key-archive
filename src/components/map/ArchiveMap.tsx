import { useEffect, useRef, useState } from 'react'
import { Map as MapLibreMap, Marker, Popup, setWorkerUrl } from 'maplibre-gl'
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
import ArchiveExplorerControls from './ArchiveExplorerControls'
import TimeTravelPanel from './TimeTravelPanel'
import type { RegionNavigationOption } from './RegionNavigationPanel'
import { createLocationMarkerElement } from './createLocationMarkerElement'
import {
  createTimeTravelController,
  JOURNEY_STOP_DELAY_MS,
  timeTravelSchedules,
  type TimeTravelSpeed,
  type TimeTravelController,
} from './timeTravelController'
import { createRegionNavigationController } from './regionNavigationController'
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
  const timeTravelButtonRef = useRef<HTMLButtonElement>(null)
  const dismissMapSelectionRef = useRef<(() => void) | undefined>(undefined)
  const navigateToRegionRef = useRef<((countryCode: CountryCode) => void) | undefined>(undefined)
  const timeTravelControllerRef = useRef<TimeTravelController | undefined>(undefined)
  const [locationlessOpen, setLocationlessOpen] = useState(false)
  const [locationlessSelected, setLocationlessSelected] = useState<Schedule>()
  const [regionNavigationOpen, setRegionNavigationOpen] = useState(false)
  const [archiveDataOpen, setArchiveDataOpen] = useState(false)
  const [timeTravelOpen, setTimeTravelOpen] = useState(false)
  const [timeTravelPlaying, setTimeTravelPlaying] = useState(false)
  const [timeTravelMoving, setTimeTravelMoving] = useState(false)
  const [timeTravelPausedOnRoute, setTimeTravelPausedOnRoute] = useState(false)
  const [timeTravelIndex, setTimeTravelIndex] = useState<number | null>(null)
  const [timeTravelSpeed, setTimeTravelSpeed] = useState<TimeTravelSpeed>(2)
  const timeTravelSpeedRef = useRef<TimeTravelSpeed>(2)
  const selectedTimeTravelSpeedRef = useRef<TimeTravelSpeed>(2)
  const currentTimeTravelIndex = timeTravelIndex ?? 0
  const [currentRegionCode, setCurrentRegionCode] = useState<CountryCode>('KR')
  const otherRegions = archiveRegions.filter((region) => region.countryCode !== currentRegionCode)
  const otherRegionOptions: RegionNavigationOption[] = otherRegions.map((region) => ({
    countryCode: region.countryCode,
    label: region.label,
    locationCount: region.locations.length,
    scheduleCount: region.scheduleCount,
  }))
  const activeTimeTravelSchedule = timeTravelIndex === null ? undefined : timeTravelSchedules[timeTravelIndex]

  useEffect(() => {
    if (!timeTravelOpen || !activeTimeTravelSchedule) return
    timeTravelSpeedRef.current = selectedTimeTravelSpeedRef.current
    timeTravelControllerRef.current?.focus(activeTimeTravelSchedule)
  }, [activeTimeTravelSchedule, timeTravelOpen])

  useEffect(() => {
    if (!timeTravelOpen || !timeTravelPlaying || timeTravelMoving || timeTravelPausedOnRoute || timeTravelIndex === null) return
    const timer = window.setTimeout(() => {
      if (timeTravelIndex >= timeTravelSchedules.length - 1) setTimeTravelPlaying(false)
      else setTimeTravelIndex(timeTravelIndex + 1)
    }, JOURNEY_STOP_DELAY_MS / timeTravelSpeedRef.current)
    return () => window.clearTimeout(timer)
  }, [timeTravelIndex, timeTravelMoving, timeTravelOpen, timeTravelPausedOnRoute, timeTravelPlaying])

  useEffect(() => {
    if (!mapContainerRef.current) return

    const map = new MapLibreMap({
      container: mapContainerRef.current,
      style: 'https://tiles.openfreemap.org/styles/liberty',
      ...INITIAL_CAMERA,
      minPitch: 0,
      maxPitch: 0,
      // 이동·확대 중 이전 배율 타일을 유지해 새 타일 로딩 동안 지도가 비어 보이지 않게 합니다.
      cancelPendingTileRequestsWhileZooming: false,
      // 시간순 탐방에서 이미 지난 지역의 타일을 기본값보다 조금 더 오래 보관합니다.
      maxTileCacheZoomLevels: 6,
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
    })

    map.touchZoomRotate.disableRotation()

    let disposed = false
    const popup = new Popup({
      className: 'archive-schedule-popup',
      maxWidth: 'min(380px, calc(100vw - 24px))',
      offset: 48,
      anchor: 'bottom',
    })
    let savedCamera: SavedCamera | undefined
    let selectedLocationId: string | undefined
    let selectedLocationCenter: [number, number] | undefined
    const visibleMarkers = new Map<string, { marker: Marker; remove: () => void }>()
    let cameraRequest = 0
    const duration = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : CAMERA_DURATION
    const discardSelection = () => {
      // 처음으로/클러스터 선택은 이전 카메라로 복원하지 않습니다.
      savedCamera = undefined
      selectedLocationId = undefined
      selectedLocationCenter = undefined
      popup.remove()
    }
    const highlightTimeTravelLocation = (locationId?: string) => {
      for (const [key, entry] of visibleMarkers) {
        entry.marker.getElement().classList.toggle('journey-active-marker', key === `location:${locationId}`)
      }
    }
    const clearVisibleLocationMarkers = () => {
      visibleMarkers.forEach((entry) => entry.remove())
      visibleMarkers.clear()
    }
    const timeTravelController = createTimeTravelController({
      map,
      duration,
      playbackSpeed: () => timeTravelSpeedRef.current,
      invalidateOtherCameraTransitions: () => {
        cameraRequest++
      },
      discardSelection,
      clearVisibleLocationMarkers,
      highlightLocation: highlightTimeTravelLocation,
      onStart: () => {
        setLocationlessOpen(false)
        setLocationlessSelected(undefined)
        setRegionNavigationOpen(false)
        setArchiveDataOpen(false)
      },
      setOpen: setTimeTravelOpen,
      setPlaying: setTimeTravelPlaying,
      setMoving: setTimeTravelMoving,
      setPausedOnRoute: setTimeTravelPausedOnRoute,
      setIndex: setTimeTravelIndex,
      setCurrentRegionCode,
    })
    timeTravelControllerRef.current = timeTravelController
    const regionNavigationController = createRegionNavigationController({
      map,
      duration,
      discardSelection,
      nextCameraRequest: () => ++cameraRequest,
      isCameraRequestCurrent: (request) => !disposed && request === cameraRequest,
      onNavigateStart: (countryCode) => {
        timeTravelController.stop(false)
        setCurrentRegionCode(countryCode)
        setLocationlessOpen(false)
        setLocationlessSelected(undefined)
        setRegionNavigationOpen(false)
      },
    })
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
    navigateToRegionRef.current = regionNavigationController.navigate
    const goHome = () => {
      timeTravelController.stop(false)
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
      timeTravelController.stop(false)
      setLocationlessOpen(false)
      setLocationlessSelected(undefined)
      setRegionNavigationOpen(false)
      setArchiveDataOpen(false)
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

    const updateMarkers = () => {
      if (disposed || !map.getSource(sourceId) || !map.isSourceLoaded(sourceId)) return
      if (timeTravelController.isRunning()) {
        clearVisibleLocationMarkers()
        return
      }
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
        const button = createLocationMarkerElement({
          isCluster,
          count,
          locationName: location?.name,
          isActiveTimeTravelLocation: !isCluster && locationId === timeTravelController.getActiveLocationId(),
        })
        const events = new AbortController()
        const selectMarker = async (event: MouseEvent) => {
          // 새 Popup이 동일한 클릭으로 즉시 닫히는 것을 방지합니다.
          event.stopPropagation()
          timeTravelController.stop(false)
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
      timeTravelController.dispose()
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
      timeTravelControllerRef.current = undefined
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
      {timeTravelOpen && activeTimeTravelSchedule && (
        <TimeTravelPanel
          schedule={activeTimeTravelSchedule}
          locationName={activeTimeTravelSchedule.locationId
            ? locationsById.get(activeTimeTravelSchedule.locationId)?.name ?? '장소 정보 없음'
            : '지도 위치 미등록'}
          index={currentTimeTravelIndex}
          total={timeTravelSchedules.length}
          playing={timeTravelPlaying}
          moving={timeTravelMoving}
          pausedOnRoute={timeTravelPausedOnRoute}
          speed={timeTravelSpeed}
          onSpeedChange={(speed) => {
            selectedTimeTravelSpeedRef.current = speed
            setTimeTravelSpeed(speed)
          }}
          onClose={() => {
            timeTravelControllerRef.current?.stop(true)
            timeTravelButtonRef.current?.focus()
          }}
          onPrevious={() => {
            setTimeTravelPlaying(false)
            setTimeTravelPausedOnRoute(false)
            setTimeTravelIndex(Math.max(0, currentTimeTravelIndex - 1))
          }}
          onTogglePlayback={() => {
            if (timeTravelPlaying) {
              setTimeTravelPlaying(false)
              if (timeTravelMoving) {
                setTimeTravelPausedOnRoute(true)
                timeTravelControllerRef.current?.pauseMovement()
              }
              return
            }
            if (timeTravelPausedOnRoute) {
              setTimeTravelPausedOnRoute(false)
              timeTravelControllerRef.current?.focus(activeTimeTravelSchedule)
            } else if (currentTimeTravelIndex === timeTravelSchedules.length - 1) {
              setTimeTravelIndex(0)
            }
            setTimeTravelPlaying(true)
          }}
          onNext={() => {
            setTimeTravelPlaying(false)
            setTimeTravelPausedOnRoute(false)
            setTimeTravelIndex(Math.min(timeTravelSchedules.length - 1, currentTimeTravelIndex + 1))
          }}
        />
      )}
      <ArchiveExplorerControls
        regions={otherRegionOptions}
        videoCallSchedules={videoCallSchedules}
        scheduleCount={schedules.length}
        timeTravelCount={timeTravelSchedules.length}
        regionNavigationOpen={regionNavigationOpen}
        locationlessOpen={locationlessOpen}
        locationlessSelected={locationlessSelected}
        archiveDataOpen={archiveDataOpen}
        timeTravelButtonRef={timeTravelButtonRef}
        regionNavigationButtonRef={regionNavigationButtonRef}
        locationlessButtonRef={locationlessButtonRef}
        archiveDataButtonRef={archiveDataButtonRef}
        onStartTimeTravel={() => timeTravelControllerRef.current?.start()}
        onToggleRegionNavigation={() => {
          timeTravelControllerRef.current?.stop(false)
          if (!regionNavigationOpen) {
            setLocationlessOpen(false)
            setLocationlessSelected(undefined)
            setArchiveDataOpen(false)
          }
          setRegionNavigationOpen((open) => !open)
        }}
        onCloseRegionNavigation={() => {
          setRegionNavigationOpen(false)
          regionNavigationButtonRef.current?.focus()
        }}
        onSelectRegion={(countryCode) => navigateToRegionRef.current?.(countryCode)}
        onToggleLocationless={() => {
          timeTravelControllerRef.current?.stop(false)
          if (!locationlessOpen) {
            dismissMapSelectionRef.current?.()
            setRegionNavigationOpen(false)
            setArchiveDataOpen(false)
          }
          setLocationlessSelected(undefined)
          setLocationlessOpen((open) => !open)
        }}
        onSelectLocationlessSchedule={setLocationlessSelected}
        onBackLocationless={() => setLocationlessSelected(undefined)}
        onCloseLocationless={() => {
          setLocationlessOpen(false)
          setLocationlessSelected(undefined)
          locationlessButtonRef.current?.focus()
        }}
        onToggleArchiveData={() => {
          timeTravelControllerRef.current?.stop(false)
          if (!archiveDataOpen) {
            dismissMapSelectionRef.current?.()
            setLocationlessOpen(false)
            setLocationlessSelected(undefined)
            setRegionNavigationOpen(false)
          }
          setArchiveDataOpen((open) => !open)
        }}
        onCloseArchiveData={() => {
          setArchiveDataOpen(false)
          archiveDataButtonRef.current?.focus()
        }}
      />
    </main>
  )
}

export default ArchiveMap

