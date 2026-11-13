export const MAX_ROSTER_ROWS = 2000;
export const MAX_ROSTER_COLUMNS = 32;
export const MAX_ROSTER_FILE_BYTES = 2 * 1024 * 1024;
const key = value => String(value).toLowerCase().replace(/[^a-z0-9]/g, '');
const text = (row, names) => {
  for (const name of names) {
    const found = Object.entries(row).find(([header, value]) => key(header) === key(name) && String(value ?? '').trim());
    if (found) return String(found[1]).trim();
  }
  return '';
};
export function normalizeRosterRow(kind, row) {
  if (!['students', 'mentors', 'ros'].includes(kind)) throw new Error('Unsupported roster type.');
  if (!row || typeof row !== 'object' || Array.isArray(row) || Object.keys(row).length > MAX_ROSTER_COLUMNS) throw new Error('Invalid roster row or too many columns.');
  for (const [name, value] of Object.entries(row)) {
    if (['proto', 'prototype', 'constructor'].includes(key(name))) throw new Error('Unsupported column name.');
    if (value !== null && !['undefined', 'string', 'number', 'boolean'].includes(typeof value)) throw new Error('Roster cells must contain plain text or numbers.');
    if (String(value ?? '').length > 500) throw new Error('A roster cell exceeds 500 characters.');
  }
  const result = {
    id: text(row, ['id', ...({ students: ['Student ID', 'Student USN', 'USN', 'USN / ID', 'Roll No', 'Roll Number'], mentors: ['Mentor ID', 'Faculty ID', 'Employee ID', 'FAC ID'], ros: ['RO ID', 'Officer ID', 'Officer Code'] })[kind]]).toUpperCase(),
    name: text(row, ['name', 'Full Name', 'Student Name', 'Faculty Name', 'Mentor Name', 'RO Name', 'Officer Name']),
    email: text(row, ['email', 'Official Email', 'Institutional Email', 'Student Email', 'Student Gmail', 'Faculty Email', 'Mentor Email', 'RO Email', 'Officer Email', 'Email Address', 'Gmail', 'Mail']).toLowerCase(),
    password: text(row, ['password', 'Initial Password', 'Generated Password'])
  };
  if (!/^[A-Z0-9][A-Z0-9._-]{0,49}$/.test(result.id)) throw new Error('A valid account ID is required (up to 50 letters, numbers, dots, hyphens or underscores).');
  if (!result.name || result.name.length > 100 || /[\x00-\x1f]/.test(result.name)) throw new Error('A name of 1–100 characters is required.');
  if (result.email.length > 150 || !/^[^\s<>,;:@]+@[A-Z0-9.-]+\.[A-Z]{2,63}$/i.test(result.email)) throw new Error('A valid institutional email is required. No address is generated automatically.');
  if (result.password && (result.password.length < 12 || result.password.length > 128)) throw new Error('Initial passwords must contain 12–128 characters, or leave the cell blank.');
  if (kind === 'students') {
    result.branch = text(row, ['branch', 'department', 'dept']);
    result.sem = Number(text(row, ['sem', 'semester']));
    result.mentorId = text(row, ['mentorId', 'mentor_id', 'Mentor ID']).toUpperCase() || null;
    if (!result.branch || result.branch.length > 50) throw new Error('Branch is required (up to 50 characters).');
    if (!Number.isInteger(result.sem) || result.sem < 1 || result.sem > 12) throw new Error('Semester must be a number from 1 to 12.');
    if (result.mentorId && !/^[A-Z0-9][A-Z0-9._-]{0,49}$/.test(result.mentorId)) throw new Error('Invalid assigned Mentor ID.');
  } else if (kind === 'mentors') {
    result.dept = text(row, ['dept', 'department', 'branch']);
    result.class = text(row, ['class', 'assigned class / batch', 'assigned class', 'batch', 'class & section']);
    if (!result.dept || result.dept.length > 100 || result.class.length > 100) throw new Error('Department is required; department and class must be at most 100 characters.');
  } else {
    result.region = text(row, ['region', 'category', 'Assigned Domain Category', 'department']);
    if (!result.region || result.region.length > 100) throw new Error('Assigned Domain Category is required (up to 100 characters).');
  }
  return result;
}
export function validateRoster(kind, rows) {
  if (!Array.isArray(rows) || !rows.length || rows.length > MAX_ROSTER_ROWS) throw Object.assign(new Error(`Import 1–${MAX_ROSTER_ROWS} records per roster.`), { status: 400 });
  const ids = new Set(); const categories = new Set();
  return rows.map((row, index) => {
    try {
      const normalized = normalizeRosterRow(kind, row);
      if (ids.has(normalized.id)) throw new Error('Duplicate account ID in this file.');
      ids.add(normalized.id);
      if (kind === 'ros') {
        const category = normalized.region.toLowerCase();
        if (categories.has(category)) throw new Error('Each issue category must have exactly one RO.');
        categories.add(category);
      }
      return normalized;
    } catch (error) { throw Object.assign(new Error(`Row ${index + 2}: ${error.message}`), { status: 400 }); }
  });
}
export const safeCsvCell = value => {
  let text = String(value ?? '');
  if (/^[\s]*[=+@-]/.test(text) || /^[\t\r\n]/.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
};
