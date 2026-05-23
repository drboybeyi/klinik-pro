import { getState } from '../state.js';
import { saveAiSorgu, deleteAiSorgu } from '../db.js';
import { showToast } from './toast.js';
import { confirm } from './modal.js';
import { formatTarih } from '../utils.js';
import { copyMarkdown, copyPlainText } from '../utils/aiKopyala.js';
import { exportPdf } from '../utils/aiPdf.js';
import {
  gatherTetkikDosyalari,
  gatherTetkikDosyaMetadata,
  gatherTetkikDosyaListMeta,
  getDefaultSecilenIds
} from '../utils/aiDosya.js';

const WEB_SEARCH_USD = 0.01; // arama başına

const WORKER_URL        = 'https://muddy-cherry-1712.drahmetboyoglu.workers.dev';
const WORKER_STREAM_URL = 'https://muddy-cherry-1712.drahmetboyoglu.workers.dev/stream';

const MODELS = {
  sonnet: {
    id:    'claude-sonnet-4-5-20250929',
    label: 'Sonnet 4.5 — dengeli ($0.03/sorgu)',
    kisa:  'Sonnet 4.5',
    inUsd:  3  / 1_000_000,
    outUsd: 15 / 1_000_000
  },
  opus: {
    id:    'claude-opus-4-7',
    label: 'Opus 4.7 — en iyi ($0.14/sorgu)',
    kisa:  'Opus 4.7',
    inUsd:  5  / 1_000_000,
    outUsd: 25 / 1_000_000
  },
  haiku: {
    id:    'claude-haiku-4-5',
    label: 'Haiku 4.5 — hızlı ($0.01/sorgu)',
    kisa:  'Haiku 4.5',
    inUsd:  1 / 1_000_000,
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

// --- Modül-içi state ---
let _aktifYanit          = null;
let _sonSablon           = 'serbest';
let _webSearchEnabled    = false;

// Streaming
let _streaming           = false;
let _aktifAbortController = null;
let _renderPending       = false;

// Hibrit tetkik seçimi
let _tetkikDahil         = true;   // ana checkbox
let _tetkikDetayAcik     = false;  // alt liste açık mı
let _secilenTetkikIdleri = null;   // null = auto (son 5); array = manuel seçim

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

// --- Token / maliyet tahmini (form altı önizleme için) ---

function _tahminTokenDosya(meta /* { pdfCount, imageCount } */) {
  // Kabaca: PDF ~750 token/sayfa, ortalama 2 sayfa varsayımı → 1500
  //         Image ~800 token
  return meta.pdfCount * 1500 + meta.imageCount * 800;
}

function _tahminMaliyetInput(tokens, modelKey) {
  const m = MODELS[modelKey];
  if (!m) return 0;
  return tokens * m.inUsd;
}

// --- Streaming API ---

async function askAIStream({
  modelKey, soru, webSearch, tetkikler, secilenTetkikIdleri,
  signal, onChunk, onComplete, onError
}) {
  const model   = MODELS[modelKey];
  const isHaiku = modelKey === 'haiku';

  // 1) Dosyaları topla (seçilenler veya auto son 5)
  const tumDosyalar = await gatherTetkikDosyalari(tetkikler || [], secilenTetkikIdleri);
  const filteredDosyalar = isHaiku ? tumDosyalar.filter(d => d.kind === 'image') : tumDosyalar;
  const haikuAtlanan = isHaiku ? tumDosyalar.filter(d => d.kind === 'document').length : 0;

  // 2) Content blocks
  const contentBlocks = filteredDosyalar.map(d => ({
    type: d.kind,
    source: { type: 'base64', media_type: d.mediaType, data: d.data }
  }));
  contentBlocks.push({ type: 'text', text: soru });

  // 3) Body
  const body = {
    model:      model.id,
    max_tokens: webSearch ? 4096 : 4096,
    system:     webSearch ? (SYSTEM_PROMPT_BASE + WEB_SEARCH_SYSTEM_EK) : SYSTEM_PROMPT_BASE,
    messages:   [{ role: 'user', content: contentBlocks }]
  };
  if (webSearch) {
    body.tools = [{ type: 'web_search_20250305', name: 'web_search', max_uses: 5 }];
  }

  // 4) Streaming fetch
  let response;
  try {
    response = await fetch(WORKER_STREAM_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal
    });
  } catch (error) {
    if (error.name === 'AbortError') {
      onComplete?.({ text: '', aborted: true, usage: { input_tokens: 0, output_tokens: 0 },
        webSearchCount: 0, model: model.id, pdfCount: 0, imageCount: 0, haikuAtlanan });
      return;
    }
    onError?.(error);
    return;
  }

  if (!response.ok) {
    const t = await response.text().catch(() => '');
    onError?.(new Error(`API ${response.status}: ${t.slice(0, 200)}`));
    return;
  }

  // 5) SSE parse
  const reader  = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullText = '';
  let usage = { input_tokens: 0, output_tokens: 0 };
  let webSearchCount = 0;
  let modelName = model.id;

  const pdfCount   = filteredDosyalar.filter(d => d.kind === 'document').length;
  const imageCount = filteredDosyalar.filter(d => d.kind === 'image').length;

  const _finish = (aborted) => onComplete?.({
    text: fullText, aborted, usage, webSearchCount,
    model: modelName, pdfCount, imageCount, haikuAtlanan
  });

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split('\n\n');
      buffer = events.pop() || '';

      for (const event of events) {
        if (!event.trim()) continue;
        const lines = event.split('\n');
        const dataLine = lines.find(l => l.startsWith('data: '));
        if (!dataLine) continue;
        let data;
        try { data = JSON.parse(dataLine.substring(6)); }
        catch { continue; }

        // Text delta
        if (data.type === 'content_block_delta' && data.delta?.type === 'text_delta') {
          const chunk = data.delta.text;
          fullText += chunk;
          onChunk?.(chunk, fullText);
        }
        // Web search tool kullanımı
        if (data.type === 'content_block_start' &&
            data.content_block?.type === 'server_tool_use' &&
            data.content_block?.name === 'web_search') {
          webSearchCount++;
        }
        // Message start (usage başlangıcı)
        if (data.type === 'message_start' && data.message) {
          usage.input_tokens = data.message.usage?.input_tokens || 0;
          modelName = data.message.model || model.id;
        }
        // Message delta (output token final)
        if (data.type === 'message_delta' && data.usage) {
          usage.output_tokens = data.usage.output_tokens || 0;
          // server_tool_use.web_search_requests gelirse onu güvenilir kabul et
          if (data.usage.server_tool_use?.web_search_requests != null) {
            webSearchCount = data.usage.server_tool_use.web_search_requests;
          }
        }
      }
    }
  } catch (error) {
    if (error.name === 'AbortError' || signal?.aborted) {
      _finish(true);
      return;
    }
    onError?.(error);
    return;
  }

  _finish(signal?.aborted === true);
}

function _maliyet(modelKey, inT, outT, webSearchCount = 0) {
  const m = MODELS[modelKey];
  if (!m) return 0;
  return inT * m.inUsd + outT * m.outUsd + (webSearchCount || 0) * WEB_SEARCH_USD;
}

function _formatToken(n) {
  return (n || 0).toLocaleString('tr-TR');
}

function _formatMaliyet(usd) {
  return usd < 0.01 ? '<$0.01' : `~$${usd.toFixed(2)}`;
}

// Tetkik özet satırı (hibrit seçim altı)
function _renderTetkikOzet(hastaId) {
  const sel       = document.getElementById('aiModelSelect');
  const modelKey  = sel?.value || 'sonnet';
  const isHaiku   = modelKey === 'haiku';
  const tetkikler = _items('tetkikler', hastaId);

  if (!_tetkikDahil) {
    return `<span class="ai-dosya-info-bos">📎 Tetkik eklenmeyecek</span>`;
  }

  const ids  = _secilenTetkikIdleri; // null = auto
  const meta = gatherTetkikDosyaMetadata(tetkikler, ids);

  if (meta.pdfCount === 0 && meta.imageCount === 0) {
    return `<span class="ai-dosya-info-bos">📎 Eklenecek tetkik dosyası yok</span>`;
  }

  // Haiku PDF filtresi
  const dahilPdf = isHaiku ? 0 : meta.pdfCount;
  const parts = [];
  if (dahilPdf > 0)        parts.push(`📄 ${dahilPdf} PDF`);
  if (meta.imageCount > 0) parts.push(`🖼 ${meta.imageCount} görüntü`);

  const tahminiToken = _tahminTokenDosya({ pdfCount: dahilPdf, imageCount: meta.imageCount });
  const tahminiUsd   = _tahminMaliyetInput(tahminiToken, modelKey);
  const usdTxt = tahminiUsd < 0.001 ? '<$0.001' : `~$${tahminiUsd.toFixed(3)}`;

  let html = `<span class="ai-dosya-info-ok">📎 ${parts.join(' + ')} eklenecek · ${usdTxt} ek</span>`;

  if (isHaiku && meta.pdfCount > 0) {
    html += `<div class="tetkik-ozet-uyari">⚠️ Haiku 4.5 PDF desteklemiyor. ${meta.pdfCount} PDF atlanacak, sadece görüntüler gönderilecek.</div>`;
  }
  return html;
}

// Hibrit tetkik seçim bloğunu (detaylı liste) render et
function _renderTetkikSecimBlock(hastaId) {
  const tetkikler = _items('tetkikler', hastaId);
  const listMeta  = gatherTetkikDosyaListMeta(tetkikler);
  const toplam    = listMeta.length;
  const dosyaliSayisi = listMeta.filter(m => m.pdfCount + m.imageCount > 0).length;

  // ana checkbox label dosya sayısını yansıtsın
  const anaLabelEk = toplam > 0
    ? (_secilenTetkikIdleri == null
        ? `<small>(son 5 tetkik)</small>`
        : `<small>(${_secilenTetkikIdleri.length} tetkik seçili)</small>`)
    : `<small>(tetkik yok)</small>`;

  // Liste satırları (sadece dosyalı tetkikler; dosyasız olanlar listeye girmez)
  const dahilIdSet = new Set(
    _secilenTetkikIdleri != null
      ? _secilenTetkikIdleri
      : listMeta.filter(m => m.autoSelected).map(m => m.id)
  );

  const liste = listMeta.filter(m => m.pdfCount + m.imageCount > 0).map(m => {
    const tarihStr = m.tarih ? formatTarih(m.tarih) : '';
    const tur = TETKIK_TUR_LBL[m.tur] || 'Diğer';
    const fileBits = [];
    if (m.pdfCount > 0)   fileBits.push(`${m.pdfCount} PDF`);
    if (m.imageCount > 0) fileBits.push(`${m.imageCount} img`);
    const fileTxt = fileBits.join(' + ');
    const dahil = dahilIdSet.has(m.id);
    return `
      <label class="tetkik-item">
        <input type="checkbox" data-tetkik-id="${m.id}" ${dahil ? 'checked' : ''} ${_tetkikDahil ? '' : 'disabled'}>
        <span class="tetkik-item-label">
          <span class="tetkik-item-tarih">${tarihStr}</span>
          <span class="tetkik-item-baslik">${_esc(m.baslik || tur)}</span>
          <span class="tetkik-item-dosya">${fileTxt}</span>
        </span>
      </label>
    `;
  }).join('') || `<div class="tetkik-item-bos">Dosyalı tetkik yok</div>`;

  return `
    <div class="ai-tetkik-secim">
      <label class="checkbox-row">
        <input type="checkbox" data-tetkik-dahil ${_tetkikDahil ? 'checked' : ''}>
        <span>📎 Tetkikleri AI'a ekle ${anaLabelEk}</span>
      </label>

      ${dosyaliSayisi > 0 ? `
        <button type="button" class="link-btn" data-tetkik-detay-toggle ${_tetkikDahil ? '' : 'disabled'}>
          ${_tetkikDetayAcik ? 'Detayı gizle' : `Detaylı seç (${dosyaliSayisi} tetkik)`}
        </button>
        <div class="tetkik-listesi" data-tetkik-listesi ${_tetkikDetayAcik ? '' : 'hidden'}>
          ${liste}
        </div>
      ` : ''}

      <div class="tetkik-ozet" data-tetkik-ozet>${_renderTetkikOzet(hastaId)}</div>
    </div>
  `;
}

// --- Markdown render ---

function _renderMd(text) {
  if (window.marked?.parse) {
    try { return window.marked.parse(text || '', { breaks: true }); }
    catch { /* fallthrough */ }
  }
  const esc = (text || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
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

        <div id="aiTetkikSecimSlot">${_renderTetkikSecimBlock(hastaId)}</div>

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
  if (!_aktifYanit) return '';
  const m   = MODELS[_aktifYanit.modelKey];
  const ws  = _aktifYanit.webSearchCount || 0;
  const pdf = _aktifYanit.pdfCount       || 0;
  const img = _aktifYanit.imageCount     || 0;
  const inT = _aktifYanit.inputTokens    || 0;
  const outT = _aktifYanit.outputTokens  || 0;
  const aborted = !!_aktifYanit.aborted;
  const streaming = !!_aktifYanit.streaming;

  // Metadata parçaları
  const dosyaParts = [];
  if (pdf > 0) dosyaParts.push(`📄 ${pdf} PDF`);
  if (img > 0) dosyaParts.push(`🖼 ${img} görüntü`);
  const dosyaTxt = dosyaParts.join(' + ');

  const maliyet    = _maliyet(_aktifYanit.modelKey, inT, outT, ws);
  const maliyetTxt = _formatMaliyet(maliyet);

  // Önceki yanıt bölümü (Yeniden Sor)
  const oncekiHtml = (_aktifYanit.oncekiYanit) ? `
    <div class="ai-yanit-onceki-bolum">
      <div class="ai-yanit-onceki-baslik">Önceki yanıt · ${_aktifYanit.oncekiTarih || ''}</div>
      <div class="ai-yanit-body markdown-body">${_renderMd(_aktifYanit.oncekiYanit)}</div>
    </div>
  ` : '';

  if (streaming) {
    // Stream başlığı + boş/akan body. Action butonları yok, metadata yok.
    const yeniBaslik = _aktifYanit.oncekiYanit
      ? `<div class="ai-yanit-yeni-baslik">Yeni yanıt · şimdi</div>` : '';
    return `
      <div class="card ai-yanit-card ai-yanit-streaming">
        ${yeniBaslik}
        <div class="ai-yanit-streaming-bar">
          <span class="ai-streaming-dot"></span>
          <span>Yazılıyor… <strong>${m?.kisa || ''}</strong></span>
        </div>
        <div class="ai-yanit-body markdown-body" id="aiYanitBody">${_renderMd(_aktifYanit.yanit || '')}</div>
        ${oncekiHtml}
      </div>
    `;
  }

  // Stream bitti — tam metadata + action
  const yeniBaslik = _aktifYanit.oncekiYanit
    ? `<div class="ai-yanit-yeni-baslik">Yeni yanıt · ${_aktifYanit.yeniTarih || ''}</div>` : '';

  const abortedNote = aborted
    ? `<div class="ai-yanit-aborted-note">⚠️ Yarıda kesildi</div>` : '';

  return `
    <div class="card ai-yanit-card">
      ${yeniBaslik}
      ${abortedNote}
      <div class="ai-yanit-meta">
        <div class="ai-yanit-meta-info">
          <strong>${m?.kisa || ''}</strong>
          ${dosyaTxt ? `<span class="ai-yanit-meta-sep">•</span><span>${dosyaTxt}</span>` : ''}
          <span class="ai-yanit-meta-sep">•</span>
          <span>${_formatToken(inT)} in + ${_formatToken(outT)} out</span>
          ${ws ? `<span class="ai-yanit-meta-sep">•</span><span>🌐 ${ws} web search</span>` : ''}
          <span class="ai-yanit-meta-sep">•</span>
          <span>${maliyetTxt}</span>
        </div>
        <div class="ai-yanit-actions">
          <button class="btn-mini" id="aiKopyalaMd"   title="Markdown kopyala">📋 MD</button>
          <button class="btn-mini" id="aiKopyalaTxt"  title="Düz metin kopyala">📝 Metin</button>
          <button class="btn-mini" id="aiPdf"         title="PDF indir">📄 PDF</button>
          <button class="btn-mini btn-mini-primary" id="aiKaydet" title="Kaydet">💾 Kaydet</button>
        </div>
      </div>
      <div class="ai-yanit-body markdown-body">${_renderMd(_aktifYanit.yanit)}</div>
      ${oncekiHtml}
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

  // Model değişince tetkik özetini ve seçim bloğunu yenile
  document.getElementById('aiModelSelect')?.addEventListener('change', () => _refreshTetkikSecim(hastaId));

  // Konsültasyon İste / Durdur
  document.getElementById('aiSorBtn')?.addEventListener('click', () => {
    if (_streaming) _stopStream();
    else            _gonderStream(hastaId);
  });

  // Hibrit tetkik seçimi
  _attachTetkikSecimListeners(hastaId);

  // Aktif yanıt aksiyon butonları
  _attachAktifYanitListeners(hastaId);

  // Geçmiş kartları + sil
  _attachGecmisListeners(hastaId);

  // Textarea değişirse şablon → serbest sayılsın
  document.getElementById('aiSoru')?.addEventListener('input', e => {
    if (!e.target.value.trim()) _sonSablon = 'serbest';
  });
}

function _attachTetkikSecimListeners(hastaId) {
  // Ana checkbox
  const ana = document.querySelector('[data-tetkik-dahil]');
  ana?.addEventListener('change', e => {
    _tetkikDahil = e.target.checked;
    if (!_tetkikDahil) _tetkikDetayAcik = false;
    _refreshTetkikSecim(hastaId);
  });

  // Detaylı seç toggle
  document.querySelector('[data-tetkik-detay-toggle]')?.addEventListener('click', () => {
    if (!_tetkikDahil) return;
    _tetkikDetayAcik = !_tetkikDetayAcik;
    _refreshTetkikSecim(hastaId);
  });

  // Alt checkbox'lar
  document.querySelectorAll('[data-tetkik-id]').forEach(cb => {
    cb.addEventListener('change', () => {
      // Mevcut seçimi snapshot et: ya manuel seçim ya da auto'dan başla
      const tetkikler = _items('tetkikler', hastaId);
      if (_secilenTetkikIdleri == null) {
        _secilenTetkikIdleri = getDefaultSecilenIds(tetkikler);
      }
      const id = cb.dataset.tetkikId;
      const idx = _secilenTetkikIdleri.indexOf(id);
      if (cb.checked && idx < 0)       _secilenTetkikIdleri.push(id);
      else if (!cb.checked && idx >= 0) _secilenTetkikIdleri.splice(idx, 1);
      // Sadece özet satırını ve ana label'ı güncellemek yeterli — liste DOM'u stabil kalır
      _refreshTetkikOzetSatiri(hastaId);
      _refreshAnaLabel(hastaId);
    });
  });
}

function _refreshTetkikSecim(hastaId) {
  const slot = document.getElementById('aiTetkikSecimSlot');
  if (!slot) return;
  slot.innerHTML = _renderTetkikSecimBlock(hastaId);
  _attachTetkikSecimListeners(hastaId);
}

function _refreshTetkikOzetSatiri(hastaId) {
  const el = document.querySelector('[data-tetkik-ozet]');
  if (el) el.innerHTML = _renderTetkikOzet(hastaId);
}

function _refreshAnaLabel(hastaId) {
  const tetkikler = _items('tetkikler', hastaId);
  const listMeta  = gatherTetkikDosyaListMeta(tetkikler);
  const dosyaliSayisi = listMeta.filter(m => m.pdfCount + m.imageCount > 0).length;
  const span = document.querySelector('[data-tetkik-dahil]')?.parentElement?.querySelector('small');
  if (span) {
    if (listMeta.length === 0) span.textContent = '(tetkik yok)';
    else if (_secilenTetkikIdleri == null) span.textContent = '(son 5 tetkik)';
    else span.textContent = `(${_secilenTetkikIdleri.length} tetkik seçili)`;
  }
  const toggle = document.querySelector('[data-tetkik-detay-toggle]');
  if (toggle && !_tetkikDetayAcik) toggle.textContent = `Detaylı seç (${dosyaliSayisi} tetkik)`;
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
      if (e.target.closest('[data-ai-del]')) return;
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

// --- Stream gönder / durdur ---

function _setButton(streaming) {
  const btn    = document.getElementById('aiSorBtn');
  const lbl    = document.getElementById('aiSorBtnLabel');
  if (!btn) return;
  if (streaming) {
    btn.classList.add('is-streaming');
    if (lbl) lbl.textContent = '⏹ Durdur';
  } else {
    btn.classList.remove('is-streaming');
    if (lbl) lbl.textContent = 'Konsültasyon İste';
  }
}

function _scheduleStreamRender() {
  if (_renderPending) return;
  _renderPending = true;
  requestAnimationFrame(() => {
    _renderPending = false;
    const body = document.getElementById('aiYanitBody');
    if (body && _aktifYanit) body.innerHTML = _renderMd(_aktifYanit.yanit || '');
  });
}

async function _gonderStream(hastaId, overrides = null) {
  // overrides: { soru, modelKey, sablonAdi, oncekiYanit, oncekiTarih, oncekiKayitId, secilenTetkikIdleri }
  const ta       = document.getElementById('aiSoru');
  const sel      = document.getElementById('aiModelSelect');
  const soru     = overrides?.soru ?? (ta?.value || '').trim();
  const modelKey = overrides?.modelKey ?? (sel?.value || 'sonnet');
  const sablonAdi = overrides?.sablonAdi ?? _sonSablon ?? 'serbest';

  if (!soru) {
    showToast('Soru boş olamaz', 'error');
    return;
  }

  // Yeniden Sor için: textarea + model UI'ı senkronla
  if (overrides) {
    if (ta && ta.value !== soru) ta.value = soru;
    if (sel && overrides.modelKey && sel.value !== overrides.modelKey) sel.value = overrides.modelKey;
  }

  // Seçilen tetkikler: override > UI state
  let secilenTetkikIdleri;
  if (overrides && 'secilenTetkikIdleri' in overrides) {
    secilenTetkikIdleri = overrides.secilenTetkikIdleri;
  } else {
    secilenTetkikIdleri = _tetkikDahil ? _secilenTetkikIdleri : [];
  }

  _streaming = true;
  _aktifAbortController = new AbortController();
  _aktifYanit = {
    hastaId,
    modelKey,
    sablonAdi,
    soru,
    yanit:          '',
    streaming:      true,
    aborted:        false,
    inputTokens:    0,
    outputTokens:   0,
    webSearchCount: 0,
    pdfCount:       0,
    imageCount:     0,
    apiModel:       MODELS[modelKey]?.id || '',
    secilenTetkikIdleri: secilenTetkikIdleri == null ? null : [...secilenTetkikIdleri],
    haikuAtlanan:   0,
    // Yeniden Sor için
    oncekiYanit:    overrides?.oncekiYanit || null,
    oncekiTarih:    overrides?.oncekiTarih || null,
    oncekiKayitId:  overrides?.oncekiKayitId || null
  };
  _setButton(true);
  _refreshYanitSlot(hastaId);

  const tetkikler = _items('tetkikler', hastaId);

  try {
    await askAIStream({
      modelKey,
      soru,
      webSearch: _webSearchEnabled,
      tetkikler,
      secilenTetkikIdleri,
      signal: _aktifAbortController.signal,
      onChunk: (_chunk, full) => {
        if (!_aktifYanit) return;
        _aktifYanit.yanit = full;
        _scheduleStreamRender();
      },
      onComplete: ({ text, aborted, usage, webSearchCount, model, pdfCount, imageCount, haikuAtlanan }) => {
        if (!_aktifYanit) return;
        _aktifYanit.yanit          = text || _aktifYanit.yanit || '';
        _aktifYanit.streaming      = false;
        _aktifYanit.aborted        = !!aborted;
        _aktifYanit.inputTokens    = usage?.input_tokens || 0;
        _aktifYanit.outputTokens   = usage?.output_tokens || 0;
        _aktifYanit.webSearchCount = webSearchCount || 0;
        _aktifYanit.pdfCount       = pdfCount || 0;
        _aktifYanit.imageCount     = imageCount || 0;
        _aktifYanit.haikuAtlanan   = haikuAtlanan || 0;
        _aktifYanit.apiModel       = model || _aktifYanit.apiModel;
        _aktifYanit.yeniTarih      = new Date().toLocaleString('tr-TR', {
          day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
        });
        if (_aktifYanit.haikuAtlanan > 0) {
          showToast(`${_aktifYanit.haikuAtlanan} PDF Haiku tarafından desteklenmiyor — atlandı`, 'warning');
        }
        _streaming = false;
        _aktifAbortController = null;
        _setButton(false);
        _refreshYanitSlot(hastaId);
      },
      onError: (err) => {
        showToast(`Hata: ${err.message || err}`, 'error');
        _aktifYanit = null;
        _streaming = false;
        _aktifAbortController = null;
        _setButton(false);
        _refreshYanitSlot(hastaId);
      }
    });
  } catch (e) {
    showToast(`Hata: ${e.message || e}`, 'error');
    _aktifYanit = null;
    _streaming = false;
    _aktifAbortController = null;
    _setButton(false);
    _refreshYanitSlot(hastaId);
  }
}

function _stopStream() {
  if (_aktifAbortController) {
    try { _aktifAbortController.abort(); } catch {}
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
        pdfCount:       _aktifYanit.pdfCount   || 0,
        imageCount:     _aktifYanit.imageCount || 0,
        tahminiMaliyet: Number(maliyet.toFixed(6)),
        olusturmaTarih: new Date().toISOString(),
        apiModel:       _aktifYanit.apiModel,
        aborted:        !!_aktifYanit.aborted
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
      model:               _aktifYanit.modelKey,
      apiModel:            _aktifYanit.apiModel,
      sablonAdi:           _aktifYanit.sablonAdi,
      soru:                _aktifYanit.soru,
      yanit:               _aktifYanit.yanit,
      inputTokens:         _aktifYanit.inputTokens,
      outputTokens:        _aktifYanit.outputTokens,
      webSearchCount:      ws,
      pdfCount:            _aktifYanit.pdfCount   || 0,
      imageCount:          _aktifYanit.imageCount || 0,
      tahminiMaliyet:      Number(maliyet.toFixed(6)),
      aborted:             !!_aktifYanit.aborted,
      streaming:           true,
      secilenTetkikIdleri: _aktifYanit.secilenTetkikIdleri || null
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
  const pdf  = kayit.pdfCount       || 0;
  const img  = kayit.imageCount     || 0;
  const dosyaParts = [];
  if (pdf > 0) dosyaParts.push(`📄 ${pdf} PDF`);
  if (img > 0) dosyaParts.push(`🖼 ${img} görüntü`);
  const dosyaTxt = dosyaParts.join(' + ');
  const maliyet = (kayit.tahminiMaliyet != null)
    ? _formatMaliyet(kayit.tahminiMaliyet) : '';
  const abortedNote = kayit.aborted
    ? `<div class="ai-yanit-aborted-note">⚠️ Yarıda kesildi</div>` : '';

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
        ${dosyaTxt ? `<span class="ai-yanit-meta-sep">•</span><span>${dosyaTxt}</span>` : ''}
        <span class="ai-yanit-meta-sep">•</span>
        <span>${_formatToken(inT)} in + ${_formatToken(outT)} out</span>
        ${ws ? `<span class="ai-yanit-meta-sep">•</span><span>🌐 ${ws} web search</span>` : ''}
        ${maliyet ? `<span class="ai-yanit-meta-sep">•</span><span>${maliyet}</span>` : ''}
      </div>

      ${abortedNote}

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
        <button class="btn-mini btn-mini-primary" id="agmYenidenSor" type="button">🔄 Yeniden Sor</button>
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

  document.getElementById('agmSoruToggle')?.addEventListener('click', () => {
    const el  = document.getElementById('agmSoru');
    const btn = document.getElementById('agmSoruToggle');
    if (!el || !btn) return;
    const exp = el.classList.toggle('collapsed') === false;
    btn.textContent = exp ? 'Daha az göster' : 'Tamamını gör';
  });

  document.getElementById('agmKopyalaMd').addEventListener('click', async () => {
    try { await copyMarkdown(kayit.yanit || ''); showToast('Markdown kopyalandı', 'success'); }
    catch { showToast('Kopyalanamadı', 'error'); }
  });
  document.getElementById('agmKopyalaTxt').addEventListener('click', async () => {
    try { await copyPlainText(kayit.yanit || ''); showToast('Düz metin kopyalandı', 'success'); }
    catch { showToast('Kopyalanamadı', 'error'); }
  });

  document.getElementById('agmPdf').addEventListener('click', async () => {
    const hid = hastaId || kayit.hastaId;
    const { ad, mrn } = _hastaInfo(hid);
    try { await exportPdf({ kayit, hastaAd: ad, hastaMrn: mrn }); }
    catch (e) { showToast(`PDF oluşturulamadı: ${e.message}`, 'error'); }
  });

  // Yeniden Sor — modal kapanır, AI sekmesinde stream başlar
  document.getElementById('agmYenidenSor').addEventListener('click', () => {
    if (_streaming) {
      showToast('Önce mevcut yanıtı bitirin veya durdurun', 'warning');
      return;
    }
    close();
    const tarihKisa = kayit.olusturmaTarih
      ? new Date(kayit.olusturmaTarih).toLocaleString('tr-TR', {
          day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
        }) : '';
    // Hibrit UI state'ini orijinal seçime sürükle
    if (kayit.secilenTetkikIdleri && Array.isArray(kayit.secilenTetkikIdleri)) {
      _secilenTetkikIdleri = [...kayit.secilenTetkikIdleri];
      _tetkikDahil = kayit.secilenTetkikIdleri.length > 0;
    } else {
      _secilenTetkikIdleri = null;
      _tetkikDahil = true;
    }
    _refreshTetkikSecim(hastaId);

    _gonderStream(hastaId, {
      soru:        kayit.soru,
      modelKey:    kayit.model,
      sablonAdi:   kayit.sablonAdi,
      secilenTetkikIdleri: kayit.secilenTetkikIdleri ?? null,
      oncekiYanit: kayit.yanit,
      oncekiTarih: tarihKisa,
      oncekiKayitId: kayit.id
    });

    // Yanıt slot'una scroll
    document.getElementById('aiYanitSlot')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

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

// --- Reset / refresh hooks ---

export function resetAi() {
  if (_aktifAbortController) { try { _aktifAbortController.abort(); } catch {} }
  _aktifYanit          = null;
  _sonSablon           = 'serbest';
  _webSearchEnabled    = false;
  _streaming           = false;
  _aktifAbortController = null;
  _tetkikDahil         = true;
  _tetkikDetayAcik     = false;
  _secilenTetkikIdleri = null;
}

export function refreshAiGecmis(hastaId) {
  const list = document.getElementById('aiGecmisList');
  if (!list) return;
  list.innerHTML = _renderGecmis(hastaId);
  _attachGecmisListeners(hastaId);
}

export function refreshAiDosyaInfo(hastaId) {
  _refreshTetkikSecim(hastaId);
}
