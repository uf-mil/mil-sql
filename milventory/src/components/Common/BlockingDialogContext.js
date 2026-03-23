import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
} from 'react';
import './BlockingDialog.css';

const BlockingDialogContext = createContext(null);

/**
 * App-wide blocking modal replacements for alert() / confirm().
 * showAlert(message, { title?, confirmLabel? }) -> Promise<void>
 * showConfirm(message, { title?, confirmLabel?, cancelLabel?, danger? }) -> Promise<boolean>
 */
export function BlockingDialogProvider({ children }) {
  const [dialog, setDialog] = useState(null);

  const showAlert = useCallback((message, options = {}) => {
    const text = typeof message === 'string' ? message : String(message);
    return new Promise((resolve) => {
      setDialog({
        kind: 'alert',
        heading: options.title != null && options.title !== '' ? options.title : null,
        message: text,
        confirmLabel: options.confirmLabel || 'OK',
        onConfirm: () => {
          setDialog(null);
          resolve();
        },
      });
    });
  }, []);

  const showConfirm = useCallback((message, options = {}) => {
    const text = typeof message === 'string' ? message : String(message);
    return new Promise((resolve) => {
      setDialog({
        kind: 'confirm',
        heading: options.title != null && options.title !== '' ? options.title : 'Confirm',
        message: text,
        confirmLabel: options.confirmLabel || 'OK',
        cancelLabel: options.cancelLabel || 'Cancel',
        danger: Boolean(options.danger),
        onConfirm: () => {
          setDialog(null);
          resolve(true);
        },
        onCancel: () => {
          setDialog(null);
          resolve(false);
        },
      });
    });
  }, []);

  useEffect(() => {
    if (!dialog) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        if (dialog.kind === 'confirm') dialog.onCancel();
        else dialog.onConfirm();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [dialog]);

  const handleOverlayMouseDown = (e) => {
    if (e.target !== e.currentTarget) return;
    if (dialog.kind === 'confirm') dialog.onCancel();
    else dialog.onConfirm();
  };

  return (
    <BlockingDialogContext.Provider value={{ showAlert, showConfirm }}>
      {children}
      {dialog && (
        <div
          className="blocking-dialog-overlay"
          role="presentation"
          onMouseDown={handleOverlayMouseDown}
        >
          <div
            className="blocking-dialog modal"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby={dialog.heading ? 'blocking-dialog-heading' : undefined}
            aria-label={!dialog.heading ? 'Notice' : undefined}
            aria-describedby="blocking-dialog-desc"
            onMouseDown={(e) => e.stopPropagation()}
          >
            {dialog.heading && (
              <h3 id="blocking-dialog-heading">{dialog.heading}</h3>
            )}
            <p id="blocking-dialog-desc" className="blocking-dialog-message">
              {dialog.message}
            </p>
            <div className="modal-actions">
              {dialog.kind === 'confirm' && (
                <button
                  type="button"
                  className="cancel"
                  onClick={dialog.onCancel}
                >
                  {dialog.cancelLabel}
                </button>
              )}
              <button
                type="button"
                className={
                  dialog.kind === 'confirm' && dialog.danger
                    ? 'save blocking-dialog-confirm-danger'
                    : 'save'
                }
                onClick={dialog.onConfirm}
              >
                {dialog.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </BlockingDialogContext.Provider>
  );
}

export function useBlockingDialog() {
  const ctx = useContext(BlockingDialogContext);
  if (!ctx) {
    throw new Error('useBlockingDialog must be used within BlockingDialogProvider');
  }
  return ctx;
}
