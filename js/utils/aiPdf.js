// AI konsültasyon PDF dışa aktarma — native print dialog (window.open + win.print())
// html2pdf.js BIRAKILDI: off-screen render ve opacity:0+onclone iki yaklaşım da güvenilir çalışmadı.
// Bu yaklaşım: yeni pencerede HTML render et, Ctrl+P dialog'u aç, kullanıcı "PDF olarak kaydet" seçer.

import { showToast } from '../components/toast.js';

const MODEL_KISA = {
  sonnet: 'Sonnet 4.5',
  opus:   'Opus 4.7',
  haiku:  'Haiku 4.5'
};

const SABLON_AD = {
  ayiriciTani: 'Ayırıcı Tanı',
  tetkikOner:  'Tetkik Öner',
  tedavi:      'Tedavi Planı',
  labYorum:    'Lab Yorumla',
  panoneri:    'Panöneri',
  kilavuz:     'Kılavuz Sorgula',
  serbest:     'Serbest Soru'
};

function _esc(s) {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function _renderMd(text) {
  if (window.marked?.parse) {
    try { return window.marked.parse(text, { breaks: true }); } catch { /* fallthrough */ }
  }
  return `<pre style="white-space:pre-wrap;font-family:Arial,sans-serif">${_esc(text)}</pre>`;
}

/**
 * @param {Object} opts
 * @param {Object} opts.kayit  - { hastaId, model, sablonAdi, soru, yanit, inputTokens, outputTokens, webSearchCount, tahminiMaliyet, olusturmaTarih, apiModel }
 * @param {string} opts.hastaAd
 * @param {string} [opts.hastaMrn]
 */
export function exportPdf({ kayit, hastaAd, hastaMrn }) {
  const tarihIso  = kayit.olusturmaTarih || new Date().toISOString();
  const tarihDsp  = new Date(tarihIso).toLocaleString('tr-TR');
  const modelKisa = MODEL_KISA[kayit.model] || kayit.model || '-';
  const sablonAd  = SABLON_AD[kayit.sablonAdi] || 'Serbest Soru';
  const inT       = kayit.inputTokens  || 0;
  const outT      = kayit.outputTokens || 0;
  const ws        = kayit.webSearchCount || 0;
  const maliyet   = (kayit.tahminiMaliyet != null)
    ? (kayit.tahminiMaliyet < 0.01 ? '<$0.01' : `~$${kayit.tahminiMaliyet.toFixed(2)}`)
    : '';

  const yanitHtml = _renderMd(kayit.yanit || '');

  const html = `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8">
  <title>Klinik Pro — AI Konsültasyon</title>
  <style>
    body {
      font-family: 'Arial', 'Segoe UI', sans-serif;
      padding: 20mm;
      max-width: 210mm;
      margin: 0 auto;
      color: #2d1f0f;
      line-height: 1.6;
    }
    .header {
      border: 2px solid #8b6f47;
      padding: 15px;
      margin-bottom: 20px;
      background: #faf5ed;
      border-radius: 8px;
    }
    .header h1 {
      margin: 0 0 10px 0;
      color: #8b6f47;
      font-size: 20px;
      letter-spacing: 0.3px;
    }
    .header p {
      margin: 5px 0;
      font-size: 13px;
    }
    .header .doktor {
      font-size: 14px;
      font-weight: 600;
    }
    .header .site {
      color: #6b5640;
    }
    .header hr {
      border: 0;
      border-top: 1px solid #8b6f47;
      margin: 10px 0;
    }
    .soru-bolum {
      margin: 16px 0 20px;
    }
    .soru-bolum .label {
      font-size: 11px;
      font-weight: 700;
      color: #8b6f47;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 6px;
    }
    .soru-bolum .soru {
      background: #fafafa;
      border-left: 3px solid #8b6f47;
      padding: 10px 14px;
      font-size: 13px;
      white-space: pre-wrap;
      border-radius: 0 4px 4px 0;
    }
    .yanit {
      font-size: 13px;
      line-height: 1.7;
    }
    .yanit h1, .yanit h2, .yanit h3 {
      color: #8b6f47;
      margin-top: 20px;
      margin-bottom: 8px;
    }
    .yanit h1 { font-size: 17px; }
    .yanit h2 { font-size: 15px; }
    .yanit h3 { font-size: 14px; }
    .yanit ul, .yanit ol {
      margin: 10px 0;
      padding-left: 25px;
    }
    .yanit li {
      margin: 5px 0;
    }
    .yanit p {
      margin: 8px 0;
    }
    .yanit strong {
      color: #2d1f0f;
      font-weight: 700;
    }
    .yanit blockquote {
      border-left: 3px solid #8b6f47;
      padding-left: 12px;
      margin: 10px 0;
      color: #6b5640;
      font-style: italic;
    }
    .yanit code {
      background: #ebe0cc;
      padding: 1px 5px;
      border-radius: 3px;
      font-family: Consolas, 'Courier New', monospace;
      font-size: 12px;
    }
    .yanit a {
      color: #8b6f47;
      word-break: break-all;
    }
    .footer {
      border-top: 1px solid #ccc;
      margin-top: 30px;
      padding-top: 10px;
      font-size: 11px;
      color: #888;
      line-height: 1.4;
    }
    .footer p { margin: 4px 0; }
    @media print {
      body { padding: 10mm; }
      .yanit h1, .yanit h2, .yanit h3 { page-break-after: avoid; }
      .yanit li, .yanit p { page-break-inside: avoid; }
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>🏥 KLİNİK PRO — AI KONSÜLTASYON RAPORU</h1>
    <p class="doktor">Dr. Ahmet Boyoğlu — İç Hastalıkları Uzmanı</p>
    <p class="site">ahmetboyoglu.com</p>
    <hr>
    <p><strong>Hasta:</strong> ${_esc(hastaAd || '—')}${hastaMrn ? ` (MRN: ${_esc(hastaMrn)})` : ''}</p>
    <p><strong>Tarih:</strong> ${_esc(tarihDsp)}</p>
    <p><strong>Şablon:</strong> ${_esc(sablonAd)}</p>
    <p><strong>Model:</strong> ${_esc(modelKisa)} · ${inT.toLocaleString()} in + ${outT.toLocaleString()} out${ws ? ` · ${ws} web search` : ''}${maliyet ? ` · ${_esc(maliyet)}` : ''}</p>
  </div>

  <div class="soru-bolum">
    <div class="label">Soru</div>
    <div class="soru">${_esc(kayit.soru || '')}</div>
  </div>

  <div class="yanit">
    <div class="label" style="font-size:11px;font-weight:700;color:#8b6f47;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px">Yanıt</div>
    ${yanitHtml}
  </div>

  <div class="footer">
    <p>⚠️ Bu çıktı klinik karar destek aracı olan AI yardımıyla üretilmiştir. Klinik karar sorumluluğu hekime aittir.</p>
    <p>Her öneri için güncel kılavuzları (UpToDate, ESC, AHA/ACC, ADA, KDIGO) doğrulayın. Hasta verileri KVKK kapsamında işlenir.</p>
    <p>Üretim: Klinik Pro v0.3.4.3 — ${_esc(tarihDsp)}</p>
  </div>
</body>
</html>`;

  const win = window.open('', '_blank');
  if (!win) {
    throw new Error('Yeni pencere açılamadı. Tarayıcı popup engelleyicisini bu site için devre dışı bırakın.');
  }
  win.document.open();
  win.document.write(html);
  win.document.close();

  // Render tamamlansın diye 500 ms bekle, sonra print dialog'u tetikle
  setTimeout(() => {
    try { win.focus(); win.print(); } catch { /* sessizce geç */ }
  }, 500);

  showToast('Yazdırma penceresi açıldı — "PDF olarak kaydet" seçin', 'info');
}
