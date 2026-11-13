import React from 'react';

export const PortalLogo = ({ height = 38 }) => (
  <div className="relative flex items-center justify-center p-1 rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
    <svg
      role="img"
      aria-label="Smart Mentorship and Grievance Portal"
      height={height}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="w-auto object-contain"
    >
      <rect x="1" y="1" width="38" height="38" rx="11" fill="#1e3a8a" />
      <path d="M10 12.5C13.5 11.2 17.4 12.2 20 14.2C22.6 12.2 26.5 11.2 30 12.5V27C26.1 25.8 22.8 26.7 20 29C17.2 26.7 13.9 25.8 10 27V12.5Z" stroke="white" strokeWidth="2" strokeLinejoin="round" />
      <path d="M20 14.5V28" stroke="#93c5fd" strokeWidth="2" />
    </svg>
  </div>
);
