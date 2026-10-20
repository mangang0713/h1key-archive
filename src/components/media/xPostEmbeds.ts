const X_WIDGETS_SCRIPT_ID = 'x-embed-widgets'
const EMBED_LOADING_HINT_DELAY_MS = 10_000

type XWidgets = {
  widgets?: { load: (element?: HTMLElement) => void }
}

declare global {
  interface Window {
    twttr?: XWidgets
  }
}

function isXPostUrl(value: string) {
  try {
    const url = new URL(value)
    return (url.hostname === 'x.com' || url.hostname === 'twitter.com')
      && /^\/@?[A-Za-z0-9_]+\/status\/\d+\/?$/.test(url.pathname)
  } catch {
    return false
  }
}

function getXWidgetsScript() {
  let script = document.getElementById(X_WIDGETS_SCRIPT_ID) as HTMLScriptElement | null
  if (script) return script

  script = document.createElement('script')
  script.id = X_WIDGETS_SCRIPT_ID
  script.src = 'https://platform.twitter.com/widgets.js'
  script.async = true
  script.charset = 'utf-8'
  script.addEventListener('load', () => { script!.dataset.loaded = 'true' }, { once: true })
  document.head.append(script)
  return script
}

// 일정 상세를 읽는 동안 X 위젯 스크립트를 먼저 받아 탭 진입 시의 대기를 줄입니다.
export function preloadXWidgets() {
  if (!window.twttr?.widgets) getXWidgetsScript()
}

function loadXWidgets(container: HTMLElement, onError: () => void) {
  if (window.twttr?.widgets) {
    window.twttr.widgets.load(container)
    return
  }

  const script = getXWidgetsScript()
  const load = () => window.twttr?.widgets?.load(container)
  if (script.dataset.loaded === 'true') load()
  else {
    script.addEventListener('load', load, { once: true })
    script.addEventListener('error', onError, { once: true })
  }
}

// X 원본 게시물 링크를 안전한 DOM 노드로 만들고 공식 위젯이 iframe으로 바꾸도록 요청합니다.
export function renderXPostEmbeds(
  container: HTMLElement,
  urls: string[],
  parentSignal?: AbortSignal,
) {
  const posts = urls.filter(isXPostUrl)
  if (posts.length === 0) return () => {}

  const section = document.createElement('section')
  section.className = 'x-post-embeds'
  const heading = document.createElement('h3')
  heading.textContent = '사진·영상 게시물'
  const status = document.createElement('span')
  status.className = 'x-post-embed-status'
  status.setAttribute('role', 'status')
  status.setAttribute('aria-live', 'polite')
  status.textContent = 'X 게시물을 불러오는 중'
  const loadingIndicator = document.createElement('span')
  loadingIndicator.className = 'x-post-loading-indicator'
  loadingIndicator.setAttribute('aria-hidden', 'true')
  section.append(heading, loadingIndicator, status)

  const embeds = document.createElement('div')
  embeds.className = 'x-post-embed-list'

  for (const url of posts) {
    const post = document.createElement('div')
    post.className = 'x-post-embed-item'
    const quote = document.createElement('blockquote')
    quote.className = 'twitter-tweet'
    const link = document.createElement('a')
    link.href = url
    link.textContent = 'X 게시물 보기'
    quote.append(link)
    post.append(quote)
    embeds.append(post)
  }
  section.append(embeds)

  container.replaceChildren(section)

  let embedTimer: number | undefined = window.setTimeout(() => {
    loadingIndicator.remove()
    status.remove()
  }, EMBED_LOADING_HINT_DELAY_MS)
  const embedObserver = new MutationObserver(() => {
    const renderedEmbeds = embeds.querySelectorAll('iframe').length
    if (renderedEmbeds < posts.length) return
    if (embedTimer !== undefined) window.clearTimeout(embedTimer)
    embedTimer = undefined
    loadingIndicator.remove()
    status.remove()
    embedObserver.disconnect()
  })
  embedObserver.observe(embeds, { childList: true, subtree: true })

  const handleLoadError = () => {
    if (embedTimer !== undefined) window.clearTimeout(embedTimer)
    embedTimer = undefined
    loadingIndicator.remove()
    status.remove()
    embedObserver.disconnect()
  }
  loadXWidgets(embeds, handleLoadError)

  const dispose = () => {
    if (embedTimer !== undefined) window.clearTimeout(embedTimer)
    embedObserver.disconnect()
    section.remove()
    parentSignal?.removeEventListener('abort', dispose)
  }
  if (parentSignal?.aborted) dispose()
  else parentSignal?.addEventListener('abort', dispose, { once: true })
  return dispose
}
