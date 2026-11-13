import * as XLSX from 'xlsx';
import { MAX_ROSTER_ROWS, MAX_ROSTER_COLUMNS, validateRoster } from '../../shared/rosterValidation.js';
import { checkWorkbookArchive } from '../../shared/zipLimits.js';

self.onmessage = ({ data: { buffer, kind } }) => {
  try {
    checkWorkbookArchive(buffer);
    const workbook = XLSX.read(buffer, { type: 'array', dense: true, sheetRows: MAX_ROSTER_ROWS + 2, cellFormula: true, cellHTML: false, cellStyles: false, bookVBA: false });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    if (!sheet) throw new Error('The first worksheet is empty.');
    const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1');
    if (sheet['!fullref'] && XLSX.utils.decode_range(sheet['!fullref']).e.r > MAX_ROSTER_ROWS || range.e.r > MAX_ROSTER_ROWS) throw new Error(`Use at most ${MAX_ROSTER_ROWS} data rows.`);
    if (range.e.c >= MAX_ROSTER_COLUMNS) throw new Error(`Use at most ${MAX_ROSTER_COLUMNS} columns.`);
    const grid = sheet['!data'] || sheet;
    const cellAt = (row, col) => sheet['!data'] || Array.isArray(sheet) ? grid[row]?.[col] : sheet[XLSX.utils.encode_cell({ r: row, c: col })];
    const headers = new Set();
    for (let col = 0; col <= range.e.c; col++) {
      const value = String(cellAt(0, col)?.v || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      if (['proto', 'constructor', 'prototype'].includes(value) || value && headers.has(value)) throw new Error('Roster headers must be unique plain field names.');
      if (value) headers.add(value);
    }
    for (let row = 0; row <= range.e.r; row++) for (let col = 0; col <= range.e.c; col++) {
      const cell = cellAt(row, col);
      if (cell?.f) throw new Error('Roster cells must contain values, not spreadsheet formulas.');
    }
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false }).filter(row => Object.values(row).some(value => String(value).trim()));
    validateRoster(kind, rows);
    self.postMessage({ rows });
  } catch (error) { self.postMessage({ error: error.message || 'The roster file could not be read.' }); }
};
