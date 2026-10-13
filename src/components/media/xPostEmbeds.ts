const X_WIDGETS_SCRIPT_ID = 'x-embed-widgets'

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

function loadXWidgets(container: HTMLElement) {
  if (window.twttr?.widgets) {
    window.twttr.widgets.load(container)
    return
  }

  let script = document.getElementById(X_WIDGETS_SCRIPT_ID) as HTMLScriptElement | null
  const load = () => window.twttr?.widgets?.load(container)
  if (script) {
    if (script.dataset.loaded === 'true') load()
    else script.addEventListener('load', load, { once: true })
    return
  }

  script = document.createElement('script')
  script.id = X_WIDGETS_SCRIPT_ID
  script.src = 'https://platform.twitter.com/widgets.js'
  script.async = true
  script.charset = 'utf-8'
  script.addEventListener('load', () => {
    script!.dataset.loaded = 'true'
    load()
  }, { once: true })
  document.head.append(script)
}

// X 원본 게시물 링크를 안전한 DOM 노드로 만들고 공식 위젯이 iframe으로 바꾸도록 요청합니다.
export function renderXPostEmbeds(container: HTMLElement, urls: string[]) {
  const posts = urls.filter(isXPostUrl)
  if (posts.length === 0) return

  const section = document.createElement('section')
  section.className = 'x-post-embeds'
  const heading = document.createElement('h3')
  heading.textContent = '사진·영상 게시물'
  section.append(heading)

  for (const url of posts) {
    const quote = document.createElement('blockquote')
    quote.className = 'twitter-tweet'
    const link = document.createElement('a')
    link.href = url
    link.textContent = 'X 게시물 보기'
    quote.append(link)
    section.append(quote)
  }

  container.replaceChildren(section)
  loadXWidgets(section)
}
