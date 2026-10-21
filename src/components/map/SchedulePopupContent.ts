import { songs } from '../../data/songs'
import { getSongPerformanceNumber } from '../../data/songStats'
import type { Location, Schedule } from '../../types/archive'
import { renderPhotoGallery } from '../media/photoGallery'
import { preloadXWidgets, renderXPostEmbeds } from '../media/xPostEmbeds'
import '../media/XPostEmbeds.css'
import './SchedulePopupContent.css'

const songsById = new Map(songs.map((song) => [song.id, song]))

export type SchedulePopupReaction = { likeCount: number; liked: boolean }

type LikeControl = {
  element: HTMLDivElement
  setReaction: (reaction: SchedulePopupReaction | null) => void
}

function createScheduleLikeControl(
  schedule: Schedule,
  isAuthenticated: boolean,
  onToggleLike: (scheduleId: string, current: SchedulePopupReaction) => Promise<SchedulePopupReaction>,
  signal: AbortSignal,
  compact = false,
): LikeControl {
  const element = document.createElement('div')
  element.className = `schedule-like-control${compact ? ' is-compact' : ''}`
  const control = document.createElement(isAuthenticated ? 'button' : 'a')
  control.className = 'schedule-like-button'
  control.textContent = '♡ —'
  control.setAttribute('aria-label', '좋아요 수를 불러오는 중')
  if (control instanceof HTMLButtonElement) {
    control.type = 'button'
    control.disabled = true
  } else {
    control.href = '#/account?returnTo=%2Farchive'
    control.title = '로그인 후 좋아요에 참여할 수 있어요.'
  }
  const status = document.createElement('span')
  status.className = 'schedule-like-status'
  if (!isAuthenticated) status.textContent = '로그인 후 참여'
  element.append(control, status)

  let reaction: SchedulePopupReaction | null = null
  let pending = false
  const setReaction = (next: SchedulePopupReaction | null) => {
    reaction = next
    if (!reaction) {
      control.textContent = '♡ —'
      control.setAttribute('aria-label', '좋아요 수를 불러오지 못했습니다')
      if (control instanceof HTMLButtonElement) control.disabled = true
      status.textContent = '좋아요를 불러오지 못했습니다.'
      return
    }
    control.textContent = `${reaction.liked ? '♥' : '♡'} ${reaction.likeCount}`
    control.setAttribute('aria-label', isAuthenticated
      ? `${reaction.liked ? '좋아요 취소' : '좋아요'} · 현재 ${reaction.likeCount}개`
      : `현재 좋아요 ${reaction.likeCount}개 · 로그인하고 참여하기`)
    if (control instanceof HTMLButtonElement) {
      control.disabled = false
      control.setAttribute('aria-pressed', String(reaction.liked))
    }
    status.textContent = isAuthenticated ? '' : '로그인 후 참여'
  }

  if (control instanceof HTMLButtonElement) {
    control.addEventListener('click', () => {
      if (!reaction || pending) return
      pending = true
      control.disabled = true
      status.textContent = '반영 중…'
      void onToggleLike(schedule.id, reaction).then((next) => {
        if (signal.aborted) return
        setReaction(next)
      }).catch(() => {
        if (signal.aborted) return
        status.textContent = '반영하지 못했습니다. 다시 시도해 주세요.'
      }).finally(() => {
        pending = false
        if (!signal.aborted && reaction) control.disabled = false
      })
    }, { signal })
  }

  return { element, setReaction }
}

type PopupContentOptions = {
  location: Location
  schedules: Schedule[] // ArchiveMap에서 날짜·당일 순서로 정렬된 목록
  selected?: Schedule
  signal: AbortSignal
  isAuthenticated: boolean
  onToggleLike: (scheduleId: string, current: SchedulePopupReaction) => Promise<SchedulePopupReaction>
  onSelect: (schedule: Schedule) => void
  onBack: () => void
  onClose: () => void
}

// MapLibre setDOMContent()에 전달할 DOM만 생성합니다. 지도나 카메라는 관리하지 않습니다.
export function createSchedulePopupContent(options: PopupContentOptions) {
  const { location, schedules, selected, signal, isAuthenticated, onToggleLike, onSelect, onBack, onClose } = options
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
  const likeControls = new Map<string, LikeControl>()
  const createLikeControlForSchedule = (schedule: Schedule, compact = false) => {
    const likeControl = createScheduleLikeControl(schedule, isAuthenticated, onToggleLike, signal, compact)
    likeControls.set(schedule.id, likeControl)
    return likeControl.element
  }

  if (selected) {
    if (selected.media?.xPosts?.length) preloadXWidgets()

    const tablist = document.createElement('div')
    tablist.className = 'schedule-tabs'
    tablist.setAttribute('role', 'tablist')
    tablist.setAttribute('aria-label', '행사 상세 정보')
    const panelContainer = document.createElement('div')
    panelContainer.className = 'schedule-tab-panels'
    const baseTabs = [
      { id: 'info', label: '행사 정보' },
      ...(selected.eventFormat !== 'online' && (selected.setlist.length > 0 || selected.setlistStatus === 'none')
        ? [{ id: 'setlist', label: '세트리스트' }]
        : []),
      ...(selected.media?.photos?.length
        ? [{ id: 'photos', label: `사진 ${selected.media.photos.length}` }]
        : []),
      ...(selected.media?.xPosts?.length
        ? [{ id: 'videos', label: `영상 ${selected.media.xPosts.length}` }]
        : []),
    ]
    const officialMediaTabs = [
      { id: 'official-groups', label: '그룹 단체사진', items: selected.media?.officialGroupPhotos ?? [], kind: 'photos' },
      { id: 'official-individuals', label: '개인 사진', items: selected.media?.officialIndividualPhotos ?? [], kind: 'photos' },
      { id: 'official-reels', label: '릴스', items: selected.media?.officialReels ?? [], kind: 'links' },
    ] as const
    const tabs = [
      ...baseTabs,
      ...officialMediaTabs
        .filter((tab) => tab.items.length > 0)
        .map((tab) => ({ id: tab.id, label: `${tab.label} ${tab.items.length}` })),
    ]
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
    infoPanel.append(createLikeControlForSchedule(selected))

    const setlistPanel = panels.get('setlist')
    if (setlistPanel) {
      const setlistStatus = document.createElement('p')
      setlistStatus.className = 'schedule-setlist-status'
      if (selected.setlistStatus === 'none') {
        setlistStatus.textContent = '행사에서 진행된 곡이 없습니다.'
        setlistPanel.append(setlistStatus)
      } else if (selected.setlist.length > 0) {
        const setlist = document.createElement('ol')
        setlist.className = 'schedule-setlist'
        selected.setlist.forEach((songId, index) => {
          const item = document.createElement('li')
          item.value = index + 1
          const song = songsById.get(songId)
          const title = document.createElement('span')
          title.className = 'schedule-song-title'
          title.textContent = song ? song.title : `곡 정보 오류: 존재하지 않는 songId (${songId})`
          item.append(title)
          const performanceNumber = getSongPerformanceNumber(songId, selected.id)
          if (song && performanceNumber !== undefined) {
            const count = document.createElement('span')
            count.className = 'schedule-song-count'
            count.textContent = `기록상 ${performanceNumber}번째 무대`
            item.append(count)
          }
          if (!song) item.className = 'schedule-data-error'
          setlist.append(item)
        })
        setlistPanel.append(setlist)
      }
    }

    const photosPanel = panels.get('photos')
    const videosPanel = panels.get('videos')
    let photosInitialized = false
    let videosInitialized = false
    const initializedOfficialMedia = new Set<string>()
    let disposePhotos: (() => void) | undefined
    const initializePhotos = () => {
      if (photosInitialized || !photosPanel) return
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
      if (videosInitialized || !videosPanel) return
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
    const initializeOfficialMedia = (tabId: string) => {
      if (initializedOfficialMedia.has(tabId)) return
      initializedOfficialMedia.add(tabId)
      const tab = officialMediaTabs.find((candidate) => candidate.id === tabId)
      const panel = panels.get(tabId)
      if (!tab || !panel || tab.items.length === 0) return
      if (tab.kind === 'photos') {
        const dispose = renderPhotoGallery(panel, [...tab.items])
        signal.addEventListener('abort', dispose, { once: true })
      } else {
        const list = document.createElement('ul')
        list.className = 'schedule-official-links'
        tab.items.forEach((value, index) => {
          let url: URL
          try {
            url = new URL(value)
          } catch {
            return
          }
          if (url.protocol !== 'https:' || !['instagram.com', 'www.instagram.com'].includes(url.hostname)) return
          const item = document.createElement('li')
          const link = document.createElement('a')
          link.href = url.href
          link.target = '_blank'
          link.rel = 'noopener noreferrer'
          link.textContent = `공식 Instagram 릴스 ${index + 1} 보기`
          item.append(link)
          list.append(item)
        })
        if (list.childElementCount > 0) panel.append(list)
        else {
          const empty = document.createElement('p')
          empty.className = 'schedule-tab-empty'
          empty.textContent = '표시할 수 있는 공식 릴스 링크가 없습니다.'
          panel.append(empty)
        }
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
      if (tabs[activeIndex].id.startsWith('official-')) initializeOfficialMedia(tabs[activeIndex].id)
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
    communityLink.textContent = '후기 보기'
    content.append(communityLink)
  } else {
    const listBody = document.createElement('div')
    listBody.className = 'schedule-list-body'
    const list = document.createElement('ul')
    for (const schedule of schedules) {
      const item = document.createElement('li')
      item.className = 'schedule-choice-row'
      const choice = document.createElement('button')
      choice.type = 'button'
      choice.className = 'schedule-choice'
      const date = document.createElement('time')
      date.dateTime = schedule.date
      date.textContent = schedule.date.slice(5).replace('-', '.')
      const title = document.createElement('strong')
      title.textContent = schedule.title
      const choiceDetails = document.createElement('span')
      choiceDetails.className = 'schedule-choice-details'
      choiceDetails.append(date, title)
      if (schedule.startTime !== undefined) {
        const time = document.createElement('span')
        time.textContent = schedule.startTime
        choiceDetails.append(time)
      }
      choice.append(choiceDetails)
      choice.addEventListener('click', (event) => {
        event.stopPropagation()
        onSelect(schedule)
      }, { signal })
      if (focusTarget === heading) focusTarget = choice
      item.append(choice, createLikeControlForSchedule(schedule, true))
      list.append(item)
    }
    listBody.append(list)
    content.append(listBody)
  }
  return {
    content,
    focusTarget,
    updateReactions(reactions: Map<string, SchedulePopupReaction | null>) {
      reactions.forEach((reaction, scheduleId) => likeControls.get(scheduleId)?.setReaction(reaction))
    },
  }
}
