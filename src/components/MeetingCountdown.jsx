import React, { useEffect, useRef, useState } from 'react';
import { formatMeetingRemaining, getOnlineMeetingDeadline } from '../../shared/meetingDuration.js';

export default function MeetingCountdown({ meeting, onExpire }) {
  const deadline = getOnlineMeetingDeadline(meeting);
  const [now, setNow] = useState(Date.now);
  const serverNow = meeting?.serverNow;
  const callback = useRef(onExpire);
  callback.current = onExpire;
  const expiredDeadline = useRef(null);
  useEffect(() => {
    if (deadline === null) return;
    const serverTime = serverNow ? new Date(serverNow).getTime() : NaN;
    const localTime = performance.now();
    const refresh = () => {
      const current = Number.isFinite(serverTime) ? serverTime + performance.now() - localTime : Date.now();
      setNow(current);
      if (current >= deadline && expiredDeadline.current !== deadline) {
        expiredDeadline.current = deadline;
        callback.current?.();
      }
    };
    refresh();
    const timer = setInterval(refresh, 1000);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [deadline, serverNow]);
  const remaining = deadline === null ? null : Math.max(0, deadline - now);
  return <span role="timer" aria-label="Meeting time remaining" className={`text-xs tabular-nums font-semibold ${remaining !== null && remaining <= 5 * 60 * 1000 ? 'text-amber-300' : 'text-slate-200'}`}>
    {remaining === null ? '30-minute limit' : `Time left ${formatMeetingRemaining(remaining)}`}
  </span>;
}
