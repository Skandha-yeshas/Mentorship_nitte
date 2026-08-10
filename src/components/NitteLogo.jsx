import React from 'react';

export const NitteLogo = ({ height = 36 }) => {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', userSelect: 'none' }}>
      <div style={{ 
        height: `${height}px`, 
        padding: '0 16px', 
        borderRadius: '6px', 
        background: 'var(--nitte-blue)', 
        color: '#ffffff', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center', 
        fontWeight: 800, 
        fontSize: '1rem', 
        letterSpacing: '0.08em' 
      }}>
        LOGO
      </div>
    </div>
  );
};
