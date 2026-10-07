import React from 'react';

export const DEMO_PERSONAS = [
  {
    id: '00000000-0000-0000-0000-000000000001',
    name: 'Super Administrator',
    role: 'SUPER_ADMIN',
    badge: '⚡ Super Admin',
    color: '#ef4444',
    email: 'admin@localcricket.test',
  },
  {
    id: '11111111-1111-1111-1111-111111111111',
    name: 'Amit Sharma',
    role: 'ORGANIZER',
    badge: '👑 Organizer',
    color: '#3b82f6',
    email: 'organizer@localcricket.test',
  },
  {
    id: '22222222-2222-2222-2222-222222222222',
    name: 'Suresh Raina',
    role: 'SCORER',
    badge: '📝 Scorer',
    color: '#10b981',
    email: 'scorer@localcricket.test',
  },
  {
    id: '99999999-9999-9999-9999-999999999999',
    name: 'Ravi Shastri',
    role: 'USER',
    badge: '👤 User',
    color: '#8b5cf6',
    email: 'user@localcricket.test',
  },
  {
    id: '00000000-0000-0000-0000-000000000000',
    name: 'Public Visitor',
    role: 'SPECTATOR',
    badge: '👀 Spectator',
    color: '#64748b',
    email: null,
  },
];

export function PersonaSwitcher({ currentUserId, onSelectPersona }) {
  const activePersona = DEMO_PERSONAS.find((p) => p.id === currentUserId) || DEMO_PERSONAS[0];

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
        <span style={{ fontSize: '0.65rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Persona Context <span style={{ color: '#f59e0b', fontSize: '0.6rem' }}>(Demo Only)</span>
        </span>
        <select
          value={activePersona.id}
          onChange={(e) => {
            const selected = DEMO_PERSONAS.find((p) => p.id === e.target.value);
            if (selected && onSelectPersona) {
              onSelectPersona(selected);
            }
          }}
          style={{
            background: '#1e293b',
            color: '#f8fafc',
            border: `1px solid ${activePersona.color}`,
            borderRadius: '6px',
            padding: '4px 8px',
            fontSize: '0.78rem',
            fontWeight: 700,
            cursor: 'pointer',
            outline: 'none',
          }}
        >
          {DEMO_PERSONAS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.badge} — {p.name}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
