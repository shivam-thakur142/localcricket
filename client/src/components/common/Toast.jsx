import React from 'react';

export function Toast({ toasts, onDismiss }) {
  if (!toasts || toasts.length === 0) return null;

  return (
    <div className="toast-container">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast toast-${toast.type || 'error'}`}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <span style={{ fontWeight: 600 }}>{toast.title || (toast.type === 'error' ? 'Error' : 'Notice')}</span>
            <span style={{ fontSize: '0.85rem' }}>{toast.message}</span>
          </div>
          <button
            onClick={() => onDismiss(toast.id)}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'inherit',
              cursor: 'pointer',
              fontSize: '1.2rem',
              marginLeft: '8px',
            }}
          >
            &times;
          </button>
        </div>
      ))}
    </div>
  );
}
