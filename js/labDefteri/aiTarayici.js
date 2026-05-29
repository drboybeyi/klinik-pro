// Lab Defteri — AI Tarayıcı (v0.4.5 Sprint 3)
//
// Hastanın PDF/görüntü tetkiklerini tek seferde Sonnet 4.5'e gönderip yapılandırılmış
// lab veri (tarih × parametre) çıkarır. Sonuç hasta kaydına yazılır (hastalar/{id}/labDefteri).
//
// ÖNEMLİ (geri alınan v0.5 bug'larına düşmemek için):
//   - tetkikler PARAMETRE olarak gelir (hasta.tetkikler YOK — ayrı koleksiyon).
//   - gatherTetkikDosyalari `../utils/aiDosya.js`'ten (aiPdf.js değil).
//   - AI çağrısı self-contained streaming (askAIStream private + dahiliye prompt'lu).
//   - Kayıt çağıran tarafta updateHasta(id, { labDefteri }) ile yapılır.

import { gatherTetkikDosyalari, getMediaType } from '../utils/aiDosya.js';

const WORKER_STREAM_URL = 'https://muddy-cherry-1712.drahmetboyoglu.workers.dev/stream';
const PARSER_MODEL = 'claude-sonnet-4-5-20250929';

const MAX_BOYUT       = 30 * 1024 * 1024; // toplam 30 MB
const MAX_BYTES_PDF   = 32 * 1024 * 1024;
const MAX_BYTES_IMAGE =  5 * 1024 * 1024;
const MAX_TETKIK      = 10;

const SYSTEM_PROMPT =
  'Sen tıbbi laboratuvar raporu parser asistanısın. Verilen PDF/görüntü tetkik raporlarından ' +
  'sayısal lab değerlerini çıkarıp yapılandırılmış JSON döndürürsün. Açıklama yapmaz, markdown ' +
  'code block kullanmaz, sadece geçerli JSON üretirsin.';

// Parametre metadata'sı — matris renk/kategori/referans için (defter'e yazılır).
// min/max yoksa o yön sınırsız.
const PARAM_META = {
  // kardiyo
  BNP:       { isim: 'BNP',           birim: 'pg/mL',   kategori: 'kardiyo',    max: 100 },
  proBNP:    { isim: 'NT-proBNP',     birim: 'pg/mL',   kategori: 'kardiyo',    max: 125 },
  troponin:  { isim: 'Troponin',      birim: 'ng/mL',   kategori: 'kardiyo',    max: 0.04 },
  // biyokimya
  kreatinin:       { isim: 'Kreatinin',       birim: 'mg/dL', kategori: 'biyokimya', min: 0.7, max: 1.2 },
  BUN:             { isim: 'BUN',             birim: 'mg/dL', kategori: 'biyokimya', min: 7, max: 20 },
  ure:             { isim: 'Üre',             birim: 'mg/dL', kategori: 'biyokimya', min: 15, max: 45 },
  AST:             { isim: 'AST',             birim: 'U/L',   kategori: 'biyokimya', max: 40 },
  ALT:             { isim: 'ALT',             birim: 'U/L',   kategori: 'biyokimya', max: 40 },
  ALP:             { isim: 'ALP',             birim: 'U/L',   kategori: 'biyokimya', min: 40, max: 130 },
  GGT:             { isim: 'GGT',             birim: 'U/L',   kategori: 'biyokimya', max: 50 },
  bilirubin_total: { isim: 'Total Bilirubin', birim: 'mg/dL', kategori: 'biyokimya', max: 1.2 },
  albumin:         { isim: 'Albümin',         birim: 'g/dL',  kategori: 'biyokimya', min: 3.5, max: 5.0 },
  // elektrolit
  sodyum:    { isim: 'Sodyum',    birim: 'mEq/L', kategori: 'elektrolit', min: 136, max: 145 },
  potasyum:  { isim: 'Potasyum',  birim: 'mEq/L', kategori: 'elektrolit', min: 3.5, max: 5.0 },
  klor:      { isim: 'Klor',      birim: 'mEq/L', kategori: 'elektrolit', min: 98, max: 107 },
  kalsiyum:  { isim: 'Kalsiyum',  birim: 'mg/dL', kategori: 'elektrolit', min: 8.5, max: 10.5 },
  fosfor:    { isim: 'Fosfor',    birim: 'mg/dL', kategori: 'elektrolit', min: 2.5, max: 4.5 },
  magnezyum: { isim: 'Magnezyum', birim: 'mg/dL', kategori: 'elektrolit', min: 1.7, max: 2.2 },
  // hemogram
  hemoglobin: { isim: 'Hemoglobin', birim: 'g/dL',     kategori: 'hemogram', min: 12, max: 17.5 },
  hematokrit: { isim: 'Hematokrit', birim: '%',        kategori: 'hemogram', min: 36, max: 50 },
  MCV:        { isim: 'MCV',        birim: 'fL',       kategori: 'hemogram', min: 80, max: 100 },
  WBC:        { isim: 'WBC',        birim: 'x10³/µL',  kategori: 'hemogram', min: 4.5, max: 11 },
  trombosit:  { isim: 'Trombosit',  birim: 'x10³/µL',  kategori: 'hemogram', min: 150, max: 400 },
  ferritin:   { isim: 'Ferritin',   birim: 'ng/mL',    kategori: 'hemogram', min: 12, max: 300 },
  // enflamasyon
  CRP:  { isim: 'CRP', birim: 'mg/L',  kategori: 'enflamasyon', max: 5 },
  ESR:  { isim: 'ESR', birim: 'mm/hr', kategori: 'enflamasyon', max: 20 },
  // endokrin
  TSH:          { isim: 'TSH',            birim: 'µIU/mL', kategori: 'endokrin', min: 0.4, max: 4.0 },
  fT4:          { isim: 'fT4',            birim: 'ng/dL',  kategori: 'endokrin', min: 0.8, max: 1.8 },
  fT3:          { isim: 'fT3',            birim: 'pg/mL',  kategori: 'endokrin', min: 2.3, max: 4.2 },
  HbA1c:        { isim: 'HbA1c',          birim: '%',      kategori: 'endokrin', max: 5.7 },
  glukoz_aclik: { isim: 'Açlık Glukozu',  birim: 'mg/dL',  kategori: 'endokrin', min: 70, max: 100 },
  // koag
  INR:     { isim: 'INR',     birim: '',      kategori: 'koag', min: 0.8, max: 1.2 },
  aPTT:    { isim: 'aPTT',    birim: 'sn',    kategori: 'koag', min: 25, max: 35 },
  D_dimer: { isim: 'D-Dimer', birim: 'µg/mL', kategori: 'koag', max: 0.5 },
  // lipid
  LDL:             { isim: 'LDL',              birim: 'mg/dL', kategori: 'lipid', max: 100 },
  HDL:             { isim: 'HDL',              birim: 'mg/dL', kategori: 'lipid', min: 40 },
  trigliserit:     { isim: 'Trigliserit',     birim: 'mg/dL', kategori: 'lipid', max: 150 },
  totalKolesterol: { isim: 'Total Kolesterol', birim: 'mg/dL', kategori: 'lipid', max: 200 }
};

/**
 * Hastanın PDF/görüntü tetkiklerini AI ile tarar.
 * @param {Object} hasta — hasta objesi (şimdilik kullanılmıyor ama imza ileride lazım)
 * @param {Array}  tetkikler — hastanın tetkikleri (çağıran getState'ten filtreler)
 * @param {Object} opts — { onProgress(fullText), signal }
 * @returns {Promise<{labDefteri, meta} | {error, raw?}>}
 */
export async function topluLabTara(hasta, tetkikler, { onProgress, signal } = {}) {
  // Desteklenen dosyası olan tetkikleri en yeniden seç, 30 MB'a kadar
  const adaylar = (tetkikler || [])
    .map(t => ({ t, boyut: _destekliBoyut(t) }))
    .filter(x => x.boyut > 0)
    .sort((a, b) => new Date(b.t.tarih) - new Date(a.t.tarih))
    .slice(0, MAX_TETKIK);

  if (!adaylar.length) return { error: 'Bu hastada PDF/görüntü içeren tetkik bulunamadı' };

  let toplam = 0;
  const dahil = [];
  const atilan = [];
  for (const { t, boyut } of adaylar) {
    if (toplam + boyut <= MAX_BOYUT) { dahil.push(t); toplam += boyut; }
    else atilan.push(t);
  }
  if (!dahil.length) return { error: 'PDF dosyaları 30 MB sınırını aşıyor' };

  let dosyalar;
  try {
    dosyalar = await gatherTetkikDosyalari(tetkikler, dahil.map(t => t.id));
  } catch (e) {
    return { error: 'Dosyalar indirilemedi: ' + e.message };
  }
  if (!dosyalar.length) return { error: 'Tetkik dosyaları indirilemedi' };

  const blocks = dosyalar.map(d => ({
    type: d.kind, source: { type: 'base64', media_type: d.mediaType, data: d.data }
  }));
  blocks.push({ type: 'text', text: _prompt(dahil) });

  const body = {
    model:      PARSER_MODEL,
    max_tokens: 8192,
    system:     SYSTEM_PROMPT,
    messages:   [{ role: 'user', content: blocks }]
  };

  let resp;
  try {
    resp = await fetch(WORKER_STREAM_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal
    });
  } catch (e) {
    return { error: 'Ağ hatası: ' + e.message };
  }
  if (!resp.ok) {
    const tx = await resp.text().catch(() => '');
    return { error: `API ${resp.status}: ${tx.slice(0, 150)}` };
  }

  let text;
  try { text = await _streamMetni(resp, onProgress); }
  catch (e) { return { error: 'Yanıt okunamadı: ' + e.message }; }
  if (!text.trim()) return { error: 'AI boş yanıt döndü' };

  let parsed;
  try { parsed = _extractJson(text); }
  catch { return { error: 'AI yanıtı JSON olarak ayrıştırılamadı', raw: text.slice(0, 500) }; }

  const labDefteri = buildLabDefteri(parsed, dahil);
  if (!Object.keys(labDefteri.parametreler).length) {
    return { error: 'Taramada hiçbir lab değeri bulunamadı', raw: text.slice(0, 500) };
  }

  return {
    labDefteri,
    meta: {
      taranansayi:   dahil.length,
      atilansayi:    atilan.length,
      toplamBoyutMB: (toplam / 1024 / 1024).toFixed(1)
    }
  };
}

// parsed JSON → labDefteri (parametre metadata + tarih→tetkik kaynağı)
export function buildLabDefteri(parsed, tetkikler = []) {
  const tarihId = new Map();
  for (const t of tetkikler) if (t.tarih && !tarihId.has(t.tarih)) tarihId.set(t.tarih, t.id);

  const defter = { parametreler: {}, sonGuncelleme: new Date().toISOString() };

  for (const olcum of parsed?.olcumler || []) {
    const tarih = olcum?.tarih || null;
    for (const [key, ham] of Object.entries(olcum?.degerler || {})) {
      const deger = _sayi(ham);
      if (deger == null) continue;

      if (!defter.parametreler[key]) {
        const m = PARAM_META[key];
        defter.parametreler[key] = m
          ? { isim: m.isim, birim: m.birim, kategori: m.kategori, referans: _ref(m), olcumler: [] }
          : { isim: key, birim: '', kategori: 'diger', referans: null, olcumler: [] };
      }
      defter.parametreler[key].olcumler.push({
        deger, tarih, kaynak: (tarih && tarihId.get(tarih)) || null
      });
    }
  }

  for (const p of Object.values(defter.parametreler)) {
    p.olcumler.sort((a, b) => new Date(b.tarih) - new Date(a.tarih));
  }
  return defter;
}

// --- helpers ---

function _ref(m) {
  const r = {};
  if (m.min != null) r.min = m.min;
  if (m.max != null) r.max = m.max;
  return Object.keys(r).length ? r : null;
}

function _destekliBoyut(tetkik) {
  let toplam = 0;
  for (const d of (tetkik.dosyalar || [])) {
    const mi = getMediaType(d);
    if (!mi) continue;
    const max = mi.kind === 'document' ? MAX_BYTES_PDF : MAX_BYTES_IMAGE;
    if (d.boyut && d.boyut <= max) toplam += d.boyut;
  }
  return toplam;
}

function _prompt(dahil) {
  const paramListesi = Object.entries(PARAM_META)
    .map(([k, m]) => `- ${k} (${m.birim || 'birimsiz'})`)
    .join('\n');
  const tarihManifest = dahil
    .map(t => `  - ${t.tarih || '?'} · ${t.baslik || 'tetkik'}`)
    .join('\n');

  return `Aşağıdaki ${dahil.length} tetkik PDF/görüntüsünden TÜM lab değerlerini çıkar.

İSTENEN PARAMETRELER (key'leri TAM olarak bu şekilde kullan):
${paramListesi}

Dahil tetkiklerin tarihleri (rapor içinde tarih net değilse bunlardan uygun olanı seç):
${tarihManifest}

KESIN JSON FORMATI (markdown code block KULLANMA, açıklama YAPMA):

{
  "olcumler": [
    { "tarih": "2026-05-06", "degerler": { "kreatinin": 0.56, "BNP": 817, "sodyum": 142 } },
    { "tarih": "2026-04-14", "degerler": { "CRP": 111.6 } }
  ]
}

KURALLAR:
1. Her ölçümün tarihini raporun başlığından/içeriğinden al; YYYY-MM-DD yaz.
2. Aynı tarihteki tüm parametreleri tek "olcumler" girişinde topla.
3. Sayısal değerleri float yaz (1.15, 50) — string DEĞİL.
4. Bulduğun değeri ekle, bulamadığını atla.
5. Birimleri parametrenin standart birimine çevir.
6. Yalnızca yukarıdaki listede olan key'leri kullan.
7. SADECE JSON döndür.`;
}

// Anthropic SSE — text delta'larını biriktir, onProgress'e tam metni ver
async function _streamMetni(response, onProgress) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullText = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split('\n\n');
    buffer = events.pop() || '';

    for (const event of events) {
      if (!event.trim()) continue;
      const dataLine = event.split('\n').find(l => l.startsWith('data: '));
      if (!dataLine) continue;
      let data;
      try { data = JSON.parse(dataLine.substring(6)); } catch { continue; }
      if (data.type === 'content_block_delta' && data.delta?.type === 'text_delta') {
        fullText += data.delta.text;
        onProgress?.(fullText);
      }
    }
  }
  return fullText;
}

function _sayi(v) {
  if (v == null) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const m = String(v).replace(',', '.').match(/-?\d+(\.\d+)?/);
  if (!m) return null;
  const n = parseFloat(m[0]);
  return Number.isFinite(n) ? n : null;
}

function _extractJson(text) {
  let t = text.replace(/```json\s*/gi, '').replace(/```/g, '').trim();
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) throw new Error('JSON sınırları yok');
  return JSON.parse(t.slice(start, end + 1));
}
