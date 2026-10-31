export function clearPrivateCaches() {
  if (typeof localStorage === 'undefined') return;
  for (const key of Object.keys(localStorage)) if ((key.startsWith('nitte_') && !['nitte_managed_branches', 'nitte_grievance_reset_version'].includes(key)) || key === 'auth_user_session') localStorage.removeItem(key);
}
export function safeCacheSetItem(key, value) {
  // Private records come from the signed-in user's server response, never a previous account's disk cache.
  if (key.startsWith('nitte_saved_') && key !== 'nitte_saved_category_videos' || key === 'auth_user_session') localStorage.removeItem(key);
  else localStorage.setItem(key, value);
}
export function initializePrivateCaches() {
  if (typeof localStorage === 'undefined') return;
  if (localStorage.getItem('nitte_security_version') !== 'server-sessions-v1') {
    clearPrivateCaches();
    localStorage.setItem('nitte_security_version', 'server-sessions-v1');
  }
}
