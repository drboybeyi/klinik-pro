// AI konsültasyon PDF dışa aktarma — html2pdf.js
// Container CSS: opacity:0 + z-index:-1 + pointer-events:none (DOM'da görünür konumda ama gözle görünmez)
// html2canvas elementi "görünmez" sanırsa boş render eder; bu yüzden top:-9999px DEĞİL.
// onclone callback klonda elementi gerçekten görünür yapar (ekrana yansımaz).

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
export async function exportPdf({ kayit, hastaAd, hastaMrn }) {
  if (!window.html2pdf) throw new Error('html2pdf yüklü değil');

  const tarihIso  = kayit.olusturmaTarih || new Date().toISOString();
  const tarihDsp  = new Date(tarihIso).toLocaleString('tr-TR');
  const tarihFn   = _tarihStr(tarihIso);
  const modelKisa = MODEL_KISA[kayit.model] || kayit.model || '-';
  const sablonAd  = SABLON_AD[kayit.sablonAdi] || 'Serbest Soru';
  const inT       = kayit.inputTokens  || 0;
  const outT      = kayit.outputTokens || 0;
  const ws        = kayit.webSearchCount || 0;
  const maliyet   = (kayit.tahminiMaliyet != null)
    ? (kayit.tahminiMaliyet < 0.01 ? '<$0.01' : `~$${kayit.tahminiMaliyet.toFixed(2)}`)
    : '';

  // 1) Container — DOM'da görünür KONUMDA ama opacity:0 ile gözle görünmez
  const container = document.createElement('div');
  container.setAttribute('data-pdf-container', 'true');
  container.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 210mm;
    padding: 20mm;
    background: #ffffff;
    color: #2d1f0f;
    font-family: Arial, 'Segoe UI', sans-serif;
    line-height: 1.6;
    box-sizing: border-box;
    z-index: -1;
    opacity: 0;
    pointer-events: none;
  `;

  // 2) İçerik
  container.innerHTML = `
    <div style="border:2px solid #8b6f47;padding:15px;margin-bottom:20px;background:#faf5ed;border-radius:8px">
      <h1 style="margin:0 0 10px;color:#8b6f47;font-size:20px;letter-spacing:0.3px">🏥 KLİNİK PRO — AI KONSÜLTASYON RAPORU</h1>
      <p style="margin:5px 0;font-size:14px;font-weight:600">Dr. Ahmet Boyoğlu — İç Hastalıkları Uzmanı</p>
      <p style="margin:5px 0;font-size:13px;color:#6b5640">ahmetboyoglu.com</p>
      <hr style="border:0;border-top:1px solid #8b6f47;margin:10px 0">
      <p style="margin:5px 0;font-size:13px"><strong>Hasta:</strong> ${_esc(hastaAd || '—')}${hastaMrn ? ` (MRN: ${_esc(hastaMrn)})` : ''}</p>
      <p style="margin:5px 0;font-size:13px"><strong>Tarih:</strong> ${_esc(tarihDsp)}</p>
      <p style="margin:5px 0;font-size:13px"><strong>Şablon:</strong> ${_esc(sablonAd)}</p>
      <p style="margin:5px 0;font-size:13px"><strong>Model:</strong> ${_esc(modelKisa)} · ${inT.toLocaleString()} in + ${outT.toLocaleString()} out${ws ? ` · ${ws} web search` : ''}${maliyet ? ` · ${_esc(maliyet)}` : ''}</p>
    </div>

    <div style="margin-bottom:18px">
      <div style="font-size:11px;font-weight:700;color:#8b6f47;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px">Soru</div>
      <div style="background:#fafafa;border-left:3px solid #8b6f47;padding:10px 14px;font-size:13px;white-space:pre-wrap;border-radius:0 4px 4px 0">${_esc(kayit.soru || '')}</div>
    </div>

    <div>
      <div style="font-size:11px;font-weight:700;color:#8b6f47;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px">Yanıt</div>
      <div class="pdf-markdown" style="font-size:13px;line-height:1.7">${_renderMd(kayit.yanit || '')}</div>
    </div>

    <div style="border-top:1px solid #ccc;margin-top:30px;padding-top:10px;font-size:11px;color:#888;line-height:1.4">
      <p style="margin:4px 0">⚠️ Bu çıktı klinik karar destek aracı olan AI yardımıyla üretilmiştir. Klinik karar sorumluluğu hekime aittir.</p>
      <p style="margin:4px 0">Her öneri için güncel kılavuzları (UpToDate, ESC, AHA/ACC, ADA, KDIGO) doğrulayın. Hasta verileri KVKK kapsamında işlenir.</p>
      <p style="margin:4px 0">Üretim: Klinik Pro v0.3.4.1 — ${_esc(tarihDsp)}</p>
    </div>
  `;

  // 3) Markdown alt elementlerine inline stil
  const md = container.querySelector('.pdf-markdown');
  if (md) {
    md.querySelectorAll('h1,h2,h3').forEach(h => {
      h.style.color = '#8b6f47';
      h.style.marginTop = '20px';
      h.style.marginBottom = '8px';
      h.style.fontWeight = '700';
      if (h.tagName === 'H1') h.style.fontSize = '17px';
      if (h.tagName === 'H2') h.style.fontSize = '15px';
      if (h.tagName === 'H3') h.style.fontSize = '14px';
    });
    md.querySelectorAll('ul,ol').forEach(l => { l.style.paddingLeft = '25px'; l.style.margin = '10px 0'; });
    md.querySelectorAll('li').forEach(li => { li.style.margin = '5px 0'; });
    md.querySelectorAll('p').forEach(p => { p.style.margin = '8px 0'; });
    md.querySelectorAll('strong').forEach(s => { s.style.fontWeight = '700'; s.style.color = '#2d1f0f'; });
    md.querySelectorAll('a').forEach(a => {
      a.style.color = '#8b6f47';
      a.style.wordBreak = 'break-all';
    });
    md.querySelectorAll('blockquote').forEach(b => {
      b.style.borderLeft = '3px solid #8b6f47';
      b.style.paddingLeft = '12px';
      b.style.margin = '10px 0';
      b.style.color = '#6b5640';
      b.style.fontStyle = 'italic';
    });
    md.querySelectorAll('code').forEach(c => {
      c.style.background = '#ebe0cc';
      c.style.padding = '1px 5px';
      c.style.borderRadius = '3px';
      c.style.fontFamily = "Consolas, 'Courier New', monospace";
      c.style.fontSize = '12px';
    });
  }

  // 4) DOM'a ekle ve render için 250 ms bekle
  document.body.appendChild(container);
  await new Promise(r => setTimeout(r, 250));

  // 5) PDF oluştur — onclone callback klonda elementi GERÇEKTEN görünür yapar
  const filename = `KlinikPro_${_safeName(hastaAd)}_${tarihFn}.pdf`;
  const opt = {
    margin:      [10, 10, 10, 10],
    filename,
    image:       { type: 'jpeg', quality: 0.98 },
    html2canvas: {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff',
      onclone: function (clonedDoc) {
        const clonedContainer = clonedDoc.querySelector('[data-pdf-container]');
        if (clonedContainer) {
          clonedContainer.style.opacity = '1';
          clonedContainer.style.zIndex  = '999999';
        }
      }
    },
    jsPDF:       { unit: 'mm', format: 'a4', orientation: 'portrait' },
    pagebreak:   { mode: ['avoid-all', 'css', 'legacy'] }
  };

  try {
    await window.html2pdf().set(opt).from(container).save();
  } finally {
    container.remove();
  }
}
