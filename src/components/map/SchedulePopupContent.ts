import { songs } from '../../data/songs'
import type { Location, Schedule } from '../../types/archive'
import { renderPhotoGallery } from '../media/photoGallery'
import { preloadXWidgets, renderXPostEmbeds } from '../media/xPostEmbeds'
import '../media/XPostEmbeds.css'

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

  const header = document.createElement('header')
  header.className = 'schedule-popup-header'
  const headingGroup = document.createElement('div')
  headingGroup.className = 'schedule-popup-heading-group'
  const eyebrow = document.createElement('span')
  eyebrow.className = 'schedule-popup-eyebrow'
  eyebrow.textContent = selected ? '행사 기록' : `장소 기록 · ${schedules.length}건`
  const heading = document.createElement('h2')
  heading.id = 'schedule-popup-title'
  heading.tabIndex = -1
  heading.textContent = selected ? selected.title : location.name
  headingGroup.append(eyebrow, heading)

  if (selected && schedules.length > 1) {
    const back = document.createElement('button')
    back.type = 'button'
    back.className = 'schedule-popup-back'
    back.setAttribute('aria-label', '스케줄 목록으로 돌아가기')
    back.textContent = '← 목록'
    back.addEventListener('click', (event) => {
      event.stopPropagation()
      onBack()
    }, { signal })
    header.append(back)
  }
  header.append(headingGroup)
  content.append(header)
  if (schedules.some((schedule) => schedule.title.startsWith('[가상]'))) {
    const notice = document.createElement('p')
    notice.className = 'schedule-demo-notice'
    notice.textContent = '더미 테스트 데이터 · 실제 H1-KEY 행사 및 공연 기록이 아닙니다.'
    content.append(notice)
  }
  let focusTarget: HTMLElement = heading

  if (selected) {
    if (selected.media?.xPosts?.length) preloadXWidgets()

    const tablist = document.createElement('div')
    tablist.className = 'schedule-tabs'
    tablist.setAttribute('role', 'tablist')
    tablist.setAttribute('aria-label', '행사 상세 정보')
    const panelContainer = document.createElement('div')
    panelContainer.className = 'schedule-tab-panels'
    const tabs = [
      { id: 'info', label: '행사 정보' },
      { id: 'setlist', label: '세트리스트' },
      { id: 'photos', label: `사진${selected.media?.photos?.length ? ` ${selected.media.photos.length}` : ''}` },
      { id: 'videos', label: `영상${selected.media?.xPosts?.length ? ` ${selected.media.xPosts.length}` : ''}` },
    ] as const
    const tabButtons = new Map<string, HTMLButtonElement>()
    const panels = new Map<string, HTMLDivElement>()

    for (const tab of tabs) {
      const button = document.createElement('button')
      button.type = 'button'
      button.id = `schedule-tab-${tab.id}`
      button.className = 'schedule-tab'
      button.setAttribute('role', 'tab')
      button.setAttribute('aria-controls', `schedule-panel-${tab.id}`)
      button.setAttribute('aria-selected', String(tab.id === 'info'))
      button.tabIndex = tab.id === 'info' ? 0 : -1
      button.textContent = tab.label
      tablist.append(button)
      tabButtons.set(tab.id, button)

      const panel = document.createElement('div')
      panel.id = `schedule-panel-${tab.id}`
      panel.className = 'schedule-tab-panel'
      panel.setAttribute('role', 'tabpanel')
      panel.setAttribute('aria-labelledby', button.id)
      panel.tabIndex = 0
      panel.hidden = tab.id !== 'info'
      panels.set(tab.id, panel)
      panelContainer.append(panel)
    }

    const infoPanel = panels.get('info')!
    const details = document.createElement('dl')
    details.className = 'schedule-details'
    const fields: [string, string][] = [
      ['날짜', selected.date.replaceAll('-', '.')],
      ['장소', location.name],
    ]
    if (selected.startTime !== undefined) fields.push(['시작 시간', selected.startTime])
    for (const [label, value] of fields) {
      const row = document.createElement('div')
      row.className = 'schedule-detail-row'
      const term = document.createElement('dt')
      term.textContent = label
      const description = document.createElement('dd')
      description.textContent = value
      row.append(term, description)
      details.append(row)
    }
    infoPanel.append(details)

    const setlistPanel = panels.get('setlist')!
    const setlistStatus = document.createElement('p')
    setlistStatus.className = 'schedule-setlist-status'
    if (selected.setlistStatus === 'known' || selected.setlistStatus === 'partial' || selected.setlistStatus === 'provisional') {
      const statusText = {
        known: '확인 완료 · 공연 순서',
        partial: '일부 확인 · 확인된 곡만 표시',
        provisional: '임시 입력 · 실제 세트리스트 확인 필요',
      } as const
      setlistStatus.textContent = statusText[selected.setlistStatus]
      const setlist = document.createElement('ol')
      setlist.className = 'schedule-setlist'
      selected.setlist.forEach((songId, index) => {
        const item = document.createElement('li')
        item.value = index + 1
        const song = songsById.get(songId)
        item.textContent = song ? song.title : `곡 정보 오류: 존재하지 않는 songId (${songId})`
        if (!song) item.className = 'schedule-data-error'
        setlist.append(item)
      })
      setlistPanel.append(setlistStatus, setlist)
    } else {
      setlistStatus.textContent = selected.setlistStatus === 'unknown' ? '세트리스트를 아직 확인하지 못했습니다.' : '이 행사에서는 곡 공연이 없었습니다.'
      setlistPanel.append(setlistStatus)
    }

    const photosPanel = panels.get('photos')!
    const videosPanel = panels.get('videos')!
    let photosInitialized = false
    let videosInitialized = false
    let disposePhotos: (() => void) | undefined
    const initializePhotos = () => {
      if (photosInitialized) return
      photosInitialized = true
      if (selected.media?.photos?.length) {
        disposePhotos = renderPhotoGallery(photosPanel, selected.media.photos)
        signal.addEventListener('abort', () => disposePhotos?.(), { once: true })
      } else {
        const empty = document.createElement('p')
        empty.className = 'schedule-tab-empty'
        empty.textContent = '연결된 사진이 없습니다.'
        photosPanel.append(empty)
      }
    }
    const initializeVideos = () => {
      if (videosInitialized) return
      videosInitialized = true
      if (selected.media?.xPosts?.length) {
        renderXPostEmbeds(videosPanel, selected.media.xPosts, signal)
      } else {
        const empty = document.createElement('p')
        empty.className = 'schedule-tab-empty'
        empty.textContent = '연결된 영상 게시물이 없습니다.'
        videosPanel.append(empty)
      }
    }

    let activeIndex = 0
    const activateTab = (index: number, moveFocus = false) => {
      activeIndex = (index + tabs.length) % tabs.length
      tabs.forEach((tab, tabIndex) => {
        const button = tabButtons.get(tab.id)!
        button.setAttribute('aria-selected', String(tabIndex === activeIndex))
        button.tabIndex = tabIndex === activeIndex ? 0 : -1
        panels.get(tab.id)!.hidden = tabIndex !== activeIndex
      })
      if (tabs[activeIndex].id === 'photos') initializePhotos()
      if (tabs[activeIndex].id === 'videos') initializeVideos()
      if (moveFocus) tabButtons.get(tabs[activeIndex].id)!.focus()
    }

    tabs.forEach((tab, index) => {
      const button = tabButtons.get(tab.id)!
      button.addEventListener('click', () => activateTab(index), { signal })
      button.addEventListener('keydown', (event) => {
        let nextIndex: number | undefined
        if (event.key === 'ArrowRight') nextIndex = index + 1
        if (event.key === 'ArrowLeft') nextIndex = index - 1
        if (event.key === 'Home') nextIndex = 0
        if (event.key === 'End') nextIndex = tabs.length - 1
        if (nextIndex !== undefined) {
          event.preventDefault()
          activateTab(nextIndex, true)
        }
      }, { signal })
    })

    content.append(tablist, panelContainer)
    const communityLink = document.createElement('a')
    communityLink.className = 'schedule-community-link'
    communityLink.href = `#/schedule/${encodeURIComponent(selected.id)}`
    communityLink.textContent = '좋아요와 후기 보기'
    content.append(communityLink)
  } else {
    const listBody = document.createElement('div')
    listBody.className = 'schedule-list-body'
    const list = document.createElement('ul')
    for (const schedule of schedules) {
      const item = document.createElement('li')
      const choice = document.createElement('button')
      choice.type = 'button'
      choice.className = 'schedule-choice'
      const date = document.createElement('time')
      date.dateTime = schedule.date
      date.textContent = schedule.date.slice(5).replace('-', '.')
      const title = document.createElement('strong')
      title.textContent = schedule.title
      choice.append(date, title)
      if (schedule.startTime !== undefined) {
        const time = document.createElement('span')
        time.textContent = schedule.startTime
        choice.append(time)
      }
      choice.addEventListener('click', (event) => {
        event.stopPropagation()
        onSelect(schedule)
      }, { signal })
      if (focusTarget === heading) focusTarget = choice
      item.append(choice)
      list.append(item)
    }
    listBody.append(list)
    content.append(listBody)
  }
  return { content, focusTarget }
}
