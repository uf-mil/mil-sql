import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';

const ErrorToast = ({ error, onClose }) => {
  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => {
        onClose();
      }, 5000); // Auto-dismiss after 5 seconds
      return () => clearTimeout(timer);
    }
  }, [error, onClose]);

  if (!error) return null;

  const toast = (
    <div
      style={{
        position: 'fixed',
        top: '20px',
        right: '20px',
        backgroundColor: 'var(--files, #d32f2f)',
        color: 'var(--text, #ffffff)',
        padding: '1rem 1.5rem',
        borderRadius: '4px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
        zIndex: 12000,
        maxWidth: '400px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '1rem',
      }}
    >
      <span>{error}</span>
      <button
        onClick={onClose}
        style={{
          background: 'transparent',
          border: 'none',
          color: 'var(--text, #ffffff)',
          cursor: 'pointer',
          fontSize: '1.2rem',
          padding: '0',
          width: '24px',
          height: '24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        ×
      </button>
    </div>
  );

  return createPortal(toast, document.body);
};

export default ErrorToast;
