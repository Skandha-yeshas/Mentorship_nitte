import React, { useState } from 'react';

export const NitteLogo = ({ height = 38 }) => {
  const [imageError, setImageError] = useState(false);

  return (
    <div className="relative flex items-center justify-center p-1 rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
      {!imageError ? (
        <img
          alt="NITTE University Crest Logo"
          className="w-auto object-contain"
          style={{ height: `${height}px` }}
          src="https://lh3.googleusercontent.com/aida/AEtjO1WgqKSmX0AuSYom1zQkRsqMlOMpB91DZVDZmJxk7GHx3GDujBqCwzlHozl4AwztvZxQ4Z-HzygzEmLxuzhONOxV4zqTnVdIDRwTMSA5ugU08Ak99dp1wIgtSbp1jYJVW5JsQyLXwK6Szs_-d3ilDdl1qDYtnjNQ7HS2mkRh2jHf5XXoHdrVi58u8Wfm6VOydl6uCD9f3vpHyi0x9zgsi1ktna62F6q4rQDoEO0US1tM"
          onError={() => setImageError(true)}
        />
      ) : (
        <svg
          height={height}
          viewBox="0 0 140 40"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="w-auto object-contain"
        >
          {/* University Crest Shield */}
          <rect x="2" y="2" width="36" height="36" rx="8" fill="#1e2269" />
          <path d="M20 7L31 13V22C31 28.5 26.2 33.2 20 35C13.8 33.2 9 28.5 9 22V13L20 7Z" fill="#2563eb" stroke="#ffffff" strokeWidth="1.2" />
          <path d="M15 19C17 18 19 18.5 20 20C21 18.5 23 18 25 19V27C23 26 21 26.5 20 28C19 26.5 17 26 15 27V19Z" fill="#ffffff" />
          <line x1="20" y1="20" x2="20" y2="28" stroke="#2563eb" strokeWidth="1" />
          <text x="46" y="22" fill="#1e2269" fontFamily="system-ui, -apple-system, sans-serif" fontWeight="900" fontSize="16" letterSpacing="0.5">NITTE</text>
          <text x="47" y="32" fill="#64748b" fontFamily="system-ui, -apple-system, sans-serif" fontWeight="700" fontSize="8" letterSpacing="0.8">UNIVERSITY</text>
        </svg>
      )}
    </div>
  );
};

