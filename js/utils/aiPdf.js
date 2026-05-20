// AI konsültasyon PDF dışa aktarma — html2pdf.bundle.min.js global olarak yüklü olmalı

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

function _safeName(s) {
  return (s || 'hasta').replace(/[^\w\-]+/g, '_').slice(0, 40);
}

function _tarihStr(iso) {
  const d = iso ? new Date(iso) : new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function _renderMd(text) {
  if (window.marked?.parse) {
    try { return window.marked.parse(text, { breaks: true }); } catch { /* fallback */ }
  }
  return `<pre style="white-space:pre-wrap;font-family:Arial,sans-serif">${_esc(text)}</pre>`;
}

/**
 * @param {Object} opts
 * @param {Object} opts.kayit  - { hastaId, model, sablonAdi, soru, yanit, inputTokens, outputTokens, webSearchCount, tahminiMaliyet, olusturmaTarih, apiModel }
 * @param {string} opts.hastaAd
 * @param {string} [opts.hastaMrn]
 */
export async function exportPdf({ kayit, hastaAd, hastaMrn }) {
  if (!window.html2pdf) throw new Error('html2pdf yüklü değil');

  const tarihIso  = kayit.olusturmaTarih || new Date().toISOString();
  const tarihDsp  = new Date(tarihIso).toLocaleString('tr-TR');
  const tarihFn   = _tarihStr(tarihIso);
  const modelKisa = MODEL_KISA[kayit.model] || kayit.model || '';
  const sablonAd  = SABLON_AD[kayit.sablonAdi] || 'Konsültasyon';
  const inT       = kayit.inputTokens  || 0;
  const outT      = kayit.outputTokens || 0;
  const ws        = kayit.webSearchCount || 0;
  const maliyet   = (kayit.tahminiMaliyet != null)
    ? (kayit.tahminiMaliyet < 0.01 ? '<$0.01' : `~$${kayit.tahminiMaliyet.toFixed(2)}`)
    : '';

  // Render konteyneri — DOM dışında oluşturup html2pdf'e ver
  const root = document.createElement('div');
  root.style.cssText = `
    font-family: Arial, "Helvetica Neue", sans-serif;
    color: #3d2817;
    padding: 0;
    width: 180mm;
    font-size: 11pt;
    line-height: 1.5;
  `;
  root.innerHTML = `
    <div style="border-bottom:2px solid #8b6f47;padding-bottom:10px;margin-bottom:14px">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px">
        <div>
          <div style="font-size:16pt;font-weight:700;color:#8b6f47;letter-spacing:0.5px">🏥 Klinik Pro</div>
          <div style="font-size:9pt;color:#6b4f3a;margin-top:2px">AI Konsültasyon Raporu</div>
        </div>
        <div style="text-align:right;font-size:9pt;color:#6b4f3a">
          <div>${_esc(tarihDsp)}</div>
          <div style="margin-top:2px"><strong>${_esc(modelKisa)}</strong> · ${_esc(sablonAd)}</div>
        </div>
      </div>
    </div>

    <div style="background:#f5ede0;border:1px solid #d4c5a8;border-radius:6px;padding:10px 12px;margin-bottom:14px;font-size:10pt">
      <div style="display:flex;flex-wrap:wrap;gap:14px">
        <div><strong>Hasta:</strong> ${_esc(hastaAd || '—')}</div>
        ${hastaMrn ? `<div><strong>MRN:</strong> ${_esc(hastaMrn)}</div>` : ''}
        <div><strong>Token:</strong> ${inT.toLocaleString()} in + ${outT.toLocaleString()} out</div>
        ${ws ? `<div><strong>Web search:</strong> ${ws}</div>` : ''}
        ${maliyet ? `<div><strong>Maliyet:</strong> ${_esc(maliyet)}</div>` : ''}
      </div>
    </div>

    <div style="margin-bottom:16px">
      <div style="font-size:9pt;font-weight:700;color:#8b6f47;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px">Soru</div>
      <div style="background:#fafafa;border-left:3px solid #8b6f47;padding:8px 12px;font-size:10pt;white-space:pre-wrap">${_esc(kayit.soru || '')}</div>
    </div>

    <div>
      <div style="font-size:9pt;font-weight:700;color:#8b6f47;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px">Yanıt</div>
      <div class="pdf-markdown" style="font-size:10.5pt">${_renderMd(kayit.yanit || '')}</div>
    </div>

    <div style="margin-top:18px;padding-top:10px;border-top:1px solid #d4c5a8;font-size:8pt;color:#6b4f3a;font-style:italic;line-height:1.4">
      Klinik karar desteği amaçlıdır; tıbbi tanı veya tedavi kararlarının yerini almaz.
      Her klinik öneri için güncel kılavuzları (UpToDate, ESC, AHA/ACC, ADA, KDIGO) ve yetkili kaynakları doğrulayın.
      Hasta verileri KVKK kapsamında işlenir.
    </div>
  `;

  // Markdown rendered alt elementlere stil ver
  const md = root.querySelector('.pdf-markdown');
  if (md) {
    md.querySelectorAll('h1,h2,h3').forEach(h => {
      h.style.color = '#3d2817';
      h.style.marginTop  = '12px';
      h.style.marginBottom = '6px';
      if (h.tagName === 'H1') h.style.fontSize = '13pt';
      if (h.tagName === 'H2') h.style.fontSize = '12pt';
      if (h.tagName === 'H3') h.style.fontSize = '11pt';
    });
    md.querySelectorAll('ul,ol').forEach(l => { l.style.paddingLeft = '20px'; l.style.margin = '6px 0'; });
    md.querySelectorAll('li').forEach(li => { li.style.margin = '2px 0'; });
    md.querySelectorAll('p').forEach(p => { p.style.margin = '6px 0'; });
    md.querySelectorAll('a').forEach(a => {
      a.style.color = '#8b6f47';
      a.style.wordBreak = 'break-all';
    });
    md.querySelectorAll('blockquote').forEach(b => {
      b.style.borderLeft = '3px solid #8b6f47';
      b.style.paddingLeft = '10px';
      b.style.margin = '6px 0';
      b.style.color  = '#6b4f3a';
      b.style.fontStyle = 'italic';
    });
    md.querySelectorAll('code').forEach(c => {
      c.style.background = '#ebe0cc';
      c.style.padding    = '1px 4px';
      c.style.borderRadius = '3px';
      c.style.fontSize   = '9pt';
    });
  }

  // Off-screen render (html2pdf body'e attach edip render eder)
  root.style.position = 'fixed';
  root.style.left = '-9999px';
  root.style.top  = '0';
  document.body.appendChild(root);

  const filename = `KlinikPro_${_safeName(hastaAd)}_${tarihFn}.pdf`;

  const opt = {
    margin:      [15, 15, 15, 15],
    filename,
    image:       { type: 'jpeg', quality: 0.98 },
    html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff' },
    jsPDF:       { unit: 'mm', format: 'a4', orientation: 'portrait' },
    pagebreak:   { mode: ['avoid-all', 'css', 'legacy'] }
  };

  try {
    await window.html2pdf().set(opt).from(root).save();
  } finally {
    root.remove();
  }
}
