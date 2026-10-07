import React from 'react';

export function Button({
  children,
  onClick,
  variant = 'secondary',
  disabled = false,
  loading = false,
  className = '',
  type = 'button',
  ...props
}) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      onClick={onClick}
      className={`btn btn-${variant} ${className}`}
      {...props}
    >
      {loading ? (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ animation: 'spin 1s linear infinite' }}>⏳</span>
          {children}
        </span>
      ) : (
        children
      )}
    </button>
  );
}
