import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import './LandingPage.css'

const landingSections = ['welcome', 'stories', 'farewell'] as const

function LandingPage() {
  const [visibleSections, setVisibleSections] = useState<Set<string>>(() => new Set(landingSections))

  useEffect(() => {
    const sections = document.querySelectorAll<HTMLElement>('[data-landing-section]')
    if (!('IntersectionObserver' in window)) return

    const observer = new IntersectionObserver((entries) => {
      setVisibleSections((current) => {
        const next = new Set(current)
        entries.forEach((entry) => {
          const sectionId = (entry.target as HTMLElement).dataset.landingSection
          if (!sectionId) return
          if (entry.isIntersecting) next.add(sectionId)
          else next.delete(sectionId)
        })
        return next
      })
    }, { threshold: 0.25 })

    sections.forEach((section) => observer.observe(section))
    return () => observer.disconnect()
  }, [])

  return (
    <div className="landing-page">
      <section
        className={`landing-scene landing-welcome${visibleSections.has('welcome') ? ' is-visible' : ''}`}
        data-landing-section="welcome"
        aria-labelledby="landing-title"
      >
        <div className="landing-welcome-copy">
          <p className="landing-eyebrow">A LITTLE CELEBRATION FOR RIINA</p>
          <h1 id="landing-title">HAPPY<br /><span>RIINA</span> DAY</h1>
          <p className="landing-intro">리이나의 반짝이는 순간들을 모아<br />함께 돌아보기 위한 작은 아카이브</p>
          <span className="landing-date">2027.02.21</span>
        </div>
        <div className="landing-orbit" aria-hidden="true">
          <div className="landing-orbit-ring landing-orbit-ring-outer" />
          <div className="landing-orbit-ring landing-orbit-ring-inner" />
          <div className="landing-orbit-star">✳</div>
          <div className="landing-orbit-center">R</div>
          <span className="landing-orbit-dot landing-orbit-dot-one" />
          <span className="landing-orbit-dot landing-orbit-dot-two" />
          <span className="landing-orbit-dot landing-orbit-dot-three" />
        </div>
        <a className="landing-scroll-cue" href="#landing-stories">
          <span>위로 넘겨 계속 보기</span><span aria-hidden="true">↓</span>
        </a>
      </section>

      <section
        className={`landing-scene landing-stories${visibleSections.has('stories') ? ' is-visible' : ''}`}
        id="landing-stories"
        data-landing-section="stories"
        aria-labelledby="landing-stories-title"
      >
        <div className="landing-stories-copy">
          <p className="landing-eyebrow">MANY COLORS, MANY MOMENTS</p>
          <h2 id="landing-stories-title">다채로운 모습과<br />기억하고 싶은 순간들</h2>
          <p>머리색과 의상, 무대마다 달랐던 분위기를<br />사진과 함께 한 장면씩 담아갈 예정이에요.</p>
          <span className="landing-coming-soon">사진과 이야기를 준비하고 있어요</span>
        </div>
        <div className="landing-photo-placeholders" aria-label="사진이 추가될 자리">
          <div className="landing-photo-placeholder landing-photo-main">
            <span className="landing-placeholder-sparkle" aria-hidden="true">✳</span>
            <span>리이나의 순간을<br />여기에 담을게요</span>
          </div>
          <div className="landing-photo-placeholder landing-photo-small landing-photo-small-one"><span>머리색</span></div>
          <div className="landing-photo-placeholder landing-photo-small landing-photo-small-two"><span>무대와 의상</span></div>
          <span className="landing-photo-caption">A YEAR OF RIINA</span>
        </div>
      </section>

      <section
        className={`landing-scene landing-farewell${visibleSections.has('farewell') ? ' is-visible' : ''}`}
        data-landing-section="farewell"
        aria-labelledby="landing-farewell-title"
      >
        <div className="landing-farewell-mark" aria-hidden="true">R<span>✳</span></div>
        <p className="landing-eyebrow">OUR YEAR, TOGETHER</p>
        <h2 id="landing-farewell-title">리이나의 1년,<br />함께 돌아볼까요?</h2>
        <p className="landing-farewell-copy">무대와 장소를 따라 기록을 둘러보고,<br />축하하는 마음도 남겨 주세요.</p>
        <div className="landing-actions">
          <Link className="landing-primary-action" to="/archive">지금 확인하기 <span aria-hidden="true">↗</span></Link>
          <Link className="landing-secondary-action" to="/guestbook">축하 글 남기기</Link>
        </div>
      </section>
    </div>
  )
}

export default LandingPage
