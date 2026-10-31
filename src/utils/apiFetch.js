// All browser database access goes through authenticated application endpoints.
// Supabase public-key headers are never forwarded to the application API.
export function apiFetch(input, options = {}) {
  let url = typeof input === 'string' ? input : input.url;
  const rest = /^https:\/\/[^/]+\.supabase\.co\/rest\/v1\/(.*)$/.exec(url);
  const headers = new Headers(options.headers || {});
  if (rest) {
    url = `/api/data/${rest[1]}`;
    headers.delete('apikey'); headers.delete('Authorization');
  }
  const method = String(options.method || 'GET').toUpperCase();
  if (url.startsWith('/api/') && !['GET', 'HEAD', 'OPTIONS'].includes(method) && typeof document !== 'undefined') {
    const csrf = document.cookie.split(';').map(part => part.trim()).find(part => part.startsWith('nitte_csrf='))?.slice('nitte_csrf='.length);
    if (csrf) headers.set('X-CSRF-Token', csrf);
  }
  return globalThis.fetch(url, { ...options, headers, credentials: url.startsWith('/api/') ? 'same-origin' : options.credentials });
}
