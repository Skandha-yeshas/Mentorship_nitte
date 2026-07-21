import React from 'react';

// 1. BAR CHART COMPONENT
export const BarChart = ({ data, title, height = 200 }) => {
  // Find maximum value for scaling
  const maxVal = Math.max(...data.map(d => d.value), 1);
  
  return (
    <div className="glass-card chart-card">
      <h3 className="card-title" style={{ marginBottom: '20px' }}>{title}</h3>
      <div className="svg-chart-container" style={{ height: `${height}px` }}>
        {/* Y-Axis Labels */}
        <div className="bar-chart-y-axis">
          <span>{Math.round(maxVal)}</span>
          <span>{Math.round(maxVal / 2)}</span>
          <span>0</span>
        </div>
        
        {/* Bars Container */}
        <div className="bar-chart-body">
          {data.map((item, idx) => {
            const percentage = (item.value / maxVal) * 100;
            // Use different color accents for different bars
            const colors = ['var(--accent-indigo)', 'var(--accent-purple)', 'var(--accent-blue)', 'var(--accent-emerald)', 'var(--accent-amber)', 'var(--accent-rose)'];
            const barColor = colors[idx % colors.length];

            return (
              <div key={idx} className="bar-group">
                {/* Tooltip */}
                <div className="chart-tooltip" style={{ opacity: undefined }}>
                  {item.name}: {item.value}
                </div>
                
                {/* Visual Bar */}
                <div 
                  className="bar-rect" 
                  style={{ 
                    height: `${percentage || 5}%`, // min 5% height so it is clickable
                    backgroundColor: barColor,
                    boxShadow: `0 0 10px ${barColor}40`
                  }}
                />
                
                {/* Label */}
                <span className="bar-label" title={item.name}>{item.name}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

// 2. DONUT (PIE) CHART COMPONENT
export const DonutChart = ({ data, title }) => {
  const total = data.reduce((sum, d) => sum + d.value, 0) || 1;
  
  // Calculate segments for SVG stroke-dasharray
  let accumulatedPercent = 0;
  const segments = data.map((item, idx) => {
    const percent = (item.value / total) * 100;
    const dashOffset = (accumulatedPercent / 100) * 157.08; // Circumference of 50r circle is 2*pi*r, for r=25 it is 157.08
    accumulatedPercent += percent;
    
    const colors = ['#8b5cf6', '#10b981', '#f59e0b', '#f43f5e', '#3b82f6'];
    return {
      ...item,
      color: colors[idx % colors.length],
      dashArray: `${(percent / 100) * 157.08} 157.08`,
      dashOffset: -dashOffset
    };
  });

  return (
    <div className="glass-card chart-card">
      <h3 className="card-title" style={{ marginBottom: '16px' }}>{title}</h3>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '24px', flex: 1, flexWrap: 'wrap' }}>
        
        {/* SVG Circle */}
        <div style={{ position: 'relative', width: '140px', height: '140px' }}>
          <svg viewBox="0 0 64 64" width="100%" height="100%">
            {/* Gray background track */}
            <circle cx="32" cy="32" r="25" fill="transparent" stroke="rgba(255,255,255,0.03)" strokeWidth="8" />
            
            {/* Segments */}
            {segments.map((seg, idx) => (
              <circle
                key={idx}
                cx="32"
                cy="32"
                r="25"
                fill="transparent"
                stroke={seg.color}
                strokeWidth="8"
                strokeDasharray={seg.dashArray}
                strokeDashoffset={seg.dashOffset}
                transform="rotate(-90 32 32)"
                style={{ transition: 'stroke-dashoffset 0.5s ease' }}
              />
            ))}
          </svg>
          
          {/* Inner Text overlay */}
          <div style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            textAlign: 'center'
          }}>
            <span style={{ fontSize: '1.4rem', fontWeight: '800' }}>{total}</span>
            <p style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', marginTop: '-2px' }}>Total</p>
          </div>
        </div>

        {/* Legend */}
        <div style={{ flex: 1, minWidth: '120px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {segments.map((seg, idx) => (
              <div key={idx} className="legend-item" style={{ fontSize: '0.8rem' }}>
                <span className="legend-dot" style={{ backgroundColor: seg.color }} />
                <span style={{ color: 'var(--text-secondary)' }}>{seg.name}:</span>
                <strong style={{ marginLeft: 'auto' }}>{seg.value} ({Math.round((seg.value / total) * 100)}%)</strong>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
};
