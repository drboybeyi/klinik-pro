import { getState } from '../state.js';
import { saveAiSorgu, deleteAiSorgu } from '../db.js';
import { showToast } from './toast.js';
import { confirm } from './modal.js';
import { formatTarih } from '../utils.js';
import { copyMarkdown, copyPlainText } from '../utils/aiKopyala.js';
import { exportPdf } from '../utils/aiPdf.js';

const WEB_SEARCH_USD = 0.01; // arama başına

const WORKER_URL = 'https://muddy-cherry-1712.drahmetboyoglu.workers.dev';

const MODELS = {
  sonnet: {
    id:    'claude-sonnet-4-5-20250929',
    label: 'Sonnet 4.5 — dengeli ($0.03/sorgu)',
    kisa:  'Sonnet 4.5',
    inUsd: 3  / 1_000_000,
    outUsd: 15 / 1_000_000
  },
  opus: {
    id:    'claude-opus-4-7',
    label: 'Opus 4.7 — en iyi ($0.14/sorgu)',
    kisa:  'Opus 4.7',
    inUsd: 5  / 1_000_000,
    outUsd: 25 / 1_000_000
  },
  haiku: {
    id:    'claude-haiku-4-5',
    label: 'Haiku 4.5 — hızlı ($0.01/sorgu)',
    kisa:  'Haiku 4.5',
    inUsd: 1 / 1_000_000,
    outUsd: 5 / 1_000_000
  }
};

const SABLON_META = {
  ayiriciTani: { ad: 'Ayırıcı Tanı',          icon: '🩺' },
  tetkikOner:  { ad: 'Tetkik Öner',           icon: '🔬' },
  tedavi:      { ad: 'Tedavi Planı',          icon: '💊' },
  labYorum:    { ad: 'Lab Yorumla',           icon: '📊' },
  panoneri:    { ad: 'Panöneri (yatak başı)', icon: '📋' },
  kilavuz:     { ad: 'Kılavuz Sorgula',       icon: '📚' },
  serbest:     { ad: 'Serbest Soru',          icon: '✍️' }
};

const TETKIK_TUR_LBL = {
  kan: 'Kan', idrar: 'İdrar', usg: 'USG', mr: 'MR', bt: 'BT',
  rontgen: 'Röntgen', ekg: 'EKG', echo: 'Eko', endoskopi: 'Endoskopi',
  kolonoskopi: 'Kolonoskopi', patoloji: 'Patoloji', diger: 'Diğer'
};

const SYSTEM_PROMPT_BASE = `Sen 25 yıllık deneyimli bir dahiliye uzmanısın. UpToDate, PubMed, ESC, ADA, KDIGO, GOLD, TİTCK kaynaklarına hakimsin. Klinisyen meslektaşına yardımcı oluyorsun.

KURALLAR:
- Türkçe yanıt ver
- Kanıt seviyesi yüksek bilgiler kullan
- Doz/etkileşim sorularında daima ikinci kaynak doğrulamasını öner
- Belirsiz alanlarda dürüstçe söyle ("kanıt yetersiz", "uzmandan konsültasyon önerilir")
- Mümkün olduğunda kılavuz referansı ver (ESC 2024, KDIGO 2024 vb.)
- Klinik karar verirken doktor sorumluluğunda olduğunu hatırlat (sadece bilgi destek)
- Yanıt yapısı: 1) Klinik değerlendirme, 2) Öneriler (numaralandırılmış), 3) Kaynaklar/Kılavuzlar`;

const WEB_SEARCH_SYSTEM_EK = `

Eğer web search tool'u açıksa: ESC, AHA, KDIGO, ADA, GOLD, PubMed gibi kanıta dayalı kaynakları aktif olarak ara. Yanıtının sonuna 'Aranan Kaynaklar:' başlığı altında bulduğun linkleri (kısa açıklama ile) ekle.`;

const TEMPLATES = {
  ayiriciTani: `Hasta: {hastaOzet}
Şikayetler: {sikayetler}
Hikaye: {hikaye}
Fizik muayene: {fmBulgular}
Tetkikler: {tetkikOzeti}
Aktif tanılar: {tanilar}

Lütfen 20 yıllık dahiliye uzmanı bakış açısıyla ayırıcı tanı listesi oluştur. En olası 5 tanıyı, her biri için klinik gerekçe, ayırıcı testler ve kanıt seviyesi (UpToDate/ESC/ADA/KDIGO) ile sun.`,

  tetkikOner: `Hasta: {hastaOzet}
Mevcut bulgular: {sikayetler}, {fmBulgular}
Mevcut tetkikler: {tetkikOzeti}
Aktif tanılar: {tanilar}

Hangi ek tetkikleri istemeliyim? Öncelik sırasına göre liste ver, her tetkikin gerekçesi ve kılavuz referansı (USPSTF, NICE, ESC vs.) ile.`,

  tedavi: `Hasta: {hastaOzet}
Aktif tanılar: {tanilar}
Mevcut ilaçlar: {ilaclar}
Alerjiler: {alerjiler}
Son tetkikler: {tetkikOzeti}

Güncel kılavuzlara (ESC 2024, KDIGO 2024, ADA 2025, GOLD 2025) göre optimal tedavi planı öner. İlaç dozları, etkileşimler, izlem parametreleri ve yan etki uyarılarını dahil et.`,

  labYorum: `Hasta: {hastaOzet}
Son tetkikler: {tetkikOzeti}

Bu lab değerlerini klinik bağlamda yorumla. Kritik değerleri vurgula, trend analizi yap, ek tetkik gerekiyorsa belirt. Referans aralık dışındaki her değer için olası klinik anlamı ve etyolojik öneri ver.`,

  panoneri: `Hasta: {hastaOzet}
Anamnez: {sikayetler}, {hikaye}
FM: {fmBulgular}
Lab: {tetkikOzeti}
Tanılar: {tanilar}

Yatak başı kısa karar destek: Bu hastada şu an ne yapmalıyım? Acil müdahale gerekiyor mu, gözlemde mi tutmalıyım, taburculuk uygun mu? 5 maddelik aksiyon listesi ver.`,

  kilavuz: `Hasta bağlamı: {hastaOzet}, {tanilar}

[Doktor sorusunu buraya yazacak — örn. "HFrEF hastasında sacubitril-valsartan ne zaman başlanır?"]

İlgili güncel kılavuzdan (ESC/AHA/ADA/KDIGO/GOLD) yanıt ver. Kanıt seviyesi ve sınıf belirt. Türk popülasyonu için TİTCK onayını da kontrol et.`
};

// Modül-içi geçici durum (aktif yanıt). Kaydedilince temizlenir.
let _aktifYanit       = null;
let _sonSablon        = 'serbest';
let _yukleniyor       = false;
let _webSearchEnabled = false;

// --- Veri toplama ---

function _items(col, hastaId) {
  return Object.values(getState(col) || {}).filter(i => i.hastaId === hastaId);
}

function _tetkikOzeti(hastaId) {
  const list = _items('tetkikler', hastaId).sort((a, b) =>
    (b.tarih || '').localeCompare(a.tarih || ''));
  if (!list.length) return 'Tetkik kaydı yok';
  return list.map(t => {
    const tur = TETKIK_TUR_LBL[t.tur] || 'Diğer';
    const krt = t.kritik ? ' [KRİTİK]' : '';
    const tarih = t.tarih ? formatTarih(t.tarih) : '';
    return `- ${tarih} • ${tur} • ${t.baslik || ''}${krt}: ${t.ozet || ''}`.trim();
  }).join('\n');
}

function _taniListesi(hastaId) {
  const list = _items('tanilar', hastaId);
  if (!list.length) return 'Tanı kaydı yok';
  return list.map(t => `- ${t.tanim}${t.icd ? ` (${t.icd})` : ''} [${t.seviye || 'izlem'}]`).join('\n');
}

function _ilacListesi(hastaId) {
  const list = _items('ilaclar', hastaId);
  if (!list.length) return 'İlaç kaydı yok';
  return list.map(i => {
    const doz    = i.doz    ? ` ${i.doz}`    : '';
    const sik    = i.siklik ? ` ${i.siklik}` : '';
    const end    = i.endikasyon ? ` — ${i.endikasyon}` : '';
    const durum  = i.durum ? ` [${i.durum}]` : '';
    return `- ${i.ad}${doz}${sik}${end}${durum}`;
  }).join('\n');
}

function _alerjiListesi(hastaId) {
  const list = _items('alerjiler', hastaId);
  if (!list.length) return 'Bilinen alerji yok';
  return list.map(a => `- ${a.ajan}${a.reaksiyon ? ` (${a.reaksiyon})` : ''}`).join('\n');
}

function gatherHastaData(hastaId) {
  const hasta = (getState('hastalar') || {})[hastaId] || {};
  const cins  = hasta.cinsiyet === 'E' ? 'E' : (hasta.cinsiyet === 'K' ? 'K' : '?');
  const mrn   = hasta.mrn ? `MRN: ${hasta.mrn}` : '';
  const ozet  = hasta.klinikOzet || '';
  return {
    hastaOzet:   [hasta.ad, `${hasta.yas || '?'}${cins}`, mrn, ozet].filter(Boolean).join(', '),
    sikayetler:  hasta.sikayetler || 'Belirtilmemiş',
    hikaye:      hasta.hikaye     || 'Belirtilmemiş',
    ozgecmis:    hasta.ozgecmis   || 'Belirtilmemiş',
    soygecmis:   hasta.soygecmis  || 'Belirtilmemiş',
    fmBulgular:  hasta.fmBulgular || 'Belirtilmemiş',
    tetkikOzeti: _tetkikOzeti(hastaId),
    tanilar:     _taniListesi(hastaId),
    ilaclar:     _ilacListesi(hastaId),
    alerjiler:   _alerjiListesi(hastaId)
  };
}

function _fillTemplate(key, hastaId) {
  const tpl = TEMPLATES[key];
  if (!tpl) return '';
  const data = gatherHastaData(hastaId);
  return tpl.replace(/\{(\w+)\}/g, (_, k) => data[k] ?? `{${k}}`);
}

// --- API ---

async function askAI({ modelKey, soru, webSearch }) {
  const model = MODELS[modelKey];
  const body = {
    model:      model.id,
    max_tokens: webSearch ? 4096 : 2048,
    system:     webSearch ? (SYSTEM_PROMPT_BASE + WEB_SEARCH_SYSTEM_EK) : SYSTEM_PROMPT_BASE,
    messages:   [{ role: 'user', content: soru }]
  };
  if (webSearch) {
    body.tools = [{
      type:     'web_search_20250305',
      name:     'web_search',
      max_uses: 5
    }];
  }

  const r = await fetch(WORKER_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!r.ok) {
    const t = await r.text().catch(() => '');
    throw new Error(`API ${r.status}: ${t.slice(0, 200)}`);
  }
  const data = await r.json();

  // Yanıttaki tüm text bloklarını birleştir (web search ile birden fazla text bloğu olabilir)
  const content = Array.isArray(data?.content) ? data.content : [];
  const text = content
    .filter(b => b?.type === 'text' && typeof b.text === 'string')
    .map(b => b.text)
    .join('\n\n')
    .trim();

  if (!text) throw new Error('API yanıtı boş ya da beklenmedik formatta');

  // Web search sayısı: usage.server_tool_use.web_search_requests veya content içindeki server_tool_use blokları
  let webSearchCount = 0;
  if (data?.usage?.server_tool_use?.web_search_requests != null) {
    webSearchCount = data.usage.server_tool_use.web_search_requests;
  } else {
    webSearchCount = content.filter(b =>
      (b?.type === 'server_tool_use' || b?.type === 'web_search_tool_use') &&
      (!b.name || b.name === 'web_search')
    ).length;
  }

  return {
    text,
    inputTokens:    data.usage?.input_tokens  || 0,
    outputTokens:   data.usage?.output_tokens || 0,
    webSearchCount,
    apiModel:       data.model || model.id
  };
}

function _maliyet(modelKey, inT, outT, webSearchCount = 0) {
  const m = MODELS[modelKey];
  if (!m) return 0;
  return inT * m.inUsd + outT * m.outUsd + (webSearchCount || 0) * WEB_SEARCH_USD;
}

// --- Markdown render ---

function _renderMd(text) {
  if (window.marked?.parse) {
    try { return window.marked.parse(text, { breaks: true }); }
    catch { /* fallthrough */ }
  }
  // Basit fallback: satır sonları + html escape
  const esc = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<pre style="white-space:pre-wrap;font-family:inherit;margin:0">${esc}</pre>`;
}

// --- Render ---

export function renderAiPanel(hastaId) {
  const modelOptions = Object.entries(MODELS)
    .map(([k, m]) => `<option value="${k}"${k === 'sonnet' ? ' selected' : ''}>${m.label}</option>`)
    .join('');

  const sablonBtns = Object.entries(SABLON_META)
    .filter(([k]) => k !== 'serbest')
    .map(([k, meta]) => `
      <button class="ai-sablon-btn" data-ai-sablon="${k}" type="button">
        <span class="ai-sablon-icon">${meta.icon}</span>
        <span class="ai-sablon-ad">${meta.ad}</span>
      </button>
    `).join('');

  return `
    <div class="view-container ai-panel">
      <div class="card ai-form-card">
        <div class="ai-form-row">
          <label class="form-label" style="margin-bottom:0;flex:0 0 auto">Model</label>
          <select id="aiModelSelect" class="form-control ai-model-select">${modelOptions}</select>
        </div>

        <label class="ai-checkbox-row" for="aiWebSearch">
          <input type="checkbox" id="aiWebSearch" ${_webSearchEnabled ? 'checked' : ''}>
          <span class="ai-checkbox-label">
            🌐 Web search aç
            <span class="ai-checkbox-sub">(canlı PubMed/ESC/ADA arar, +$0.01–0.03)</span>
          </span>
        </label>

        <div class="ai-sablon-grid">${sablonBtns}</div>

        <div class="form-group" style="margin-bottom:12px">
          <textarea id="aiSoru" class="form-control"
                    rows="10"
                    placeholder="Sorunuzu yazın veya yukarıdaki şablonlardan birini tıklayın…"
                    style="resize:vertical;min-height:180px;font-family:inherit;line-height:1.5"></textarea>
        </div>

        <button class="btn btn-primary ai-sor-btn" id="aiSorBtn" type="button">
          <span id="aiSorBtnLabel">Konsültasyon İste</span>
        </button>
      </div>

      <div id="aiYanitSlot">${_renderAktifYanit()}</div>

      <div class="card ai-gecmis-card">
        <div class="section-header">
          <span class="section-title">📜 Önceki Konsültasyonlar</span>
        </div>
        <div id="aiGecmisList">${_renderGecmis(hastaId)}</div>
      </div>
    </div>
  `;
}

function _renderAktifYanit() {
  if (_yukleniyor) {
    return `
      <div class="card ai-yanit-card ai-yanit-loading">
        <div class="ai-spinner"></div>
        <div class="ai-yanit-loading-text">Düşünüyor…</div>
      </div>
    `;
  }
  if (!_aktifYanit) return '';
  const m = MODELS[_aktifYanit.modelKey];
  const ws = _aktifYanit.webSearchCount || 0;
  const maliyet = _maliyet(_aktifYanit.modelKey, _aktifYanit.inputTokens, _aktifYanit.outputTokens, ws);
  const maliyetTxt = maliyet < 0.01 ? '<$0.01' : `~$${maliyet.toFixed(2)}`;
  return `
    <div class="card ai-yanit-card">
      <div class="ai-yanit-meta">
        <div class="ai-yanit-meta-info">
          <strong>${m.kisa}</strong>
          <span class="ai-yanit-meta-sep">•</span>
          <span>${_aktifYanit.inputTokens.toLocaleString()} in + ${_aktifYanit.outputTokens.toLocaleString()} out</span>
          ${ws ? `<span class="ai-yanit-meta-sep">•</span><span>${ws} web search</span>` : ''}
          <span class="ai-yanit-meta-sep">•</span>
          <span>${maliyetTxt}</span>
        </div>
        <div class="ai-yanit-actions">
          <button class="btn-mini" id="aiKopyalaMd"    title="Markdown kopyala">📋 MD</button>
          <button class="btn-mini" id="aiKopyalaTxt"  title="Düz metin kopyala">📝 Metin</button>
          <button class="btn-mini" id="aiPdf"         title="PDF indir">📄 PDF</button>
          <button class="btn-mini btn-mini-primary" id="aiKaydet" title="Kaydet">💾 Kaydet</button>
        </div>
      </div>
      <div class="ai-yanit-body markdown-body">${_renderMd(_aktifYanit.yanit)}</div>
    </div>
  `;
}

function _renderGecmis(hastaId) {
  const list = Object.values(getState('aiSorgulari') || {})
    .filter(s => s.hastaId === hastaId)
    .sort((a, b) => (b.olusturmaTarih || '').localeCompare(a.olusturmaTarih || ''));

  if (!list.length) return `
    <div style="padding:24px 0;color:var(--text-secondary);font-size:13px;text-align:center">
      Henüz kayıtlı konsültasyon yok
    </div>
  `;

  return list.map(s => {
    const meta = SABLON_META[s.sablonAdi] || SABLON_META.serbest;
    const tarihStr = s.olusturmaTarih ? new Date(s.olusturmaTarih).toLocaleString('tr-TR', {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
    }) : '';
    const onIzleme = (s.soru || '').slice(0, 80).replace(/\s+/g, ' ').trim();
    return `
      <div class="ai-gecmis-kart" data-ai-id="${s.id}">
        <div class="ai-gecmis-header">
          <span class="ai-gecmis-tarih">${tarihStr}</span>
          <div class="ai-gecmis-kart-actions">
            <span class="badge badge-medical">${meta.icon} ${meta.ad}</span>
            <button class="icon-btn danger" data-ai-del="${s.id}" title="Sil">🗑</button>
          </div>
        </div>
        <div class="ai-gecmis-onizleme">${_esc(onIzleme)}${(s.soru || '').length > 80 ? '…' : ''}</div>
      </div>
    `;
  }).join('');
}

function _esc(s) {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// --- Listeners ---

export function attachAiListeners(hastaId) {
  // Şablon butonları
  document.querySelectorAll('[data-ai-sablon]').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.aiSablon;
      const txt = _fillTemplate(key, hastaId);
      const ta  = document.getElementById('aiSoru');
      if (ta) ta.value = txt;
      _sonSablon = key;
    });
  });

  // Web search checkbox
  const wsBox = document.getElementById('aiWebSearch');
  if (wsBox) {
    wsBox.checked = _webSearchEnabled;
    wsBox.addEventListener('change', e => { _webSearchEnabled = e.target.checked; });
  }

  // Konsültasyon İste
  document.getElementById('aiSorBtn')?.addEventListener('click', () => _gonder(hastaId));

  // Aktif yanıt aksiyon butonları
  _attachAktifYanitListeners(hastaId);

  // Geçmiş kartları + sil
  _attachGecmisListeners(hastaId);

  // Textarea değişirse şablon → serbest sayılsın (textarea boşa düşerse de)
  document.getElementById('aiSoru')?.addEventListener('input', e => {
    if (!e.target.value.trim()) _sonSablon = 'serbest';
  });
}

function _attachAktifYanitListeners(hastaId) {
  document.getElementById('aiKopyalaMd') ?.addEventListener('click', () => _kopyalaMd());
  document.getElementById('aiKopyalaTxt')?.addEventListener('click', () => _kopyalaTxt());
  document.getElementById('aiPdf')       ?.addEventListener('click', () => _pdfAktif(hastaId));
  document.getElementById('aiKaydet')    ?.addEventListener('click', () => _kaydet(hastaId));
}

function _attachGecmisListeners(hastaId) {
  document.querySelectorAll('.ai-gecmis-kart').forEach(k => {
    k.addEventListener('click', e => {
      if (e.target.closest('[data-ai-del]')) return; // sil tıklaması — açma
      const id   = k.dataset.aiId;
      const kayit = (getState('aiSorgulari') || {})[id];
      if (kayit) _openGecmisModal(kayit, hastaId);
    });
  });
  document.querySelectorAll('[data-ai-del]').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      const id = btn.dataset.aiDel;
      const ok = await confirm('Bu konsültasyonu silmek istediğinizden emin misiniz?');
      if (!ok) return;
      try {
        await deleteAiSorgu(id);
        showToast('Konsültasyon silindi', 'info');
      } catch (err) {
        showToast(`Silinemedi: ${err.message}`, 'error');
      }
    });
  });
}

async function _gonder(hastaId) {
  const ta       = document.getElementById('aiSoru');
  const sel      = document.getElementById('aiModelSelect');
  const btn      = document.getElementById('aiSorBtn');
  const btnLbl   = document.getElementById('aiSorBtnLabel');
  const soru     = (ta?.value || '').trim();
  const modelKey = sel?.value || 'sonnet';

  if (!soru) {
    showToast('Soru boş olamaz', 'error');
    return;
  }

  _yukleniyor = true;
  _aktifYanit = null;
  if (btn)    btn.disabled = true;
  if (btnLbl) btnLbl.textContent = 'Düşünüyor…';
  _refreshYanitSlot(hastaId);

  try {
    const sonuc = await askAI({ modelKey, soru, webSearch: _webSearchEnabled });
    _aktifYanit = {
      hastaId,
      modelKey,
      sablonAdi:      _sonSablon || 'serbest',
      soru,
      yanit:          sonuc.text,
      inputTokens:    sonuc.inputTokens,
      outputTokens:   sonuc.outputTokens,
      webSearchCount: sonuc.webSearchCount,
      apiModel:       sonuc.apiModel
    };
  } catch (e) {
    showToast(`Hata: ${e.message}`, 'error');
    _aktifYanit = null;
  } finally {
    _yukleniyor = false;
    if (btn)    btn.disabled = false;
    if (btnLbl) btnLbl.textContent = 'Konsültasyon İste';
    _refreshYanitSlot(hastaId);
  }
}

function _refreshYanitSlot(hastaId) {
  const slot = document.getElementById('aiYanitSlot');
  if (!slot) return;
  slot.innerHTML = _renderAktifYanit();
  _attachAktifYanitListeners(hastaId);
}

async function _kopyalaMd() {
  if (!_aktifYanit) return;
  try {
    await copyMarkdown(_aktifYanit.yanit);
    showToast('Markdown kopyalandı', 'success');
  } catch {
    showToast('Kopyalanamadı', 'error');
  }
}

async function _kopyalaTxt() {
  if (!_aktifYanit) return;
  try {
    await copyPlainText(_aktifYanit.yanit);
    showToast('Düz metin kopyalandı', 'success');
  } catch {
    showToast('Kopyalanamadı', 'error');
  }
}

function _hastaInfo(hastaId) {
  const h = (getState('hastalar') || {})[hastaId] || {};
  return { ad: h.ad || 'Hasta', mrn: h.mrn || '' };
}

async function _pdfAktif(hastaId) {
  if (!_aktifYanit) return;
  const { ad, mrn } = _hastaInfo(hastaId);
  const ws = _aktifYanit.webSearchCount || 0;
  const maliyet = _maliyet(_aktifYanit.modelKey, _aktifYanit.inputTokens, _aktifYanit.outputTokens, ws);
  try {
    await exportPdf({
      kayit: {
        hastaId,
        model:          _aktifYanit.modelKey,
        sablonAdi:      _aktifYanit.sablonAdi,
        soru:           _aktifYanit.soru,
        yanit:          _aktifYanit.yanit,
        inputTokens:    _aktifYanit.inputTokens,
        outputTokens:   _aktifYanit.outputTokens,
        webSearchCount: ws,
        tahminiMaliyet: Number(maliyet.toFixed(6)),
        olusturmaTarih: new Date().toISOString(),
        apiModel:       _aktifYanit.apiModel
      },
      hastaAd:  ad,
      hastaMrn: mrn
    });
  } catch (e) {
    showToast(`PDF oluşturulamadı: ${e.message}`, 'error');
  }
}

async function _kaydet(hastaId) {
  if (!_aktifYanit) return;
  const btn = document.getElementById('aiKaydet');
  if (btn) btn.disabled = true;
  try {
    const ws = _aktifYanit.webSearchCount || 0;
    const maliyet = _maliyet(_aktifYanit.modelKey, _aktifYanit.inputTokens, _aktifYanit.outputTokens, ws);
    await saveAiSorgu({
      hastaId,
      model:           _aktifYanit.modelKey,
      apiModel:        _aktifYanit.apiModel,
      sablonAdi:       _aktifYanit.sablonAdi,
      soru:            _aktifYanit.soru,
      yanit:           _aktifYanit.yanit,
      inputTokens:     _aktifYanit.inputTokens,
      outputTokens:    _aktifYanit.outputTokens,
      webSearchCount:  ws,
      tahminiMaliyet:  Number(maliyet.toFixed(6))
    });
    showToast('Konsültasyon kaydedildi', 'success');
    _aktifYanit = null;
    _refreshYanitSlot(hastaId);
  } catch (e) {
    showToast(`Kaydedilemedi: ${e.message}`, 'error');
    if (btn) btn.disabled = false;
  }
}

// --- Geçmiş modalı ---

function _openGecmisModal(kayit, hastaId) {
  const meta = SABLON_META[kayit.sablonAdi] || SABLON_META.serbest;
  const m    = MODELS[kayit.model] || { kisa: kayit.model };
  const tarihStr = kayit.olusturmaTarih ? new Date(kayit.olusturmaTarih).toLocaleString('tr-TR') : '';
  const inT  = kayit.inputTokens  || 0;
  const outT = kayit.outputTokens || 0;
  const ws   = kayit.webSearchCount || 0;
  const maliyet = (kayit.tahminiMaliyet != null)
    ? (kayit.tahminiMaliyet < 0.01 ? '<$0.01' : `~$${kayit.tahminiMaliyet.toFixed(2)}`)
    : '';

  const soru = kayit.soru || '';
  const soruLines = soru.split('\n');
  const longSoru = soruLines.length > 3 || soru.length > 240;

  const ov = document.createElement('div');
  ov.className = 'modal-overlay';
  ov.innerHTML = `
    <div class="modal-box ai-gecmis-modal">
      <div class="modal-header">
        <span class="modal-title">${meta.icon} ${meta.ad}</span>
        <button class="modal-close" id="agmClose">✕</button>
      </div>

      <div class="ai-gecmis-modal-meta">
        <span><strong>${m.kisa}</strong></span>
        <span class="ai-yanit-meta-sep">•</span>
        <span>${tarihStr}</span>
        <span class="ai-yanit-meta-sep">•</span>
        <span>${inT.toLocaleString()} in + ${outT.toLocaleString()} out</span>
        ${ws ? `<span class="ai-yanit-meta-sep">•</span><span>${ws} web search</span>` : ''}
        ${maliyet ? `<span class="ai-yanit-meta-sep">•</span><span>${maliyet}</span>` : ''}
      </div>

      <div class="ai-gecmis-bolum">
        <div class="ai-gecmis-bolum-baslik">Soru</div>
        <pre class="ai-gecmis-soru ${longSoru ? 'collapsed' : ''}" id="agmSoru">${_esc(soru)}</pre>
        ${longSoru ? `<button class="ai-soru-toggle" id="agmSoruToggle" type="button">Tamamını gör</button>` : ''}
      </div>

      <div class="ai-gecmis-bolum">
        <div class="ai-gecmis-bolum-baslik">Yanıt</div>
        <div class="ai-yanit-body markdown-body">${_renderMd(kayit.yanit || '')}</div>
      </div>

      <div class="ai-gecmis-modal-actions">
        <button class="btn-mini" id="agmKopyalaMd"  type="button">📋 MD</button>
        <button class="btn-mini" id="agmKopyalaTxt" type="button">📝 Metin</button>
        <button class="btn-mini" id="agmPdf"        type="button">📄 PDF</button>
        <button class="btn-mini btn-mini-danger" id="agmSil" type="button">🗑 Sil</button>
      </div>
    </div>
  `;
  document.body.appendChild(ov);
  requestAnimationFrame(() => ov.classList.add('open'));

  const close = () => { ov.classList.remove('open'); setTimeout(() => ov.remove(), 300); };
  ov.addEventListener('click', e => { if (e.target === ov) close(); });
  document.getElementById('agmClose').addEventListener('click', close);

  // Soru genişlet
  document.getElementById('agmSoruToggle')?.addEventListener('click', () => {
    const el  = document.getElementById('agmSoru');
    const btn = document.getElementById('agmSoruToggle');
    if (!el || !btn) return;
    const exp = el.classList.toggle('collapsed') === false;
    btn.textContent = exp ? 'Daha az göster' : 'Tamamını gör';
  });

  // Kopyala
  document.getElementById('agmKopyalaMd').addEventListener('click', async () => {
    try { await copyMarkdown(kayit.yanit || ''); showToast('Markdown kopyalandı', 'success'); }
    catch { showToast('Kopyalanamadı', 'error'); }
  });
  document.getElementById('agmKopyalaTxt').addEventListener('click', async () => {
    try { await copyPlainText(kayit.yanit || ''); showToast('Düz metin kopyalandı', 'success'); }
    catch { showToast('Kopyalanamadı', 'error'); }
  });

  // PDF
  document.getElementById('agmPdf').addEventListener('click', async () => {
    const hid = hastaId || kayit.hastaId;
    const { ad, mrn } = _hastaInfo(hid);
    try {
      await exportPdf({ kayit, hastaAd: ad, hastaMrn: mrn });
    } catch (e) {
      showToast(`PDF oluşturulamadı: ${e.message}`, 'error');
    }
  });

  // Sil
  document.getElementById('agmSil').addEventListener('click', async () => {
    close();
    const ok = await confirm('Bu konsültasyonu silmek istediğinizden emin misiniz?');
    if (!ok) return;
    try {
      await deleteAiSorgu(kayit.id);
      showToast('Konsültasyon silindi', 'info');
    } catch (e) {
      showToast(`Silinemedi: ${e.message}`, 'error');
    }
  });
}

// Hasta detay overlay kapanırken aktif yanıtı temizle (state diğer hastaya sızmasın)
export function resetAi() {
  _aktifYanit       = null;
  _sonSablon        = 'serbest';
  _yukleniyor       = false;
  _webSearchEnabled = false;
}

// Geçmiş listesi (RTDB) güncellendiğinde — textarea/aktif yanıt state'ini bozmadan
export function refreshAiGecmis(hastaId) {
  const list = document.getElementById('aiGecmisList');
  if (!list) return;
  list.innerHTML = _renderGecmis(hastaId);
  _attachGecmisListeners(hastaId);
}
