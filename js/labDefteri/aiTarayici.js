// Lab Defteri — AI Tarayıcı (v0.5)
//
// Hastanın tetkik PDF/görüntülerini tek seferde Sonnet 4.5'e gönderip
// YAPILANDIRILMIŞ lab veri (tarih × parametre) çıkarır. Sonuç labDefteri formatına
// dönüştürülüp hasta kaydına yazılır (saveLabDefteri).
//
// Streaming endpoint kullanılır: çıktı büyük (çok parametre × çok tarih) ve
// tarama 30-60 sn sürebilir → onChunk ile ilerleme gösterilir. Stream bittiğinde
// biriken metinden JSON parse edilir.
//
// NOT: askAIStream (aiSorgu.js) private + dahiliye sistem promptunu sabitlediği için
// burada kendi streaming fetch'imizi yazıyoruz. gatherTetkikDosyalari paylaşılır.

import { STANDART_PARAMETRELER, KATEGORILER } from './parametreler.js';
import { gatherTetkikDosyalari, getMediaType } from '../utils/aiDosya.js';

const WORKER_STREAM_URL = 'https://muddy-cherry-1712.drahmetboyoglu.workers.dev/stream';
const PARSER_MODEL = 'claude-sonnet-4-5-20250929';

// Anthropic per-request 32 MB; 30 MB güvenli sınır (orijinal byte üzerinden)
const MAX_TOPLAM_BYTES = 30 * 1024 * 1024;
const MAX_BYTES_PDF    = 32 * 1024 * 1024;
const MAX_BYTES_IMAGE  =  5 * 1024 * 1024;

const SYSTEM_PROMPT =
  'Sen tıbbi laboratuvar raporu parser asistanısın. Verilen PDF/görüntü dosyalarındaki ' +
  'tetkik raporlarından TÜM sayısal lab değerlerini çıkarıp yapılandırılmış JSON döndürürsün. ' +
  'Açıklama yapmaz, markdown code block kullanmaz, sadece geçerli JSON üretirsin.';

/**
 * Bir tetkikin desteklenen + per-file sınır içi dosyalarının toplam boyutu.
 */
function _desteklenenBoyut(tetkik) {
  let toplam = 0;
  for (const d of (tetkik.dosyalar || [])) {
    const mi = getMediaType(d);
    if (!mi) continue;
    const max = mi.kind === 'document' ? MAX_BYTES_PDF : MAX_BYTES_IMAGE;
    if (d.boyut && d.boyut <= max) toplam += d.boyut;
  }
  return toplam;
}

/**
 * Tüm tetkikleri AI ile tarar, yapılandırılmış labDefteri döndürür.
 * @param {Object} hasta — { id, cinsiyet, ... }
 * @param {Array}  tetkikler — hastanın tetkikleri (ayrı koleksiyondan filtrelenmiş)
 * @param {Object} opts — { onChunk?(fullText), signal? }
 * @returns {Promise<{ok:true, labDefteri, meta} | {ok:false, kod, mesaj, raw?}>}
 */
export async function topluLabTara(hasta, tetkikler, { onChunk, signal } = {}) {
  if (!hasta?.id) return _hata('no-hasta', 'Hasta bilgisi eksik');

  // Desteklenen dosyası olan tetkikleri, en yeniden başlayarak 30 MB'a kadar seç
  const adaylar = (tetkikler || [])
    .map(t => ({ tetkik: t, boyut: _desteklenenBoyut(t) }))
    .filter(x => x.boyut > 0)
    .sort((a, b) => new Date(b.tetkik.tarih) - new Date(a.tetkik.tarih));

  if (adaylar.length === 0) {
    return _hata('no-dosya', 'Taranabilir PDF/görüntü dosyası olan tetkik bulunamadı');
  }

  let toplamBoyut = 0;
  const dahil = [];
  const atilan = [];
  for (const { tetkik, boyut } of adaylar) {
    if (toplamBoyut + boyut <= MAX_TOPLAM_BYTES) {
      dahil.push(tetkik);
      toplamBoyut += boyut;
    } else {
      atilan.push(tetkik);
    }
  }

  // Dosyaları base64'le indir (Worker proxy)
  let dosyalar;
  try {
    dosyalar = await gatherTetkikDosyalari(tetkikler, dahil.map(t => t.id));
  } catch (e) {
    return _hata('dosya-hata', `Dosyalar indirilemedi: ${e.message}`);
  }
  if (!dosyalar.length) {
    return _hata('no-dosya', 'Tetkik dosyaları indirilemedi');
  }

  // Tarih ipucu manifesti (rapor içinde tarih yoksa AI bunlardan seçer)
  const tarihManifest = dahil
    .map(t => `  - ${t.tarih || '?'} · ${t.baslik || 'tetkik'}`)
    .join('\n');

  const parametreListesi = Object.entries(STANDART_PARAMETRELER)
    .map(([key, p]) => `  "${key}": ${p.isim} (${p.birim || 'birimsiz'})`)
    .join('\n');

  const soru =
`Aşağıdaki ${dahil.length} tetkik dosyasını incele. HER dosyadaki TÜM sayısal lab değerlerini çıkar.

İSTENEN PARAMETRELER (key'leri TAM olarak bu şekilde kullan):
${parametreListesi}

Bu listede OLMAYAN ama bulduğun her sayısal lab değerini "diger" altına ekle
(örn: Anti-DFS70, Chromogranin A, anti-CCP, AFP, gastrin, B12, vit D, NSE...).

Bu hastada dahil edilen tetkiklerin tarihleri (rapor içinde tarih net değilse bunlardan uygun olanı seç):
${tarihManifest}

KESIN JSON formatı (markdown code block KULLANMA, açıklama YAPMA):

{
  "olcumler": [
    { "tarih": "2026-05-06", "degerler": { "kreatinin": 0.56, "BUN": 18, "sodyum": 142 } },
    { "tarih": "2026-04-14", "degerler": { "CRP": 111.6, "troponin": 17.6 } }
  ],
  "diger": [
    { "tarih": "2026-04-16", "isim": "Chromogranin A", "deger": 200, "birim": "µg/L" }
  ]
}

KURALLAR:
1. Her ölçümün tarihini raporun başlığından/içeriğinden al; YYYY-MM-DD formatında yaz.
2. Aynı tarihte birden çok parametre varsa hepsini tek "olcumler" girişinde topla.
3. Sayısal değerleri float yaz (1.15, 0.56) — string DEĞİL.
4. Mümkünse değeri parametrenin standart birimine çevir.
5. "<1", ">90" gibi limit değerlerde sayısal kısmı al (0.9 → 0.9, "<0.5" → 0.5).
6. Bir değeri hangi standart key'e koyacağından emin değilsen "diger" altına yaz.
7. SADECE JSON döndür.`;

  // Content blocks: dosyalar + soru
  const contentBlocks = dosyalar.map(d => ({
    type: d.kind,
    source: { type: 'base64', media_type: d.mediaType, data: d.data }
  }));
  contentBlocks.push({ type: 'text', text: soru });

  const body = {
    model:      PARSER_MODEL,
    max_tokens: 8192,
    system:     SYSTEM_PROMPT,
    messages:   [{ role: 'user', content: contentBlocks }]
  };

  // Streaming fetch
  let response;
  try {
    response = await fetch(WORKER_STREAM_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
      signal
    });
  } catch (e) {
    if (e.name === 'AbortError') return _hata('abort', 'Tarama iptal edildi');
    return _hata('network', `Ağ hatası: ${e.message}`);
  }

  if (!response.ok) {
    const t = await response.text().catch(() => '');
    return _hata('api', `API ${response.status}: ${t.slice(0, 200)}`);
  }

  // SSE parse — text delta'larını biriktir
  let fullText;
  try {
    fullText = await _streamMetni(response, onChunk, signal);
  } catch (e) {
    if (e.name === 'AbortError' || signal?.aborted) return _hata('abort', 'Tarama iptal edildi');
    return _hata('stream', `Yanıt okunamadı: ${e.message}`);
  }

  if (!fullText.trim()) return _hata('bos-yanit', 'AI boş yanıt döndü');

  let parsed;
  try {
    parsed = _extractJson(fullText);
  } catch (e) {
    console.error('[aiTarayici] JSON parse edilemedi:', fullText);
    return _hata('parse', 'AI yanıtı JSON olarak ayrıştırılamadı', fullText);
  }

  const labDefteri = donusturLabDefteri(parsed, hasta, dahil);
  const paramSayisi = Object.keys(labDefteri.parametreler).length;

  if (paramSayisi === 0) {
    return _hata('bos-defter', 'Taramada hiçbir lab değeri bulunamadı', fullText);
  }

  return {
    ok: true,
    labDefteri,
    meta: {
      taranansayi:  dahil.length,
      atilansayi:   atilan.length,
      paramSayisi,
      toplamBoyutMB: (toplamBoyut / 1024 / 1024).toFixed(1)
    }
  };
}

/**
 * Tek bir tetkiği tarar (yeni tetkik yüklendiğinde merge için).
 */
export async function tekTetkikTara(hasta, tetkik, opts = {}) {
  if (!tetkik) return _hata('no-tetkik', 'Tetkik bulunamadı');
  return topluLabTara(hasta, [tetkik], opts);
}

/**
 * AI çıktısını labDefteri yapısına dönüştürür.
 * kaynak: ölçümün tarihi ile eşleşen tetkikin id'si (yoksa null).
 */
export function donusturLabDefteri(parsed, hasta, tetkikler = []) {
  const defter = {
    parametreler:  {},
    sonGuncelleme: new Date().toISOString(),
    durum:         'tarandi'
  };

  // tarih → tetkikId eşlemesi (kaynak için)
  const tarihId = new Map();
  for (const t of tetkikler) {
    if (t.tarih && !tarihId.has(t.tarih)) tarihId.set(t.tarih, t.id);
  }
  const kaynakBul = tarih => (tarih && tarihId.get(tarih)) || null;

  // Standart parametreler
  for (const olcum of parsed?.olcumler || []) {
    const tarih = olcum?.tarih || null;
    for (const [paramKey, ham] of Object.entries(olcum?.degerler || {})) {
      const standart = STANDART_PARAMETRELER[paramKey];
      if (!standart) continue; // bilinmeyen key → atla
      const deger = _sayi(ham);
      if (deger == null) continue;

      if (!defter.parametreler[paramKey]) {
        defter.parametreler[paramKey] = {
          birim:    standart.birim,
          referans: standart.referans,
          kategori: standart.kategori,
          isim:     standart.isim,
          olcumler: []
        };
      }
      defter.parametreler[paramKey].olcumler.push({
        deger, tarih, kaynak: kaynakBul(tarih)
      });
    }
  }

  // Diğer (listede olmayan) parametreler
  const digerOlcumler = [];
  for (const d of parsed?.diger || []) {
    const deger = _sayi(d?.deger);
    if (deger == null || !d?.isim) continue;
    digerOlcumler.push({
      isim:   d.isim,
      deger,
      birim:  d.birim || '',
      tarih:  d.tarih || null,
      kaynak: kaynakBul(d.tarih)
    });
  }
  if (digerOlcumler.length) {
    defter.parametreler._diger = {
      kategori: 'diger',
      isim:     KATEGORILER.diger.isim,
      olcumler: digerOlcumler.sort((a, b) => new Date(b.tarih) - new Date(a.tarih))
    };
  }

  // Her parametrenin ölçümlerini yeni → eski sırala
  for (const param of Object.values(defter.parametreler)) {
    if (param.olcumler) {
      param.olcumler.sort((a, b) => new Date(b.tarih) - new Date(a.tarih));
    }
  }

  return defter;
}

// --- Streaming yardımcısı (Anthropic SSE) ---

async function _streamMetni(response, onChunk, signal) {
  const reader  = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullText = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (signal?.aborted) { try { reader.cancel(); } catch {} const err = new Error('aborted'); err.name = 'AbortError'; throw err; }

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
        onChunk?.(fullText);
      }
    }
  }
  return fullText;
}

// --- Helpers ---

function _hata(kod, mesaj, raw) {
  return { ok: false, kod, mesaj, raw };
}

// "<0.5", "1,15", ">90" gibi değerlerden float çıkarır; çıkaramazsa null
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
  const end   = t.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('JSON sınırları bulunamadı');
  }
  return JSON.parse(t.slice(start, end + 1));
}
