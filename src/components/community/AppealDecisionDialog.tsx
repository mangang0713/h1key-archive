import { useEffect, useRef, useState, type FormEvent } from 'react'

export type AppealDecision = 'approve' | 'reject'

type AppealDecisionDialogProps = {
  decision: AppealDecision
  submitting: boolean
  error?: string
  successMessage?: string
  onSubmit: (reason: string) => void
  onClose: () => void
}

function AppealDecisionDialog({ decision, submitting, error, successMessage, onSubmit, onClose }: AppealDecisionDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const reasonRef = useRef<HTMLTextAreaElement>(null)
  const successButtonRef = useRef<HTMLButtonElement>(null)
  const [reason, setReason] = useState('')
  const [validationError, setValidationError] = useState('')
  const isApproval = decision === 'approve'

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
    if (!isApproval && !trimmedReason) {
      setValidationError('기각 사유를 작성해 주세요. 이 내용은 작성자에게 전달됩니다.')
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
      aria-labelledby="appeal-decision-title"
      onCancel={(event) => { event.preventDefault(); if (!submitting) onClose() }}
    >
      {successMessage ? <div className="report-dialog-content report-confirmation-content">
        <span className="report-confirmation-icon" aria-hidden="true">✓</span>
        <h2 id="appeal-decision-title">{isApproval ? '이의제기를 승인했습니다' : '이의제기를 기각했습니다'}</h2>
        <p>{successMessage}</p>
        <button ref={successButtonRef} className="primary-button" type="button" onClick={onClose}>확인</button>
      </div> : <form className="report-dialog-content" onSubmit={submit}>
        <h2 id="appeal-decision-title">{isApproval ? '이의제기 승인' : '이의제기 기각'}</h2>
        <p>{isApproval
          ? '승인하면 숨겨진 게시물이 즉시 다시 공개됩니다. 작성자에게 남길 안내는 선택 사항입니다.'
          : '기각하면 게시글과 사진이 즉시 영구 삭제됩니다. 작성자는 삭제된 게시물의 내용 없이 기각 사유를 7일간 확인할 수 있습니다.'}</p>
        <label htmlFor="appeal-decision-reason">{isApproval ? '작성자에게 남길 안내 (선택)' : '기각 사유'}</label>
        <textarea
          ref={reasonRef}
          id="appeal-decision-reason"
          value={reason}
          maxLength={1000}
          rows={4}
          placeholder={isApproval ? '예: 이의제기를 확인해 게시물을 복원했습니다.' : '이의제기를 기각하는 이유를 작성해 주세요.'}
          onChange={(event) => { setReason(event.target.value); setValidationError('') }}
        />
        <span className="report-dialog-count">{reason.length}/1000자</span>
        {(validationError || error) && <p className="report-error" role="alert">{validationError || error}</p>}
        <div className="report-dialog-actions">
          <button className="secondary-button" type="button" disabled={submitting} onClick={onClose}>취소</button>
          <button className={isApproval ? 'primary-button' : 'danger-button'} type="submit" disabled={submitting}>
            {submitting ? '처리 중…' : isApproval ? '승인하고 복원' : '이의제기 기각'}
          </button>
        </div>
      </form>}
    </dialog>
  )
}

export default AppealDecisionDialog
