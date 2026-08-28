'use strict';

/* ==========================================================================
   PLATEN — QR code generator
   QR matrix math: vendor/qrcodegen.js (Project Nayuki, MIT license).
   Everything below — UI, canvas rendering, SVG builder, and the from-scratch
   vector PDF writer — is original to this app and has zero runtime
   dependencies: no CDN calls, no server, no API keys, no cost.
   ========================================================================== */

const els = {
  input: document.getElementById('data-input'),
  byteCount: document.getElementById('byte-count'),
  versionLabel: document.getElementById('qr-version-label'),
  eccGroup: document.getElementById('ecc-group'),
  fg: document.getElementById('fg-color'),
  fgText: document.getElementById('fg-color-text'),
  bg: document.getElementById('bg-color'),
  bgText: document.getElementById('bg-color-text'),
  transparent: document.getElementById('transparent-bg'),
  contrastWarning: document.getElementById('contrast-warning'),
  unitGroup: document.getElementById('unit-group'),
  pxControls: document.getElementById('px-controls'),
  mmControls: document.getElementById('mm-controls'),
  pxSize: document.getElementById('px-size'),
  mmPreset: document.getElementById('mm-preset'),
  mmCustomRow: document.getElementById('mm-custom-row'),
  mmCustom: document.getElementById('mm-custom'),
  dpiSelect: document.getElementById('dpi-select'),
  quietZone: document.getElementById('quiet-zone'),
  canvas: document.getElementById('qr-canvas'),
  emptyMsg: document.getElementById('qr-empty-msg'),
  specLine: document.getElementById('spec-line'),
  dlPng: document.getElementById('dl-png'),
  dlJpg: document.getElementById('dl-jpg'),
  dlWebp: document.getElementById('dl-webp'),
  dlSvg: document.getElementById('dl-svg'),
  dlPdf: document.getElementById('dl-pdf'),
};

const state = {
  ecc: 'M',
  unit: 'px',
  qr: null,           // current qrcodegen.QrCode
};

/* ---------------------------------------------------------------------- *
 * 1. QR generation
 * ---------------------------------------------------------------------- */

const ECC_MAP = {
  L: qrcodegen.QrCode.Ecc.LOW,
  M: qrcodegen.QrCode.Ecc.MEDIUM,
  Q: qrcodegen.QrCode.Ecc.QUARTILE,
  H: qrcodegen.QrCode.Ecc.HIGH,
};

function buildQr(text, eccKey) {
  if (!text) return null;
  try {
    return qrcodegen.QrCode.encodeText(text, ECC_MAP[eccKey]);
  } catch (e) {
    // Text too long even at version 40 — fall back to lowest ECC to
    // maximise capacity, and if that still fails, give up gracefully.
    try {
      return qrcodegen.QrCode.encodeText(text, qrcodegen.QrCode.Ecc.LOW);
    } catch (e2) {
      return null;
    }
  }
}

/* ---------------------------------------------------------------------- *
 * 2. Sizing — resolve current UI choices into a pixel/physical spec
 * ---------------------------------------------------------------------- */

function currentQuietZone() {
  return parseInt(els.quietZone.value, 10);
}

function currentMm() {
  const preset = els.mmPreset.value;
  if (preset === 'custom') return parseFloat(els.mmCustom.value) || 30;
  return parseFloat(preset);
}

function currentDpi() {
  return parseInt(els.dpiSelect.value, 10);
}

// Returns the side length, in raster pixels, that the *whole* image
// (QR + quiet zone) should be rendered at.
function currentRasterPx() {
  if (state.unit === 'px') return parseInt(els.pxSize.value, 10);
  const mm = currentMm();
  const dpi = currentDpi();
  return Math.round((mm / 25.4) * dpi);
}

// Returns the physical side length in millimetres (used for SVG viewBox
// annotation and the PDF page size). In screen/px mode we treat 1 module
// as arbitrary — the vector formats always report *some* physical size,
// defaulting to a 30mm working size, so files remain usable in layout apps.
function currentPhysicalMm() {
  return state.unit === 'mm' ? currentMm() : 30;
}

/* ---------------------------------------------------------------------- *
 * 3. Canvas (raster) rendering
 * ---------------------------------------------------------------------- */

function renderToCanvas(qr, canvas, sizePx, opts) {
  const { fg, bg, transparent, quiet } = opts;
  const modules = qr.size;
  const total = modules + quiet * 2;
  const scale = sizePx / total;

  canvas.width = sizePx;
  canvas.height = sizePx;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, sizePx, sizePx);

  if (!transparent) {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, sizePx, sizePx);
  }

  ctx.fillStyle = fg;
  for (let y = 0; y < modules; y++) {
    for (let x = 0; x < modules; x++) {
      if (qr.getModule(x, y)) {
        const px = (x + quiet) * scale;
        const py = (y + quiet) * scale;
        // Slight rounding fix so adjacent modules don't leave hairline gaps.
        ctx.fillRect(Math.floor(px), Math.floor(py), Math.ceil(scale) + 1, Math.ceil(scale) + 1);
      }
    }
  }
  return canvas;
}

/* ---------------------------------------------------------------------- *
 * 4. Vector SVG builder (row-run-length merged for compact, RIP-friendly
 *    output)
 * ---------------------------------------------------------------------- */

function buildSvg(qr, opts) {
  const { fg, bg, transparent, quiet, physicalMm } = opts;
  const modules = qr.size;
  const total = modules + quiet * 2;
  const unit = physicalMm / total; // mm per module

  let rects = '';
  for (let y = 0; y < modules; y++) {
    let x = 0;
    while (x < modules) {
      if (!qr.getModule(x, y)) { x++; continue; }
      let runStart = x;
      while (x < modules && qr.getModule(x, y)) x++;
      const runLen = x - runStart;
      const rx = ((runStart + quiet) * unit).toFixed(3);
      const ry = ((y + quiet) * unit).toFixed(3);
      const rw = (runLen * unit).toFixed(3);
      const rh = unit.toFixed(3);
      rects += `<rect x="${rx}" y="${ry}" width="${rw}" height="${rh}"/>`;
    }
  }

  const bgRect = transparent ? '' : `<rect x="0" y="0" width="${physicalMm}" height="${physicalMm}" fill="${bg}"/>`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${physicalMm} ${physicalMm}" width="${physicalMm}mm" height="${physicalMm}mm" shape-rendering="crispEdges">
${bgRect}
<g fill="${fg}">${rects}</g>
</svg>`;
}

/* ---------------------------------------------------------------------- *
 * 5. Vector PDF builder — written from scratch, no library.
 *    Draws the QR as filled rectangles directly in PDF content-stream
 *    operators, so the output stays crisp at any print size.
 * ---------------------------------------------------------------------- */

function hexToRgbFraction(hex) {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16) / 255;
  const g = parseInt(h.substring(2, 4), 16) / 255;
  const b = parseInt(h.substring(4, 6), 16) / 255;
  return [r, g, b].map(v => v.toFixed(3));
}

function buildPdf(qr, opts) {
  const { fg, bg, transparent, quiet, physicalMm } = opts;
  const MM_TO_PT = 72 / 25.4;
  const pageSizePt = physicalMm * MM_TO_PT;
  const modules = qr.size;
  const total = modules + quiet * 2;
  const unitPt = pageSizePt / total;

  const [fr, fg_, fb] = hexToRgbFraction(fg);
  const [br, bgc, bb] = hexToRgbFraction(bg);

  let stream = '';
  if (!transparent) {
    stream += `${br} ${bgc} ${bb} rg\n0 0 ${pageSizePt.toFixed(2)} ${pageSizePt.toFixed(2)} re\nf\n`;
  }
  stream += `${fr} ${fg_} ${fb} rg\n`;
  for (let y = 0; y < modules; y++) {
    let x = 0;
    while (x < modules) {
      if (!qr.getModule(x, y)) { x++; continue; }
      let runStart = x;
      while (x < modules && qr.getModule(x, y)) x++;
      const runLen = x - runStart;
      const rx = (runStart + quiet) * unitPt;
      // PDF origin is bottom-left; our row 0 is the top row.
      const ry = pageSizePt - (y + quiet + 1) * unitPt;
      const rw = runLen * unitPt;
      stream += `${rx.toFixed(2)} ${ry.toFixed(2)} ${rw.toFixed(2)} ${unitPt.toFixed(2)} re\n`;
    }
  }
  stream += 'f\n';

  // --- Assemble the PDF byte-for-byte ---
  const objects = [];
  objects.push('<< /Type /Catalog /Pages 2 0 R >>');
  objects.push('<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  objects.push(
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageSizePt.toFixed(2)} ${pageSizePt.toFixed(2)}] ` +
    `/Resources << /ProcSet [/PDF] >> /Contents 4 0 R >>`
  );
  objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}endstream`);
  const infoDict = `<< /Producer (Platen QR Generator) /Title (QR Code) /CreationDate (D:${pdfDate()}) >>`;
  objects.push(infoDict);

  let pdf = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';
  const offsets = [0];
  objects.forEach((obj, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  });

  const xrefStart = pdf.length;
  const objCount = objects.length + 1;
  pdf += `xref\n0 ${objCount}\n0000000000 65535 f \n`;
  for (let i = 1; i < objCount; i++) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objCount} /Root 1 0 R /Info 5 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;

  // Convert the Latin1-safe string to bytes.
  const bytes = new Uint8Array(pdf.length);
  for (let i = 0; i < pdf.length; i++) bytes[i] = pdf.charCodeAt(i) & 0xff;
  return bytes;
}

function pdfDate() {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

/* ---------------------------------------------------------------------- *
 * 6. Downloads
 * ---------------------------------------------------------------------- */

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function currentOpts() {
  return {
    fg: els.fg.value,
    bg: els.bg.value,
    transparent: els.transparent.checked,
    quiet: currentQuietZone(),
    physicalMm: currentPhysicalMm(),
  };
}

function exportRaster(mime, filename, quality) {
  if (!state.qr) return;
  const sizePx = Math.max(currentRasterPx(), 64);
  const off = document.createElement('canvas');
  renderToCanvas(state.qr, off, sizePx, currentOpts());
  off.toBlob(blob => { if (blob) downloadBlob(blob, filename); }, mime, quality);
}

function exportSvg() {
  if (!state.qr) return;
  const svg = buildSvg(state.qr, currentOpts());
  downloadBlob(new Blob([svg], { type: 'image/svg+xml' }), 'qr-code.svg');
}

function exportPdf() {
  if (!state.qr) return;
  const bytes = buildPdf(state.qr, currentOpts());
  downloadBlob(new Blob([bytes], { type: 'application/pdf' }), 'qr-code.pdf');
}

/* ---------------------------------------------------------------------- *
 * 7. UI wiring
 * ---------------------------------------------------------------------- */

function relativeLuminance(hex) {
  const [r, g, b] = hexToRgbFraction(hex).map(Number);
  const f = c => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
function contrastRatio(hexA, hexB) {
  const L1 = relativeLuminance(hexA) + 0.05;
  const L2 = relativeLuminance(hexB) + 0.05;
  return L1 > L2 ? L1 / L2 : L2 / L1;
}

function refresh() {
  const text = els.input.value;
  const bytes = new TextEncoder().encode(text).length;
  els.byteCount.textContent = `${bytes} byte${bytes === 1 ? '' : 's'}`;

  const hasText = text.trim().length > 0;
  els.emptyMsg.style.display = hasText ? 'none' : 'flex';
  [els.dlPng, els.dlJpg, els.dlWebp, els.dlSvg, els.dlPdf].forEach(b => (b.disabled = !hasText));

  if (!hasText) {
    state.qr = null;
    els.versionLabel.textContent = '—';
    els.specLine.textContent = '—';
    const ctx = els.canvas.getContext('2d');
    ctx.clearRect(0, 0, els.canvas.width, els.canvas.height);
    return;
  }

  const qr = buildQr(text, state.ecc);
  state.qr = qr;
  if (!qr) {
    els.versionLabel.textContent = 'too long to encode';
    els.specLine.textContent = 'Content exceeds QR capacity — shorten it.';
    return;
  }

  els.versionLabel.textContent = `v${qr.version} · ${qr.size}×${qr.size} modules`;

  const opts = currentOpts();
  const previewSize = 512;
  renderToCanvas(qr, els.canvas, previewSize, opts);
  els.canvas.style.width = '100%';
  els.canvas.style.height = '100%';

  const quiet = opts.quiet;
  if (state.unit === 'mm') {
    const mm = currentMm();
    const dpi = currentDpi();
    const px = Math.round((mm / 25.4) * dpi);
    els.specLine.textContent = `${mm}mm @ ${dpi}dpi → ${px}×${px}px raster · quiet zone ${quiet} modules`;
  } else {
    els.specLine.textContent = `${els.pxSize.value}×${els.pxSize.value}px · quiet zone ${quiet} modules`;
  }

  const ratio = contrastRatio(opts.fg, opts.bg);
  els.contrastWarning.hidden = opts.transparent || ratio >= 2.5;
}

// -- ECC segmented control
els.eccGroup.addEventListener('click', e => {
  const btn = e.target.closest('.seg');
  if (!btn) return;
  state.ecc = btn.dataset.ecc;
  [...els.eccGroup.children].forEach(b => b.setAttribute('aria-checked', b === btn ? 'true' : 'false'));
  refresh();
});

// -- Unit segmented control
els.unitGroup.addEventListener('click', e => {
  const btn = e.target.closest('.seg');
  if (!btn) return;
  state.unit = btn.dataset.unit;
  [...els.unitGroup.children].forEach(b => b.setAttribute('aria-checked', b === btn ? 'true' : 'false'));
  els.pxControls.hidden = state.unit !== 'px';
  els.mmControls.hidden = state.unit !== 'mm';
  refresh();
});

els.mmPreset.addEventListener('change', () => {
  els.mmCustomRow.hidden = els.mmPreset.value !== 'custom';
  refresh();
});

// -- Color inputs (sync swatch <-> text field both ways)
function syncColor(colorInput, textInput) {
  colorInput.addEventListener('input', () => { textInput.value = colorInput.value; refresh(); });
  textInput.addEventListener('input', () => {
    if (/^#[0-9a-fA-F]{6}$/.test(textInput.value)) {
      colorInput.value = textInput.value;
      refresh();
    }
  });
}
syncColor(els.fg, els.fgText);
syncColor(els.bg, els.bgText);

// -- Generic re-render triggers
[els.pxSize, els.dpiSelect, els.quietZone, els.mmCustom, els.transparent].forEach(el =>
  el.addEventListener('input', refresh)
);
els.input.addEventListener('input', refresh);

// -- Downloads
els.dlPng.addEventListener('click', () => exportRaster('image/png', 'qr-code.png'));
els.dlJpg.addEventListener('click', () => exportRaster('image/jpeg', 'qr-code.jpg', 0.95));
els.dlWebp.addEventListener('click', () => exportRaster('image/webp', 'qr-code.webp', 0.95));
els.dlSvg.addEventListener('click', exportSvg);
els.dlPdf.addEventListener('click', exportPdf);

// -- Init
refresh();
