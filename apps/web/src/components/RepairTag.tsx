import QRCode from 'qrcode';

export type TagInfo = {
  serial: string;
  ticketNumber: string;
  model: string;
  color: string;
  defect: string;
  date: string;
  title: string;
  dir: 'ltr' | 'rtl';
};

const esc = (v: string) => v.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/**
 * Prints a repair tag (100 × 60 mm) to stick on the unit: QR code of the serial number,
 * so any scanner in the factory opens the unit straight away.
 * Works on any printer; on a label printer, set the paper size to 100 × 60 mm.
 */
export async function printRepairTag(info: TagInfo) {
  const qr = await QRCode.toDataURL(info.serial, { margin: 0, width: 360, errorCorrectionLevel: 'M' });
  const html = `<!doctype html><html dir="${info.dir}"><head><meta charset="utf-8"><title>${esc(info.ticketNumber)}</title>
<style>
  @page { size: 100mm 60mm; margin: 3mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: "Noto Sans", "Noto Sans Arabic", Arial, sans-serif; }
  .tag { width: 94mm; height: 54mm; border: 0.6mm solid #000; border-radius: 2mm; padding: 2.5mm; display: flex; gap: 3mm; }
  .qr { width: 30mm; height: 30mm; }
  .info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1mm; }
  .title { font-weight: 800; font-size: 13pt; background: #000; color: #fff; padding: 0.6mm 2mm; border-radius: 1mm; text-align: center; }
  .serial { font-family: monospace; font-weight: 800; font-size: 13pt; letter-spacing: 0.3mm; word-break: break-all; }
  .row { font-size: 9pt; }
  .defect { font-size: 10pt; font-weight: 700; }
  .ticket { font-family: monospace; font-size: 10pt; text-align: center; margin-top: 1mm; }
</style></head><body><div class="tag">
  <div><img class="qr" src="${qr}"><div class="ticket">${esc(info.ticketNumber)}</div></div>
  <div class="info">
    <div class="title">${esc(info.title)}</div>
    <div class="serial">${esc(info.serial)}</div>
    <div class="row">${esc(info.model)} · ${esc(info.color)}</div>
    <div class="defect">${esc(info.defect)}</div>
    <div class="row">${esc(info.date)}</div>
  </div>
</div></body></html>`;

  // Print from a hidden frame so the current screen stays as it is.
  const frame = document.createElement('iframe');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
  document.body.appendChild(frame);
  const doc = frame.contentDocument!;
  doc.open();
  doc.write(html);
  doc.close();
  const img = doc.querySelector('img')!;
  await new Promise((r) => (img.complete ? r(null) : (img.onload = () => r(null))));
  frame.contentWindow!.focus();
  frame.contentWindow!.print();
  setTimeout(() => frame.remove(), 60_000);
}
