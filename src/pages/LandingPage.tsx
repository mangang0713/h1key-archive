import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

const landingSections = ['welcome', 'stories', 'farewell'] as const

const sceneClass = 'relative grid min-h-[calc(100svh-58px)] items-center overflow-hidden scroll-mt-[58px] px-[clamp(24px,9vw,140px)] py-[clamp(48px,8vw,112px)] opacity-0 translate-y-7 transition-[opacity,transform] duration-700 ease-[cubic-bezier(.2,.7,.2,1)] max-[700px]:min-h-[calc(100svh-54px)] max-[700px]:px-[26px] max-[700px]:pt-[52px] max-[700px]:pb-[76px] motion-reduce:transition-none motion-reduce:opacity-100 motion-reduce:translate-y-0'
const visibleClass = 'translate-y-0 opacity-100'
const eyebrowClass = 'm-0 mb-[22px] max-w-[80%] text-[11px] font-semibold tracking-[.2em] text-[#7554a5] max-[700px]:text-[9px]'
const titleClass = 'm-0 text-[clamp(36px,5.2vw,66px)] font-semibold leading-[1.2] tracking-[-.06em] text-[#2d263b] max-[700px]:text-[clamp(35px,10vw,52px)]'
const bodyClass = 'my-[23px] text-[15px] leading-[1.9] text-[#696174] max-[700px]:my-[15px] max-[700px]:text-[13px]'
const actionClass = 'inline-flex min-h-12 items-center justify-center gap-4 rounded-full border border-transparent px-[21px] text-[13px] font-medium no-underline transition-[transform,background-color] duration-[180ms] hover:-translate-y-0.5 focus-visible:outline-3 focus-visible:outline-[#a98ac3] focus-visible:outline-offset-1 motion-reduce:transition-none'

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
    <div className="overflow-clip bg-[#fbf8f5] text-[#252039]">
      <section
        className={`${sceneClass} grid-cols-[minmax(0,1fr)_minmax(260px,.9fr)] bg-[radial-gradient(ellipse_at_74%_48%,#f3e6ed_0,#fbf8f5_42%,#fbf8f5_70%)] max-[700px]:grid-cols-1 max-[700px]:content-center max-[700px]:gap-2 max-[700px]:bg-[radial-gradient(ellipse_at_72%_43%,#f3e6ed_0,#fbf8f5_52%,#fbf8f5_72%)] ${visibleSections.has('welcome') ? visibleClass : ''}`}
        data-landing-section="welcome"
        aria-labelledby="landing-title"
      >
        <div className="relative z-[1] max-w-[620px]">
          <p className={eyebrowClass}>A LITTLE CELEBRATION FOR RIINA</p>
          <h1 id="landing-title" className="m-0 text-[clamp(58px,9.2vw,132px)] font-bold leading-[.83] tracking-[-.085em] text-[#29243c] max-[700px]:text-[clamp(62px,18vw,100px)]">
            HAPPY<br /><span className="text-[#7554a5]">RIINA</span> DAY
          </h1>
          <p className="mt-[30px] mb-4 text-[clamp(15px,1.6vw,19px)] leading-[1.8] text-[#666176] max-[700px]:mt-6 max-[700px]:text-sm">리이나의 반짝이는 순간들을 모아<br />함께 돌아보기 위한 작은 아카이브</p>
          <span className="text-xs font-medium tracking-[.16em] text-[#8e849b]">2027.02.21</span>
        </div>
        <div className="relative aspect-square w-[min(36vw,440px)] justify-self-center text-[#7554a5] max-[700px]:absolute max-[700px]:top-[16%] max-[700px]:right-[-21%] max-[700px]:w-[min(65vw,310px)] max-[700px]:opacity-[.58]" aria-hidden="true">
          <div className="absolute inset-[10%] rounded-full border border-[rgb(117_84_165_/_20%)] [transform:rotate(-28deg)_scaleY(.72)]" />
          <div className="absolute inset-[22%] rounded-full border border-[rgb(232_169_188_/_56%)] [transform:rotate(34deg)_scaleY(.82)]" />
          <div className="absolute top-[12%] right-[16%] text-[40px] text-[#d18aab]">✳</div>
          <div className="absolute inset-[29%] grid place-items-center rounded-full border border-[rgb(117_84_165_/_19%)] bg-white/55 font-serif text-[clamp(70px,12vw,150px)] italic text-[#76579e] shadow-[0_24px_70px_rgb(85_56_111_/_10%)]">R</div>
          <span className="absolute top-[24%] left-[21%] h-[10px] w-[10px] rounded-full bg-[#e4a8bd] shadow-[0_0_0_7px_rgb(228_168_189_/_14%)]" />
          <span className="absolute right-[17%] bottom-[25%] h-[7px] w-[7px] rounded-full bg-[#8e72b1] shadow-[0_0_0_7px_rgb(228_168_189_/_14%)]" />
          <span className="absolute bottom-[14%] left-[38%] h-[5px] w-[5px] rounded-full bg-[#e4a8bd] shadow-[0_0_0_7px_rgb(228_168_189_/_14%)]" />
        </div>
        <a className="absolute bottom-[max(24px,env(safe-area-inset-bottom))] left-1/2 inline-flex -translate-x-1/2 items-center gap-2.5 whitespace-nowrap text-[11px] text-[#81788d] no-underline focus-visible:outline-3 focus-visible:outline-[#a98ac3] focus-visible:outline-offset-1 max-[700px]:bottom-[max(22px,env(safe-area-inset-bottom))]" href="#landing-stories">
          <span>위로 넘겨 계속 보기</span><span className="grid h-[25px] w-[25px] place-items-center rounded-full border border-[#d9d1df] text-sm" aria-hidden="true">↓</span>
        </a>
      </section>

      <section
        className={`${sceneClass} grid-cols-[minmax(0,.9fr)_minmax(280px,1fr)] gap-[clamp(40px,8vw,120px)] bg-[#f0eaf3] max-[700px]:grid-cols-1 max-[700px]:content-center max-[700px]:gap-[26px] ${visibleSections.has('stories') ? visibleClass : ''}`}
        id="landing-stories"
        data-landing-section="stories"
        aria-labelledby="landing-stories-title"
      >
        <div className="max-w-[520px]">
          <p className={eyebrowClass}>MANY COLORS, MANY MOMENTS</p>
          <h2 id="landing-stories-title" className={titleClass}>다채로운 모습과<br />기억하고 싶은 순간들</h2>
          <p className={bodyClass}>머리색과 의상, 무대마다 달랐던 분위기를<br />사진과 함께 한 장면씩 담아갈 예정이에요.</p>
          <span className="inline-flex min-h-[34px] items-center rounded-full border border-[rgb(117_84_165_/_20%)] px-[13px] text-[11px] font-medium text-[#725b8d]">사진과 이야기를 준비하고 있어요</span>
        </div>
        <div className="relative h-[min(60vw,500px)] min-h-[330px] w-[min(100%,520px)] justify-self-center max-[700px]:h-[58vw] max-[700px]:min-h-[250px] max-[700px]:max-h-[350px] max-[700px]:w-[min(100%,390px)]" aria-label="사진이 추가될 자리">
          <div className="absolute inset-[6%_17%_9%_12%] grid place-items-center overflow-hidden rounded-[4px] border border-[rgb(117_84_165_/_13%)] bg-[linear-gradient(145deg,#e9d9e5,#f8e9e5_48%,#dbd8eb)] text-center text-[13px] leading-[1.7] text-[#746983] shadow-[0_24px_60px_rgb(57_39_72_/_12%)]">
            <span><span className="mb-3 block text-[28px] text-[#9d79b0]" aria-hidden="true">✳</span>리이나의 순간을<br />여기에 담을게요</span>
          </div>
          <div className="absolute top-0 right-0 z-[1] grid h-[29%] w-[34%] place-items-center rounded-[4px] border border-[rgb(117_84_165_/_13%)] bg-[linear-gradient(135deg,#d9c7e6,#efced7)] text-center text-[10px] text-[#746983] shadow-[0_14px_30px_rgb(57_39_72_/_12%)] [transform:rotate(6deg)]"><span>머리색</span></div>
          <div className="absolute right-0 bottom-0 z-[1] grid h-[29%] w-[34%] place-items-center rounded-[4px] border border-[rgb(117_84_165_/_13%)] bg-[linear-gradient(135deg,#f1d6ca,#d7d9eb)] text-center text-[10px] text-[#746983] shadow-[0_14px_30px_rgb(57_39_72_/_12%)] [transform:rotate(-5deg)]"><span>무대와 의상</span></div>
          <span className="absolute bottom-0 left-[12%] text-[9px] font-semibold tracking-[.2em] text-[#92869d]">A YEAR OF RIINA</span>
        </div>
      </section>

      <section
        className={`${sceneClass} min-h-[calc(100svh-58px)] justify-items-center content-center bg-[radial-gradient(ellipse_at_50%_45%,#f5e9f0,#fbf8f5_63%)] text-center max-[700px]:min-h-[calc(100svh-54px)] max-[700px]:px-5 ${visibleSections.has('farewell') ? visibleClass : ''}`}
        data-landing-section="farewell"
        aria-labelledby="landing-farewell-title"
      >
        <div className="relative mb-6 font-serif text-[54px] italic text-[#8e6ca7]" aria-hidden="true">R<span className="absolute top-[-8px] right-[-20px] font-sans text-lg not-italic text-[#dfa2b7]">✳</span></div>
        <p className={`${eyebrowClass} mb-[18px]`}>OUR YEAR, TOGETHER</p>
        <h2 id="landing-farewell-title" className={titleClass}>리이나의 1년,<br />함께 돌아볼까요?</h2>
        <p className="my-[22px] mb-[30px] text-sm leading-[1.8] text-[#696174]">무대와 장소를 따라 기록을 둘러보고,<br />축하하는 마음도 남겨 주세요.</p>
        <div className="flex flex-wrap justify-center gap-2.5">
          <Link className={`${actionClass} bg-[#705190] text-white shadow-[0_9px_25px_rgb(95_66_123_/_20%)]`} to="/archive">지금 확인하기 <span aria-hidden="true">↗</span></Link>
          <Link className={`${actionClass} border-[#d8ccdf] text-[#5f4c75]`} to="/guestbook">축하 글 남기기</Link>
        </div>
      </section>
    </div>
  )
}

export default LandingPage
