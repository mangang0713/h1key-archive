/**
 * 이 대화상자는 사용자가 콘텐츠 신고 사유와 선택 설명을 제출하도록 합니다.
 */

import { useEffect, useRef, type FormEvent } from 'react';
type CommunityReportDialogProps = {
  target: { id: string } | null;
  contentLabel: string;
  feedLabel: string;
  error?: string;
  submitting: boolean;
  step: 'form' | 'success';
  autoDismissSuccess?: boolean;
  details: string;
  onDetailsChange: (details: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onClose: () => void;
};

/** 신고자는 선택형 사유와 선택적 설명을 제출하고 처리 완료를 확인합니다. */
function CommunityReportDialog({
  target,
  contentLabel,
  feedLabel,
  error,
  submitting,
  step,
  autoDismissSuccess = false,
  details,
  onDetailsChange,
  onSubmit,
  onClose,
}: CommunityReportDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const primaryButtonRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!target) return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.showModal();
    textareaRef.current?.focus();
    return () => {
      if (dialog.open) dialog.close();
    };
  }, [target]);

  useEffect(() => {
    if (target && step === 'success') primaryButtonRef.current?.focus();
  }, [target, step]);

  useEffect(() => {
    if (!target || step !== 'success' || !autoDismissSuccess) return;
    const timeout = window.setTimeout(() => onCloseRef.current(), 2500);
    return () => window.clearTimeout(timeout);
  }, [target, step, autoDismissSuccess]);

  return (
    <dialog
      ref={dialogRef}
      className="report-confirmation"
      aria-labelledby="report-confirmation-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      {step === 'form' && (
        <form className="report-dialog-content" onSubmit={onSubmit}>
          <h2 id="report-confirmation-title">{contentLabel} 신고</h2>
          <p>
            신고 사유를 적어 주세요. 설명은 선택 사항이며, 비워도 신고할 수
            있습니다.
          </p>
          <label htmlFor="community-report-details">신고 사유 (선택)</label>
          <textarea
            ref={textareaRef}
            id="community-report-details"
            value={details}
            maxLength={500}
            rows={4}
            placeholder="예: 개인정보가 포함되어 있어요."
            onChange={(event) => onDetailsChange(event.target.value)}
          />
          <span className="report-dialog-count">{details.length}/500자</span>
          {error && (
            <p className="report-error" role="alert">
              {error}
            </p>
          )}
          <div className="report-dialog-actions">
            <button
              className="secondary-button"
              type="button"
              disabled={submitting}
              onClick={onClose}
            >
              취소
            </button>
            <button
              className="primary-button"
              type="submit"
              disabled={submitting}
            >
              {submitting ? '접수 중…' : '신고하기'}
            </button>
          </div>
        </form>
      )}
      {step === 'success' && (
        <div className="report-dialog-content report-confirmation-content">
          <span className="report-confirmation-icon" aria-hidden="true">
            ✓
          </span>
          <h2 id="report-confirmation-title">신고가 접수되었습니다</h2>
          <p>
            관리자가 내용을 확인할 예정입니다. 이 글은 {feedLabel}에서
            숨겼습니다.
          </p>
          <button
            ref={primaryButtonRef}
            className="primary-button"
            type="button"
            onClick={onClose}
          >
            확인
          </button>
        </div>
      )}
    </dialog>
  );
}

export default CommunityReportDialog;
