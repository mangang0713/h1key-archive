import { songs } from '../../data/songs'
import type { Location, Schedule } from '../../types/archive'

const songsById = new Map(songs.map((song) => [song.id, song]))

type PopupContentOptions = {
  location: Location
  schedules: Schedule[] // ArchiveMap에서 날짜·당일 순서로 정렬된 목록
  selected?: Schedule
  signal: AbortSignal
  onSelect: (schedule: Schedule) => void
  onBack: () => void
  onClose: () => void
}

// MapLibre setDOMContent()에 전달할 DOM만 생성합니다. 지도나 카메라는 관리하지 않습니다.
export function createSchedulePopupContent(options: PopupContentOptions) {
  const { location, schedules, selected, signal, onSelect, onBack, onClose } = options
  const content = document.createElement('section')
  content.className = 'schedule-popup'
  content.addEventListener('click', (event) => event.stopPropagation(), { signal })
  content.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.stopPropagation()
      onClose()
    }
  }, { signal })

  const heading = document.createElement('h2')
  heading.tabIndex = -1
  heading.textContent = selected ? selected.title : `${location.name} · 스케줄 목록`
  content.append(heading)
  if (schedules.some((schedule) => schedule.title.startsWith('[가상]'))) {
    const notice = document.createElement('p')
    notice.textContent = '더미 테스트 데이터 · 실제 H1-KEY 행사 및 공연 기록이 아닙니다.'
    content.append(notice)
  }
  let focusTarget: HTMLElement = heading

  if (selected) {
    const details = document.createElement('dl')
    details.className = 'schedule-details'
    const fields: [string, string][] = [
      ['날짜', selected.date.replaceAll('-', '.')],
      ['장소', location.name],
    ]
    if (selected.startTime !== undefined) fields.push(['시작 시간', selected.startTime])
    if (selected.orderInDay !== undefined) fields.push(['당일 순서', `같은 날짜 ${selected.orderInDay}번째 행사`])
    for (const [label, value] of fields) {
      const term = document.createElement('dt')
      term.textContent = label
      const description = document.createElement('dd')
      description.textContent = value
      details.append(term, description)
    }
    content.append(details)

    const setlistHeading = document.createElement('h3')
    setlistHeading.textContent = '세트리스트'
    content.append(setlistHeading)
    if (selected.setlistStatus === 'known' || selected.setlistStatus === 'partial' || selected.setlistStatus === 'provisional') {
      const status = document.createElement('p')
      const statusText = {
        known: '확인 완료 · 공연 순서',
        partial: '부분 확인 · 확인된 곡만 표시',
        provisional: '기본 입력 · 실제 세트리스트 확인 필요',
      } as const
      status.textContent = statusText[selected.setlistStatus]
      const setlist = document.createElement('ol')
      setlist.className = 'schedule-setlist'
      selected.setlist.forEach((songId, index) => {
        const item = document.createElement('li')
        item.value = index + 1 // 곡별 누적 공연 횟수가 아닌 이 행사의 공연 순서
        const song = songsById.get(songId)
        item.textContent = song ? song.title : `곡 정보 오류: 존재하지 않는 songId (${songId})`
        if (!song) item.className = 'schedule-data-error'
        setlist.append(item)
      })
      content.append(status, setlist)
    } else {
      const status = document.createElement('p')
      status.textContent = selected.setlistStatus === 'unknown' ? '세트리스트 미확인' : '공연 곡 없음'
      content.append(status)
    }

    const mediaNotice = document.createElement('p')
    mediaNotice.className = 'schedule-media-notice'
    mediaNotice.textContent = '사진·영상은 추후 연결 예정입니다.'
    content.append(mediaNotice)
    if (schedules.length > 1) {
      const back = document.createElement('button')
      back.type = 'button'
      back.className = 'schedule-choice'
      back.textContent = '스케줄 목록으로 돌아가기'
      back.addEventListener('click', (event) => {
        event.stopPropagation()
        onBack()
      }, { signal })
      content.append(back)
    }
  } else {
    const list = document.createElement('ul')
    for (const schedule of schedules) {
      const item = document.createElement('li')
      const choice = document.createElement('button')
      choice.type = 'button'
      choice.className = 'schedule-choice'
      const date = document.createElement('time')
      date.dateTime = schedule.date
      date.textContent = schedule.date.replaceAll('-', '.')
      const title = document.createElement('strong')
      title.textContent = schedule.title
      const order = document.createElement('span')
      order.textContent = [
        schedule.startTime !== undefined ? schedule.startTime : '시간 미확인',
        schedule.orderInDay !== undefined ? `같은 날짜 ${schedule.orderInDay}번째 행사` : '당일 순서 미확인',
      ].join(' · ')
      choice.append(date, title, order)
      choice.addEventListener('click', (event) => {
        event.stopPropagation()
        onSelect(schedule)
      }, { signal })
      if (focusTarget === heading) focusTarget = choice
      item.append(choice)
      list.append(item)
    }
    content.append(list)
  }
  return { content, focusTarget }
}
