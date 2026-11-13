export const DIRECT_ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' }
];

// Return only RTC configuration fields, never provider tokens or response metadata.
export function sanitizeIceServers(servers) {
  if (!Array.isArray(servers)) return [];
  return servers.slice(0, 12).flatMap(server => {
    if (!server || typeof server !== 'object') return [];
    const urls = (Array.isArray(server.urls) ? server.urls : [server.urls]).filter(url =>
      typeof url === 'string' && url.length <= 500 && /^(?:stun|stuns|turn|turns):[^\s/@]+$/i.test(url) &&
      !/:53(?:\?|$)/.test(url)).slice(0, 12);
    if (!urls.length) return [];
    const relay = urls.some(url => /^turns?:/i.test(url));
    if (relay && (typeof server.username !== 'string' || !server.username || typeof server.credential !== 'string' || !server.credential)) return [];
    return [{ urls, ...(relay ? { username: server.username, credential: server.credential } : {}) }];
  });
}

export const hasTurnServer = servers => servers.some(server =>
  (Array.isArray(server.urls) ? server.urls : [server.urls]).some(url => /^turns?:/i.test(url)));
