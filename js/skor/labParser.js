// AI Lab Parser (v0.4.1)
// Hastanın son tetkik PDF/görüntü dosyalarını Sonnet 4.5'e gönderip
// istenen lab değerlerini JSON olarak çıkarır.
//
// Worker non-streaming endpoint kullanılır — parser kısa, tek JSON yanıt yeterli.
// Skor modülü input'larında `labParseAlan` field'i ile hangi alanın hangi input'a
// gideceği belirtilir; CURB-65 gibi özel davranışlar `applyLabParse` ile override.

import { getState } from '../state.js';
import { gatherTetkikDosyalari } from '../utils/aiDosya.js';

const WORKER_URL = 'https://muddy-cherry-1712.drahmetboyoglu.workers.dev';
const PARSER_MODEL = 'claude-sonnet-4-5-20250929';
const MAX_TETKIK = 3; // Son N tetkikin dosyalarını gönder

const ALAN_KARSILIGI = {
  kreatinin: 'Kreatinin / Krea / Cr / Creatinine (mg/dL)',
  bilirubin: 'Total Bilirubin / T.Bil / Bilirubin / Bili (mg/dL)',
  inr:       'INR / International Normalized Ratio',
  sodyum:    'Sodyum / Na / Sodium (mEq/L veya mmol/L — rakamsal aynı)',
  albumin:   'Albumin / Alb (g/dL)',
  BUN:       'BUN / Blood Urea Nitrogen / Üre nitrojen (mg/dL)',
  ure:       'Üre / Urea (mmol/L; mg/dL gelirse BUN olarak yaz)'
};

const SINIRLAR = {
  kreatinin: { min: 0.2, max: 20,  birim: 'mg/dL' },
  bilirubin: { min: 0.1, max: 50,  birim: 'mg/dL' },
  inr:       { min: 0.5, max: 15,  birim: ''      },
  sodyum:    { min: 100, max: 180, birim: 'mEq/L' },
  albumin:   { min: 0.5, max: 6,   birim: 'g/dL'  },
  BUN:       { min: 2,   max: 200, birim: 'mg/dL' },
  ure:       { min: 1,   max: 50,  birim: 'mmol/L' }
};

const SYSTEM_PROMPT =
  `Sen bir tıbbi laboratuvar raporu parser asistanısın. Verilen PDF/görüntü dosyalarındaki ` +
  `tetkik raporlarını inceleyip SADECE istenen lab değerlerini çıkarırsın. Açıklama yapmaz, ` +
  `markdown code block kullanmaz, sadece geçerli JSON döndürürsün.`;

/**
 * @param {Object} hasta — hasta objesi (id, tetkikler ayrıca state'ten çekilir)
 * @param {string[]} gerekenAlanlar — ['kreatinin', 'bilirubin', ...]
 * @returns {Promise<{ok:true, data, model, sonTarih} | {ok:false, kod, mesaj, raw?}>}
 */
export async function parseLabValues(hasta, gerekenAlanlar) {
  if (!hasta?.id) return _hata('no-hasta', 'Hasta bilgisi eksik');
  if (!gerekenAlanlar?.length) return _hata('no-alan', 'İstenecek lab alanı yok');

  // Hastanın tetkiklerini state'ten çek
  const tumTetkikler = Object.values(getState('tetkikler') || {})
    .filter(t => t.hastaId === hasta.id);

  if (tumTetkikler.length === 0) {
    return _hata('no-tetkik', 'Bu hastada tetkik kaydı yok — manuel girin');
  }

  // Son MAX_TETKIK tetkik (tarihe göre)
  const son = [...tumTetkikler]
    .sort((a, b) => (b.tarih || '').localeCompare(a.tarih || ''))
    .slice(0, MAX_TETKIK);
  const ids = son.map(t => t.id);
  const sonTarih = son[0]?.tarih || '';

  // PDF/görüntü dosyalarını base64'le indir
  let dosyalar;
  try {
    dosyalar = await gatherTetkikDosyalari(tumTetkikler, ids);
  } catch (e) {
    return _hata('dosya-hata', `Dosya yüklenemedi: ${e.message}`);
  }

  if (dosyalar.length === 0) {
    return _hata('no-dosya', 'Son tetkiklerde PDF/görüntü dosyası yok — manuel girin');
  }

  // AI mesajı: hangi alanları istiyoruz + JSON şeması
  const alanListesi = gerekenAlanlar
    .map(a => `- ${a}: ${ALAN_KARSILIGI[a] || a}`)
    .join('\n');

  const sema = gerekenAlanlar
    .map(a => `  "${a}": { "deger": <sayı veya null>, "birim": "<birim veya null>", "tarih": "<YYYY-MM-DD veya null>" }`)
    .join(',\n');

  const soru =
    `Aşağıdaki tetkik dosyalarını incele ve şu lab değerlerini çıkar:\n\n${alanListesi}\n\n` +
    `KESIN JSON formatında yanıt ver. Markdown code block KULLANMA, açıklama YAPMA:\n\n` +
    `{\n${sema}\n}\n\n` +
    `KURALLAR:\n` +
    `- Değer bulunamadıysa: { "deger": null, "birim": null, "tarih": null }\n` +
    `- Birden fazla tarih varsa EN GÜNCEL olanı kullan\n` +
    `- Sodyum mEq/L veya mmol/L olabilir (rakamsal aynı), birimi olduğu gibi yaz\n` +
    `- Sayısal değer "<1" gibi yazma; tam sayı veya ondalıklı yaz\n` +
    `- BUN ve üre AYRI alanlardır: BUN mg/dL, üre mmol/L. Türk lablarında "Üre" başlığı altında mg/dL veriliyorsa onu BUN olarak yorumla\n` +
    `- INR birimsizdir; "birim" alanını "" bırak\n` +
    `- Sadece JSON yanıt ver, başında/sonunda metin OLMASIN`;

  // Content blocks: önce dosyalar, sonra soru
  const contentBlocks = dosyalar.map(d => ({
    type: d.kind,
    source: { type: 'base64', media_type: d.mediaType, data: d.data }
  }));
  contentBlocks.push({ type: 'text', text: soru });

  const body = {
    model:      PARSER_MODEL,
    max_tokens: 1024,
    system:     SYSTEM_PROMPT,
    messages:   [{ role: 'user', content: contentBlocks }]
  };

  let response;
  try {
    response = await fetch(WORKER_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body)
    });
  } catch (e) {
    return _hata('network', `Ağ hatası: ${e.message}`);
  }

  if (!response.ok) {
    const t = await response.text().catch(() => '');
    return _hata('api', `API ${response.status}: ${t.slice(0, 200)}`);
  }

  let payload;
  try {
    payload = await response.json();
  } catch (e) {
    return _hata('api-parse', 'API yanıtı parse edilemedi');
  }

  if (payload?.error) {
    return _hata('api-error', payload.error.message || 'API hatası');
  }

  // Anthropic API yanıtı: { content: [{ type:'text', text:'...' }], ... }
  const rawText = payload?.content?.find(c => c.type === 'text')?.text || '';
  if (!rawText) return _hata('bos-yanit', 'AI boş yanıt döndü');

  let data;
  try {
    data = _extractJson(rawText);
  } catch (e) {
    console.error('[labParser] JSON parse edilemedi:', rawText);
    return _hata('parse', 'AI yanıtı anlaşılamadı', rawText);
  }

  return {
    ok: true,
    data,
    model: payload?.model || PARSER_MODEL,
    sonTarih,
    dosyaSayisi: dosyalar.length
  };
}

/**
 * Lab değeri makul aralık içinde mi?
 * @returns {{gecerli, uyari}} — gecerli=false eğer null/NaN; uyari=string eğer sınır dışı
 */
export function labDegerKontrol(alan, deger) {
  if (deger === null || deger === undefined || Number.isNaN(+deger)) {
    return { gecerli: false, uyari: null };
  }
  const d = +deger;
  const s = SINIRLAR[alan];
  if (!s) return { gecerli: true, uyari: null };
  if (d < s.min || d > s.max) {
    const birimTxt = s.birim ? ` ${s.birim}` : '';
    return { gecerli: true, uyari: `⚠️ Beklenmedik ${alan} değeri: ${d}${birimTxt} (normal ~${s.min}-${s.max})` };
  }
  return { gecerli: true, uyari: null };
}

// --- Helpers ---

function _hata(kod, mesaj, raw) {
  return { ok: false, kod, mesaj, raw };
}

function _extractJson(text) {
  // ```json ... ``` veya ``` ... ``` bloklarını temizle
  let t = text.replace(/```json\s*/gi, '').replace(/```/g, '').trim();
  // İlk { ile son } arası
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('JSON sınırları bulunamadı');
  }
  return JSON.parse(t.slice(start, end + 1));
}
