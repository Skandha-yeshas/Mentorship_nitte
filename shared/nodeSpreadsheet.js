// SheetJS's supported ESM distribution requires an explicit Node filesystem adapter.
import * as fs from 'node:fs';
import XLSX from 'xlsx';
XLSX.set_fs(fs);
export default XLSX;
