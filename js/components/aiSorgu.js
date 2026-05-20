import { getState } from '../state.js';
import { saveAiSorgu } from '../db.js';
import { showToast } from './toast.js';
import { formatTarih } from '../utils.js';

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

const SYSTEM_PROMPT = `Sen 25 yıllık deneyimli bir dahiliye uzmanısın. UpToDate, PubMed, ESC, ADA, KDIGO, GOLD, TİTCK kaynaklarına hakimsin. Klinisyen meslektaşına yardımcı oluyorsun.

KURALLAR:
- Türkçe yanıt ver
- Kanıt seviyesi yüksek bilgiler kullan
- Doz/etkileşim sorularında daima ikinci kaynak doğrulamasını öner
- Belirsiz alanlarda dürüstçe söyle ("kanıt yetersiz", "uzmandan konsültasyon önerilir")
- Mümkün olduğunda kılavuz referansı ver (ESC 2024, KDIGO 2024 vb.)
- Klinik karar verirken doktor sorumluluğunda olduğunu hatırlat (sadece bilgi destek)
- Yanıt yapısı: 1) Klinik değerlendirme, 2) Öneriler (numaralandırılmış), 3) Kaynaklar/Kılavuzlar`;

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
let _aktifYanit = null;
let _sonSablon  = 'serbest';
let _yukleniyor = false;

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

async function askAI({ modelKey, soru }) {
  const model = MODELS[modelKey];
  const r = await fetch(WORKER_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: model.id,
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: soru }]
    })
  });
  if (!r.ok) {
    const t = await r.text().catch(() => '');
    throw new Error(`API ${r.status}: ${t.slice(0, 200)}`);
  }
  const data = await r.json();
  if (!data?.content?.[0]?.text) {
    throw new Error('API yanıtı boş ya da beklenmedik formatta');
  }
  return {
    text:         data.content[0].text,
    inputTokens:  data.usage?.input_tokens  || 0,
    outputTokens: data.usage?.output_tokens || 0,
    apiModel:     data.model || model.id
  };
}

function _maliyet(modelKey, inT, outT) {
  const m = MODELS[modelKey];
  if (!m) return 0;
  return inT * m.inUsd + outT * m.outUsd;
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
  const maliyet = _maliyet(_aktifYanit.modelKey, _aktifYanit.inputTokens, _aktifYanit.outputTokens);
  const maliyetTxt = maliyet < 0.01 ? '<$0.01' : `~$${maliyet.toFixed(2)}`;
  return `
    <div class="card ai-yanit-card">
      <div class="ai-yanit-meta">
        <div class="ai-yanit-meta-info">
          <strong>${m.kisa}</strong>
          <span class="ai-yanit-meta-sep">•</span>
          <span>${_aktifYanit.inputTokens.toLocaleString()} in + ${_aktifYanit.outputTokens.toLocaleString()} out</span>
          <span class="ai-yanit-meta-sep">•</span>
          <span>${maliyetTxt}</span>
        </div>
        <div class="ai-yanit-actions">
          <button class="icon-btn" id="aiKopyala" title="Kopyala">📋</button>
          <button class="icon-btn" id="aiKaydet"  title="Kaydet">💾</button>
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
          <span class="badge badge-medical">${meta.icon} ${meta.ad}</span>
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

  // Konsültasyon İste
  document.getElementById('aiSorBtn')?.addEventListener('click', () => _gonder(hastaId));

  // Kopyala / Kaydet
  document.getElementById('aiKopyala')?.addEventListener('click', _kopyala);
  document.getElementById('aiKaydet') ?.addEventListener('click', () => _kaydet(hastaId));

  // Geçmiş kartları
  document.querySelectorAll('.ai-gecmis-kart').forEach(k => {
    k.addEventListener('click', () => {
      const id   = k.dataset.aiId;
      const kayit = (getState('aiSorgulari') || {})[id];
      if (kayit) _openGecmisModal(kayit);
    });
  });

  // Textarea değişirse şablon → serbest sayılsın (textarea boşa düşerse de)
  document.getElementById('aiSoru')?.addEventListener('input', e => {
    if (!e.target.value.trim()) _sonSablon = 'serbest';
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
    const sonuc = await askAI({ modelKey, soru });
    _aktifYanit = {
      hastaId,
      modelKey,
      sablonAdi:    _sonSablon || 'serbest',
      soru,
      yanit:        sonuc.text,
      inputTokens:  sonuc.inputTokens,
      outputTokens: sonuc.outputTokens,
      apiModel:     sonuc.apiModel
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
  document.getElementById('aiKopyala')?.addEventListener('click', _kopyala);
  document.getElementById('aiKaydet') ?.addEventListener('click', () => _kaydet(hastaId));
}

async function _kopyala() {
  if (!_aktifYanit) return;
  try {
    await navigator.clipboard.writeText(_aktifYanit.yanit);
    showToast('Yanıt kopyalandı', 'success');
  } catch {
    showToast('Kopyalanamadı', 'error');
  }
}

async function _kaydet(hastaId) {
  if (!_aktifYanit) return;
  const btn = document.getElementById('aiKaydet');
  if (btn) btn.disabled = true;
  try {
    const maliyet = _maliyet(_aktifYanit.modelKey, _aktifYanit.inputTokens, _aktifYanit.outputTokens);
    await saveAiSorgu({
      hastaId,
      model:           _aktifYanit.modelKey,
      apiModel:        _aktifYanit.apiModel,
      sablonAdi:       _aktifYanit.sablonAdi,
      soru:            _aktifYanit.soru,
      yanit:           _aktifYanit.yanit,
      inputTokens:     _aktifYanit.inputTokens,
      outputTokens:    _aktifYanit.outputTokens,
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

function _openGecmisModal(kayit) {
  const meta = SABLON_META[kayit.sablonAdi] || SABLON_META.serbest;
  const m    = MODELS[kayit.model] || { kisa: kayit.model };
  const tarihStr = kayit.olusturmaTarih ? new Date(kayit.olusturmaTarih).toLocaleString('tr-TR') : '';
  const inT  = kayit.inputTokens  || 0;
  const outT = kayit.outputTokens || 0;
  const maliyet = (kayit.tahminiMaliyet != null)
    ? (kayit.tahminiMaliyet < 0.01 ? '<$0.01' : `~$${kayit.tahminiMaliyet.toFixed(2)}`)
    : '';

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
        ${maliyet ? `<span class="ai-yanit-meta-sep">•</span><span>${maliyet}</span>` : ''}
      </div>

      <div class="ai-gecmis-bolum">
        <div class="ai-gecmis-bolum-baslik">Soru</div>
        <pre class="ai-gecmis-soru">${_esc(kayit.soru || '')}</pre>
      </div>

      <div class="ai-gecmis-bolum">
        <div class="ai-gecmis-bolum-baslik">Yanıt</div>
        <div class="ai-yanit-body markdown-body">${_renderMd(kayit.yanit || '')}</div>
      </div>

      <div class="modal-footer">
        <button class="btn btn-secondary" id="agmKapat">Kapat</button>
      </div>
    </div>
  `;
  document.body.appendChild(ov);
  requestAnimationFrame(() => ov.classList.add('open'));

  const close = () => { ov.classList.remove('open'); setTimeout(() => ov.remove(), 300); };
  ov.addEventListener('click', e => { if (e.target === ov) close(); });
  document.getElementById('agmClose').addEventListener('click', close);
  document.getElementById('agmKapat').addEventListener('click', close);
}

// Hasta detay overlay kapanırken aktif yanıtı temizle (state diğer hastaya sızmasın)
export function resetAi() {
  _aktifYanit = null;
  _sonSablon  = 'serbest';
  _yukleniyor = false;
}

// Geçmiş listesi (RTDB) güncellendiğinde — textarea/aktif yanıt state'ini bozmadan
export function refreshAiGecmis(hastaId) {
  const list = document.getElementById('aiGecmisList');
  if (!list) return;
  list.innerHTML = _renderGecmis(hastaId);
  document.querySelectorAll('.ai-gecmis-kart').forEach(k => {
    k.addEventListener('click', () => {
      const id = k.dataset.aiId;
      const kayit = (getState('aiSorgulari') || {})[id];
      if (kayit) _openGecmisModal(kayit);
    });
  });
}
