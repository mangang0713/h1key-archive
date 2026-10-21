import { useEffect, useRef, useState, type FormEvent } from 'react'

type ModerationReasonDialogProps = {
  subjectLabel: string
  submitting: boolean
  error?: string
  successMessage?: string
  onSubmit: (reason: string) => void
  onClose: () => void
}

function ModerationReasonDialog({ subjectLabel, submitting, error, successMessage, onSubmit, onClose }: ModerationReasonDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const reasonRef = useRef<HTMLTextAreaElement>(null)
  const successButtonRef = useRef<HTMLButtonElement>(null)
  const [reason, setReason] = useState('')
  const [validationError, setValidationError] = useState('')

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    dialog.showModal()
    reasonRef.current?.focus()
    return () => { if (dialog.open) dialog.close() }
  }, [])

  useEffect(() => {
    if (successMessage) successButtonRef.current?.focus()
  }, [successMessage])

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmedReason = reason.trim()
    if (!trimmedReason) {
      setValidationError('작성자에게 안내할 숨김 사유를 입력해 주세요.')
      reasonRef.current?.focus()
      return
    }
    if (trimmedReason.length > 1000) {
      setValidationError('숨김 사유는 1000자 이내로 입력해 주세요.')
      reasonRef.current?.focus()
      return
    }
    setValidationError('')
    onSubmit(trimmedReason)
  }

  return (
    <dialog
      ref={dialogRef}
      className="report-confirmation"
      aria-labelledby="moderation-dialog-title"
      onCancel={(event) => { event.preventDefault(); if (!submitting) onClose() }}
    >
      {successMessage ? <div className="report-dialog-content report-confirmation-content">
        <span className="report-confirmation-icon" aria-hidden="true">✓</span>
        <h2 id="moderation-dialog-title">게시물을 숨겼습니다</h2>
        <p>{successMessage}</p>
        <button ref={successButtonRef} className="primary-button" type="button" onClick={onClose}>확인</button>
      </div> : <form className="report-dialog-content" onSubmit={submit}>
        <h2 id="moderation-dialog-title">{subjectLabel} 숨김 처리</h2>
        <p>숨김 사유는 작성자에게 표시됩니다. 작성자는 숨김 후 7일 안에 이의제기할 수 있습니다.</p>
        <label htmlFor="moderation-reason">숨김 사유</label>
        <textarea
          ref={reasonRef}
          id="moderation-reason"
          value={reason}
          maxLength={1000}
          rows={4}
          placeholder="예: 개인정보가 포함되어 있어 공개를 중단했습니다."
          onChange={(event) => { setReason(event.target.value); setValidationError('') }}
        />
        <span className="report-dialog-count">{reason.length}/1000자</span>
        {(validationError || error) && <p className="report-error" role="alert">{validationError || error}</p>}
        <div className="report-dialog-actions">
          <button className="secondary-button" type="button" disabled={submitting} onClick={onClose}>취소</button>
          <button className="danger-button" type="submit" disabled={submitting}>{submitting ? '처리 중…' : '숨김 처리'}</button>
        </div>
      </form>}
    </dialog>
  )
}

export default ModerationReasonDialog
