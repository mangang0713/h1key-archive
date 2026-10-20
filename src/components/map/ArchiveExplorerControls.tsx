import type { Ref } from 'react'
import type { Schedule, CountryCode } from '../../types/archive'
import ArchiveExplorerPanel from '../archive/ArchiveExplorerPanel'
import LocationlessSchedulePanel from '../schedule/LocationlessSchedulePanel'
import RegionNavigationPanel, { type RegionNavigationOption } from './RegionNavigationPanel'
import './ArchiveExplorerControls.css'

type ArchiveExplorerControlsProps = {
  regions: RegionNavigationOption[]
  videoCallSchedules: Schedule[]
  scheduleCount: number
  timeTravelCount: number
  regionNavigationOpen: boolean
  locationlessOpen: boolean
  locationlessSelected?: Schedule
  archiveDataOpen: boolean
  timeTravelButtonRef: Ref<HTMLButtonElement>
  regionNavigationButtonRef: Ref<HTMLButtonElement>
  locationlessButtonRef: Ref<HTMLButtonElement>
  archiveDataButtonRef: Ref<HTMLButtonElement>
  onStartTimeTravel: () => void
  onToggleRegionNavigation: () => void
  onCloseRegionNavigation: () => void
  onSelectRegion: (countryCode: CountryCode) => void
  onToggleLocationless: () => void
  onSelectLocationlessSchedule: (schedule: Schedule) => void
  onBackLocationless: () => void
  onCloseLocationless: () => void
  onToggleArchiveData: () => void
  onCloseArchiveData: () => void
}

function ArchiveExplorerControls({
  regions,
  videoCallSchedules,
  scheduleCount,
  timeTravelCount,
  regionNavigationOpen,
  locationlessOpen,
  locationlessSelected,
  archiveDataOpen,
  timeTravelButtonRef,
  regionNavigationButtonRef,
  locationlessButtonRef,
  archiveDataButtonRef,
  onStartTimeTravel,
  onToggleRegionNavigation,
  onCloseRegionNavigation,
  onSelectRegion,
  onToggleLocationless,
  onSelectLocationlessSchedule,
  onBackLocationless,
  onCloseLocationless,
  onToggleArchiveData,
  onCloseArchiveData,
}: ArchiveExplorerControlsProps) {
  if (regions.length === 0 && videoCallSchedules.length === 0 && scheduleCount === 0) return null

  return (
    <section className="archive-explorer" aria-label="아카이브 탐색">
      <h2 className="archive-explorer-title">아카이브 탐색</h2>
      <div className="archive-explorer-actions">
        {timeTravelCount > 0 && (
          <button ref={timeTravelButtonRef} type="button" className="archive-explorer-action" onClick={onStartTimeTravel}>
            <span className="archive-explorer-icon archive-explorer-icon-time" aria-hidden="true">
              <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2M4 5v5h5" /></svg>
            </span>
            <span className="archive-explorer-label">활동 여정 보기</span>
            <span className="archive-explorer-count">{timeTravelCount}건</span>
          </button>
        )}
        {regions.length > 0 && (
          <button
            ref={regionNavigationButtonRef}
            type="button"
            className="archive-explorer-action"
            aria-expanded={regionNavigationOpen}
            aria-controls="region-navigation-panel"
            onClick={onToggleRegionNavigation}
          >
            <span className="archive-explorer-icon archive-explorer-icon-region" aria-hidden="true">
              <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18" /></svg>
            </span>
            <span className="archive-explorer-label">지역 이동</span>
            <span className="archive-explorer-count">{regions.length}개국</span>
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
            onClick={onToggleLocationless}
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
          aria-label={`전체 일정 및 곡 기록 ${scheduleCount}건`}
          aria-expanded={archiveDataOpen}
          aria-controls="archive-data-panel"
          onClick={onToggleArchiveData}
        >
          <span className="archive-explorer-icon archive-explorer-icon-data" aria-hidden="true">
            <svg viewBox="0 0 24 24"><path d="M4 5h16M4 12h16M4 19h16" /><circle cx="8" cy="5" r="1" /><circle cx="15" cy="12" r="1" /><circle cx="10" cy="19" r="1" /></svg>
          </span>
          <span className="archive-explorer-label">전체 기록</span>
          <span className="archive-explorer-count">{scheduleCount}건</span>
        </button>
      </div>
      {regionNavigationOpen && <RegionNavigationPanel regions={regions} onClose={onCloseRegionNavigation} onSelect={onSelectRegion} />}
      {locationlessOpen && (
        <LocationlessSchedulePanel
          schedules={videoCallSchedules}
          selected={locationlessSelected}
          onSelect={onSelectLocationlessSchedule}
          onBack={onBackLocationless}
          onClose={onCloseLocationless}
        />
      )}
      {archiveDataOpen && <ArchiveExplorerPanel onClose={onCloseArchiveData} />}
    </section>
  )
}

export default ArchiveExplorerControls
