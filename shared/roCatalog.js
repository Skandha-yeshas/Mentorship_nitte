const normalize = value => String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
const field = (row, names) => {
  const entries = Object.entries(row || {});
  for (const name of names) {
    const found = entries.find(([key, value]) => normalize(key) === normalize(name) && String(value ?? '').trim());
    if (found) return String(found[1]).trim();
  }
  return '';
};

export function normalizeRoRosterRow(row) {
  const id = field(row, ['id', 'roId', 'RO ID', 'Officer ID', 'Officer Code']).toUpperCase();
  const name = field(row, ['name', 'roName', 'RO Name', 'Officer Name', 'Full Name']);
  const email = field(row, ['email', 'roEmail', 'Official Email', 'Officer Email', 'Gmail', 'Email Address', 'RO Gmail']).toLowerCase();
  const region = field(row, ['Assigned Domain Category', 'category', 'region', 'Department']);
  const password = field(row, ['password', 'Initial Password', 'Generated Password']);
  if (!id || !name || !email || !region) throw new Error('RO ID, RO Name, Official Email, and Assigned Domain Category are required.');
  if (id.length > 50 || name.length > 100 || email.length > 100 || region.length > 100) throw new Error('An RO roster field exceeds its database length limit.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Enter a valid Official Email.');
  if (password.length > 100) throw new Error('Initial Password must not exceed 100 characters.');
  return { id, name, email, region, category: region, password };
}

export function getRoCategories(ros = []) {
  const categories = new Map();
  for (const ro of ros) {
    const category = String(ro.region ?? ro.category ?? '').trim();
    if (category && !categories.has(normalize(category))) categories.set(normalize(category), category);
  }
  return [...categories.values()];
}

export function findRoForCategory(ros = [], category) {
  const target = normalize(category);
  return target ? ros.find(ro => normalize(ro.region ?? ro.category) === target) || null : null;
}

export function getCategoryDomain(category) {
  return String(category || '').split(' - ')[0].trim();
}

export function clearResetGrievanceCaches(storage, version) {
  if (!version || storage.getItem('nitte_grievance_reset_version') === version) return false;
  for (const key of ['nitte_saved_issues', 'nitte_saved_meetings', 'nitte_saved_recordings', 'nitte_saved_category_videos', 'nitte_saved_ros', 'nitte_saved_gmail_logs']) storage.removeItem(key);
  storage.setItem('nitte_grievance_reset_version', version);
  return true;
}
