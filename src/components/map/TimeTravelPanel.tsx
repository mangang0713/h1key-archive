import { useEffect, useRef } from 'react'
import type { Schedule } from '../../types/archive'

type TimeTravelPanelProps = {
  schedule: Schedule
  locationName: string
  index: number
  total: number
  playing: boolean
  moving: boolean
  pausedOnRoute: boolean
  onClose: () => void
  onPrevious: () => void
  onTogglePlayback: () => void
  onNext: () => void
}

function TimeTravelPanel({
  schedule,
  locationName,
  index,
  total,
  playing,
  moving,
  pausedOnRoute,
  onClose,
  onPrevious,
  onTogglePlayback,
  onNext,
}: TimeTravelPanelProps) {
  const panelRef = useRef<HTMLElement>(null)

  useEffect(() => {
    panelRef.current?.focus()
  }, [])

  return (
    <section
      ref={panelRef}
      className="time-travel-panel"
      aria-label="시간순 일정 재생"
      tabIndex={-1}
      onKeyDown={(event) => {
        if (event.key === 'Escape') onClose()
      }}
    >
      <header className="time-travel-header" aria-live="polite" aria-atomic="true">
        <p>시간순 탐방</p>
        <strong>{schedule.date.replaceAll('-', '.')}</strong>
        <button type="button" className="time-travel-close" aria-label="시간순 보기 닫기" onClick={onClose}>×</button>
      </header>
      <div className="time-travel-current-schedule" aria-live="polite" aria-atomic="true">
        <strong>{schedule.title}</strong>
        {!playing && (
          <span>
            {schedule.locationId ? locationName : '지도 위치 미등록'}
            {schedule.startTime ? ` · ${schedule.startTime}` : ''}
          </span>
        )}
      </div>
      <div className="time-travel-controls">
        <button type="button" aria-label="이전 일정" disabled={index === 0 || moving || pausedOnRoute} onClick={onPrevious}>이전</button>
        <button type="button" className="time-travel-play" onClick={onTogglePlayback}>
          {playing ? '일시정지' : '재생'}
        </button>
        <button type="button" aria-label="다음 일정" disabled={index === total - 1 || moving || pausedOnRoute} onClick={onNext}>다음</button>
      </div>
    </section>
  )
}

export default TimeTravelPanel
