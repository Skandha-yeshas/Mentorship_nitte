// Inspect ZIP directory sizes before handing an .xlsx archive to the spreadsheet parser.
export function checkWorkbookArchive(buffer) {
  const view = new DataView(buffer);
  if (view.byteLength < 4 || view.getUint32(0, true) !== 0x04034b50) return;
  let end = -1;
  for (let pos = view.byteLength - 22; pos >= Math.max(0, view.byteLength - 65557); pos--) {
    if (view.getUint32(pos, true) === 0x06054b50) { end = pos; break; }
  }
  if (end < 0) throw new Error('The Excel archive is incomplete.');
  const entries = view.getUint16(end + 10, true);
  let pos = view.getUint32(end + 16, true); let total = 0;
  if (entries > 256 || entries === 65535) throw new Error('This workbook has too many internal files.');
  for (let index = 0; index < entries; index++) {
    if (pos + 46 > view.byteLength || view.getUint32(pos, true) !== 0x02014b50) throw new Error('Invalid Excel archive directory.');
    const size = view.getUint32(pos + 24, true);
    total += size;
    if (size === 0xffffffff || total > 20 * 1024 * 1024) throw new Error('The workbook expands beyond the 20 MB safety limit. Export a simple roster.');
    if (view.getUint16(pos + 8, true) & 1) throw new Error('Password-protected workbooks are not supported.');
    pos += 46 + view.getUint16(pos + 28, true) + view.getUint16(pos + 30, true) + view.getUint16(pos + 32, true);
  }
}
