import React from 'react';
import './ConflictErrorModal.css';

const ConflictErrorModal = ({ visible, errorType, message, supplyName, onClose, onRefresh }) => {
  const handleKeyDown = React.useCallback((e) => {
    if (e.key === 'Escape') {
      onClose();
    }
  }, [onClose]);

  React.useEffect(() => {
    if (visible) {
      document.addEventListener('keydown', handleKeyDown);
      return () => {
        document.removeEventListener('keydown', handleKeyDown);
      };
    }
  }, [visible, handleKeyDown]);

  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  if (!visible) return null;

  return (
    <div className="conflict-error-overlay" onClick={handleOverlayClick}>
      <div className="conflict-error-modal" onClick={(e) => e.stopPropagation()}>
        <button className="conflict-error-close" onClick={onClose}>×</button>
        <h2>⚠️ Action Failed</h2>
        <p>{message}</p>
        {supplyName && (
          <p className="conflict-error-item"><strong>Item: {supplyName}</strong></p>
        )}
        <div className="conflict-error-actions">
          {onRefresh && (
            <button onClick={onRefresh} className="conflict-error-refresh">
              Refresh Page
            </button>
          )}
          <button onClick={onClose} className="conflict-error-dismiss">
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConflictErrorModal;
