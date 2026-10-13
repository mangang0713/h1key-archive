import { useEffect, useRef, useState } from 'react'
import { LngLatBounds, Map as MapLibreMap, Marker, Popup, setWorkerUrl } from 'maplibre-gl'
import type { GeoJSONSource } from 'maplibre-gl'
import type { FeatureCollection, Point } from 'geojson'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import 'maplibre-gl/dist/maplibre-gl.css'
import './ArchiveMap.css'
import { createSchedulePopupContent } from './SchedulePopupContent'
import { locations } from '../../data/locations'
import { schedules } from '../../data/schedules'
import { songs } from '../../data/songs'
import type { CountryCode, Location, Schedule } from '../../types/archive'

setWorkerUrl(workerUrl)

const sourceId = 'archive-locations'
const INITIAL_CAMERA = { center: [127.8, 36.3] as [number, number], zoom: 6, bearing: 0, pitch: 0 }
const DETAIL_ZOOM = 12
const CAMERA_DURATION = 450
type SavedCamera = { center: [number, number]; zoom: number; bearing: number; pitch: number }
type MappedLocation = Location & { coordinates: [number, number] }
const hasCoordinates = (location: Location): location is MappedLocation => location.coordinates !== undefined
const locationsById = new Map(locations.filter(hasCoordinates).map((location) => [location.id, location]))
const schedulesByLocation = new Map(
  locations.map((location) => [
    location.id,
    schedules.filter((schedule) => schedule.locationId === location.id)
      .sort((a, b) => a.date.localeCompare(b.date)
        || (a.orderInDay ?? Infinity) - (b.orderInDay ?? Infinity)
        || (a.startTime ?? '99').localeCompare(b.startTime ?? '99')
        || a.id.localeCompare(b.id)),
  ]),
)
const videoCallSchedules = schedules
  .filter((schedule) => schedule.eventFormat === 'online' && schedule.locationId === undefined)
  .sort((a, b) => a.date.localeCompare(b.date)
    || (a.orderInDay ?? Infinity) - (b.orderInDay ?? Infinity)
    || (a.startTime ?? '99').localeCompare(b.startTime ?? '99')
    || a.id.localeCompare(b.id))
const songsById = new Map(songs.map((song) => [song.id, song]))
const locationPoints: FeatureCollection<Point> = {
  type: 'FeatureCollection',
  features: locations.filter(hasCoordinates).map((location) => ({
    type: 'Feature',
    geometry: { type: 'Point', coordinates: location.coordinates },
    properties: { locationId: location.id },
  })),
}
const foreignRegionLabels: Array<{ countryCode: Exclude<CountryCode, 'KR'>; label: string }> = [
  { countryCode: 'CN', label: '중국' },
  { countryCode: 'JP', label: '일본' },
  { countryCode: 'TH', label: '태국' },
]
const foreignRegions = foreignRegionLabels.map(({ countryCode, label }) => {
  const regionLocations = locations.filter((location): location is MappedLocation =>
    (location.countryCode ?? 'KR') === countryCode && hasCoordinates(location)
      && (schedulesByLocation.get(location.id)?.length ?? 0) > 0)
  const scheduleCount = regionLocations.reduce(
    (total, location) => total + (schedulesByLocation.get(location.id)?.length ?? 0),
    0,
  )
  return { countryCode, label, locations: regionLocations, scheduleCount }
}).filter((region) => region.locations.length > 0)

function ArchiveMap() {
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const homeButtonRef = useRef<HTMLButtonElement>(null)
  const locationlessButtonRef = useRef<HTMLButtonElement>(null)
  const regionNavigationButtonRef = useRef<HTMLButtonElement>(null)
  const regionPanelRef = useRef<HTMLElement>(null)
  const dismissMapSelectionRef = useRef<(() => void) | undefined>(undefined)
  const navigateToRegionRef = useRef<((countryCode: CountryCode) => void) | undefined>(undefined)
  const [locationlessOpen, setLocationlessOpen] = useState(false)
  const [locationlessSelected, setLocationlessSelected] = useState<Schedule>()
  const [regionNavigationOpen, setRegionNavigationOpen] = useState(false)

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
    let cameraRequest = 0
    const duration = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : CAMERA_DURATION
    const discardSelection = () => {
      // 처음으로/클러스터 선택은 이전 카메라로 복원하지 않습니다.
      savedCamera = undefined
      selectedLocationId = undefined
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
      savedCamera = undefined
      selectedLocationId = undefined
      if (disposed || !previous) return
      cameraRequest++
      map.stop()
      map.easeTo({ ...previous, duration: duration() })
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
      const region = foreignRegions.find((candidate) => candidate.countryCode === countryCode)
      if (!region || region.locations.length === 0) return
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

    return () => {
      disposed = true
      cameraRequest++
      homeButton?.removeEventListener('click', goHome)
      map.stop()
      map.off('load', addLocations)
      map.off('render', updateMarkers)
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
    <main className="archive-map">
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
      {foreignRegions.length > 0 && (
        <>
          <button
            ref={regionNavigationButtonRef}
            type="button"
            className="region-navigation-toggle"
            aria-expanded={regionNavigationOpen}
            aria-controls="region-navigation-panel"
            onClick={() => {
              if (!regionNavigationOpen) {
                setLocationlessOpen(false)
                setLocationlessSelected(undefined)
              }
              setRegionNavigationOpen((open) => !open)
            }}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18" /></svg>
            <span>해외 지역</span>
          </button>
          {regionNavigationOpen && (
            <aside
              ref={regionPanelRef}
              id="region-navigation-panel"
              className="region-navigation-panel"
              aria-label="해외 활동 지역 이동"
              tabIndex={-1}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  setRegionNavigationOpen(false)
                  regionNavigationButtonRef.current?.focus()
                }
              }}
            >
              <header>
                <h2>해외 활동 지역</h2>
                <button
                  type="button"
                  className="region-navigation-close"
                  aria-label="해외 지역 메뉴 닫기"
                  onClick={() => {
                    setRegionNavigationOpen(false)
                    regionNavigationButtonRef.current?.focus()
                  }}
                >×</button>
              </header>
              <ul>
                {foreignRegions.map((region) => (
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
        </>
      )}
      {videoCallSchedules.length > 0 && (
        <>
          <button
            ref={locationlessButtonRef}
            type="button"
            className="locationless-toggle"
            aria-expanded={locationlessOpen}
            aria-controls="locationless-schedules"
            onClick={() => {
              if (!locationlessOpen) {
                dismissMapSelectionRef.current?.()
                setRegionNavigationOpen(false)
              }
              setLocationlessSelected(undefined)
              setLocationlessOpen((open) => !open)
            }}
          >
            영상통화 {videoCallSchedules.length}
          </button>
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
        </>
      )}
    </main>
  )
}


type LocationlessSchedulePanelProps = {
  schedules: Schedule[]
  selected?: Schedule
  onSelect: (schedule: Schedule) => void
  onBack: () => void
  onClose: () => void
}

function LocationlessSchedulePanel({ schedules: entries, selected, onSelect, onBack, onClose }: LocationlessSchedulePanelProps) {
  const panelRef = useRef<HTMLElement>(null)
  useEffect(() => {
    panelRef.current?.focus()
  }, [selected?.id])

  return (
    <aside
      ref={panelRef}
      id="locationless-schedules"
      className="locationless-panel"
      aria-label="영상통화 일정"
      tabIndex={-1}
      onKeyDown={(event) => {
        if (event.key === 'Escape') onClose()
      }}
    >
      <header className="locationless-panel-header">
        <h2>{selected?.title ?? '영상통화 일정'}</h2>
        <button type="button" className="locationless-close" aria-label="일정 패널 닫기" onClick={onClose}>×</button>
      </header>
      {entries.some((entry) => entry.title.startsWith('[가상]')) && <p className="locationless-demo-notice">가상 테스트 데이터 · 실제 H1-KEY 행사 기록이 아닙니다.</p>}
      {selected ? (
        <>
          <dl className="schedule-details">
            <dt>날짜</dt><dd>{selected.date.replaceAll('-', '.')}</dd>
            <dt>형식</dt><dd>{selected.eventFormat === 'online' ? '온라인' : selected.eventFormat === 'hybrid' ? '온라인·오프라인' : selected.eventFormat === 'unknown' ? '형식 미확인' : '오프라인'}</dd>
            <dt>장소</dt><dd>{selected.eventFormat === 'online' ? '온라인 행사 · 오프라인 장소 없음' : '장소 미확인'}</dd>
            {selected.startTime !== undefined && <><dt>시작 시간</dt><dd>{selected.startTime}</dd></>}
            {selected.orderInDay !== undefined && <><dt>당일 순서</dt><dd>같은 날짜 {selected.orderInDay}번째 행사</dd></>}
          </dl>
          <h3>세트리스트</h3>
          {selected.setlistStatus === 'known' || selected.setlistStatus === 'provisional' ? (
            <>
            <p>{selected.setlistStatus === 'known' ? '확인 완료 · 공연 순서' : '기본 입력 · 실제 세트리스트 확인 필요'}</p>
            <ol className="schedule-setlist">
              {selected.setlist.map((songId, index) => <li key={songId + index}>{songsById.get(songId)?.title ?? '곡 정보 오류: 존재하지 않는 songId (' + songId + ')'}</li>)}
            </ol>
            </>
          ) : <p>{selected.setlistStatus === 'unknown' ? '세트리스트 미확인' : '공연 곡 없음'}</p>}
          {selected.media === undefined && <p className="schedule-media-notice">녹화 영상은 추후 연결 예정입니다.</p>}
          <button type="button" className="schedule-choice" onClick={onBack}>일정 목록으로 돌아가기</button>
        </>
      ) : (
        <ul>
          {entries.map((schedule) => (
            <li key={schedule.id}>
              <button type="button" className="schedule-choice" onClick={() => onSelect(schedule)}>
                <time dateTime={schedule.date}>{schedule.date.replaceAll('-', '.')}</time>
                <strong>{schedule.title}</strong>
                <span>{[schedule.startTime ?? '시간 미확인', schedule.orderInDay !== undefined ? '같은 날짜 ' + schedule.orderInDay + '번째 행사' : '당일 순서 미확인'].join(' · ')}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </aside>
  )
}

export default ArchiveMap

