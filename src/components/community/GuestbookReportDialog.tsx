import { useEffect, useRef, type FormEvent } from 'react'
import type { GuestbookPost } from '../../features/community/types'

type GuestbookReportDialogProps = {
  post: GuestbookPost | null
  error?: string
  submitting: boolean
  step: 'form' | 'success'
  details: string
  onDetailsChange: (details: string) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  onClose: () => void
}

function GuestbookReportDialog({ post, error, submitting, step, details, onDetailsChange, onSubmit, onClose }: GuestbookReportDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const primaryButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!post) return
    const dialog = dialogRef.current
    if (!dialog) return
    dialog.showModal()
    textareaRef.current?.focus()
    return () => { if (dialog.open) dialog.close() }
  }, [post])

  useEffect(() => {
    if (post && step === 'success') primaryButtonRef.current?.focus()
  }, [post, step])

  return (
    <dialog ref={dialogRef} className="report-confirmation" aria-labelledby="report-confirmation-title" onCancel={(event) => { event.preventDefault(); onClose() }}>
      {step === 'form' && <form className="report-dialog-content" onSubmit={onSubmit}>
        <h2 id="report-confirmation-title">게시물 신고</h2>
        <p>신고 사유를 적어 주세요. 설명은 선택 사항이며, 비워도 신고할 수 있습니다.</p>
        <label htmlFor="guestbook-report-details">신고 사유 (선택)</label>
        <textarea ref={textareaRef} id="guestbook-report-details" value={details} maxLength={500} rows={4} placeholder="예: 개인정보가 포함되어 있어요." onChange={(event) => onDetailsChange(event.target.value)} />
        <span className="report-dialog-count">{details.length}/500자</span>
        {error && <p className="report-error" role="alert">{error}</p>}
        <div className="report-dialog-actions">
          <button className="secondary-button" type="button" disabled={submitting} onClick={onClose}>취소</button>
          <button className="primary-button" type="submit" disabled={submitting}>{submitting ? '접수 중…' : '신고하기'}</button>
        </div>
      </form>}
      {step === 'success' && <div className="report-dialog-content report-confirmation-content">
        <span className="report-confirmation-icon" aria-hidden="true">✓</span>
        <h2 id="report-confirmation-title">신고가 접수되었습니다</h2>
        <p>관리자가 내용을 확인할 예정입니다. 이 글은 내 방명록 목록에서 숨겼습니다.</p>
        <button ref={primaryButtonRef} className="primary-button" type="button" onClick={onClose}>확인</button>
      </div>}
    </dialog>
  )
}

export default GuestbookReportDialog
