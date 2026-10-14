import { useEffect, useRef } from 'react'
import { songs } from '../../data/songs'
import type { Schedule } from '../../types/archive'
import { renderPhotoGallery } from '../media/photoGallery'
import { renderXPostEmbeds } from '../media/xPostEmbeds'
import '../media/XPostEmbeds.css'
import './LocationlessSchedulePanel.css'

const songsById = new Map(songs.map((song) => [song.id, song]))

type LocationlessSchedulePanelProps = {
  schedules: Schedule[]
  selected?: Schedule
  onSelect: (schedule: Schedule) => void
  onBack: () => void
  onClose: () => void
}

function LocationlessSchedulePanel({ schedules, selected, onSelect, onBack, onClose }: LocationlessSchedulePanelProps) {
  const panelRef = useRef<HTMLElement>(null)
  const mediaRef = useRef<HTMLDivElement>(null)
  const photoRef = useRef<HTMLDivElement>(null)
  const selectedXPosts = selected?.media?.xPosts
  const selectedPhotos = selected?.media?.photos

  useEffect(() => {
    panelRef.current?.focus()
  }, [selected?.id])

  useEffect(() => {
    const xPosts = selectedXPosts
    if (mediaRef.current && xPosts?.length) return renderXPostEmbeds(mediaRef.current, xPosts)
  }, [selected?.id, selectedXPosts])

  useEffect(() => {
    if (photoRef.current && selectedPhotos?.length) {
      return renderPhotoGallery(photoRef.current, selectedPhotos)
    }
  }, [selected?.id, selectedPhotos])

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
      {schedules.some((schedule) => schedule.title.startsWith('[가상]')) && (
        <p className="locationless-demo-notice">가상 테스트 데이터 · 실제 H1-KEY 행사 기록이 아닙니다.</p>
      )}
      {selected ? (
        <>
          <dl className="schedule-details">
            <dt>날짜</dt><dd>{selected.date.replaceAll('-', '.')}</dd>
            <dt>형식</dt><dd>{selected.eventFormat === 'online' ? '온라인' : selected.eventFormat === 'hybrid' ? '온라인·오프라인' : selected.eventFormat === 'unknown' ? '형식 미확인' : '오프라인'}</dd>
            <dt>장소</dt><dd>{selected.eventFormat === 'online' ? '온라인 행사 · 오프라인 장소 없음' : '장소 미확인'}</dd>
            {selected.startTime !== undefined && <><dt>시작 시간</dt><dd>{selected.startTime}</dd></>}
          </dl>
          {selected.eventFormat !== 'online' && (
            <>
              <h3>세트리스트</h3>
              {selected.setlistStatus === 'known' || selected.setlistStatus === 'partial' || selected.setlistStatus === 'provisional' ? (
                <>
                  <p>{selected.setlistStatus === 'known'
                    ? '확인 완료 · 공연 순서'
                    : selected.setlistStatus === 'partial'
                      ? '부분 확인 · 확인된 곡만 표시'
                      : '기본 입력 · 실제 세트리스트 확인 필요'}</p>
                  <ol className="schedule-setlist">
                    {selected.setlist.map((songId, index) => (
                      <li key={`${songId}-${index}`}>
                        {songsById.get(songId)?.title ?? `곡 정보 오류: 존재하지 않는 songId (${songId})`}
                      </li>
                    ))}
                  </ol>
                </>
              ) : <p>{selected.setlistStatus === 'unknown' ? '세트리스트 미확인' : '공연 곡 없음'}</p>}
            </>
          )}
          {selected.media?.photos?.length && <div ref={photoRef} />}
          {selected.media?.xPosts?.length
            ? <div ref={mediaRef} />
            : !selected.media?.photos?.length && <p className="schedule-media-notice">녹화 영상 게시물이 연결되지 않았습니다.</p>}
          <button type="button" className="schedule-choice" onClick={onBack}>일정 목록으로 돌아가기</button>
        </>
      ) : (
        <ul>
          {schedules.map((schedule) => {
            return (
              <li key={schedule.id}>
                <button type="button" className="schedule-choice" onClick={() => onSelect(schedule)}>
                  <time dateTime={schedule.date}>{schedule.date.replaceAll('-', '.')}</time>
                  <strong>{schedule.title}</strong>
                  {schedule.startTime !== undefined && <span>{schedule.startTime}</span>}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </aside>
  )
}

export default LocationlessSchedulePanel
