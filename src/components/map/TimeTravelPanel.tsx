import { useEffect, useRef } from 'react'
import type { Schedule } from '../../types/archive'
import type { TimeTravelSpeed } from './timeTravelController'
import './TimeTravelPanel.css'

const TIME_TRAVEL_SPEEDS: TimeTravelSpeed[] = [0.5, 1, 2, 4]

type TimeTravelPanelProps = {
  schedule: Schedule
  locationName: string
  index: number
  total: number
  playing: boolean
  moving: boolean
  pausedOnRoute: boolean
  speed: TimeTravelSpeed
  onClose: () => void
  onPrevious: () => void
  onTogglePlayback: () => void
  onNext: () => void
  onSpeedChange: (speed: TimeTravelSpeed) => void
}

function TimeTravelPanel({
  schedule,
  locationName,
  index,
  total,
  playing,
  moving,
  pausedOnRoute,
  speed,
  onClose,
  onPrevious,
  onTogglePlayback,
  onNext,
  onSpeedChange,
}: TimeTravelPanelProps) {
  const panelRef = useRef<HTMLElement>(null)

  useEffect(() => {
    panelRef.current?.focus()
  }, [])

  return (
    <section
      ref={panelRef}
      className="time-travel-panel"
      aria-label="활동 여정 재생"
      tabIndex={-1}
      onKeyDown={(event) => {
        if (event.key === 'Escape') onClose()
      }}
    >
      <header className="time-travel-header" aria-live="polite" aria-atomic="true">
        <p>활동 여정</p>
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
      <div className="time-travel-speed" role="group" aria-label="재생 배속">
        <span>배속</span>
        {TIME_TRAVEL_SPEEDS.map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={speed === option}
            onClick={() => onSpeedChange(option)}
          >
            {option}×
          </button>
        ))}
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
