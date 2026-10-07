import React from 'react';

export function Badge({ children, variant = 'neutral', className = '' }) {
  let badgeClass = 'badge ';
  switch (variant) {
    case 'live':
      badgeClass += 'badge-live';
      break;
    case 'free-hit':
      badgeClass += 'badge-free-hit';
      break;
    case 'completed':
      badgeClass += 'badge-completed';
      break;
    default:
      badgeClass += 'bg-slate-700 text-slate-300';
  }

  return <span className={`${badgeClass} ${className}`}>{children}</span>;
}
