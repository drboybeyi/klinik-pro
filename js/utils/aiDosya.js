// AI sorgusuna eklenecek tetkik dosyalarını Cloudflare Worker proxy üzerinden base64'e çevirir.
// Önceki yaklaşımlar (SDK getBytes / direct fetch) CORS engeline takıldı — Worker proxy CORS-immune.
//
// Worker route: POST https://muddy-cherry-1712.drahmetboyoglu.workers.dev/storage-proxy
//   Body:     { url }
//   Response: { base64, mediaType, size }

const STORAGE_PROXY_URL = 'https://muddy-cherry-1712.drahmetboyoglu.workers.dev/storage-proxy';

const MAX_PDF_MB   = 32;   // Anthropic limit'i
const MAX_IMAGE_MB = 20;   // resize öncesi güvenlik üst sınırı (gönderim öncesi canvas ile küçültülür)
const MAX_BYTES_PDF   = MAX_PDF_MB   * 1024 * 1024;
const MAX_BYTES_IMAGE = MAX_IMAGE_MB * 1024 * 1024;

// Görüntü gönderim öncesi yeniden boyutlandırma (Anthropic önerisi)
const IMG_MAX_EDGE    = 1568;  // uzun kenar px
const IMG_JPEG_KALITE = 0.85;

const AUTO_LIMIT = 5; // Default'ta son N tetkik dahil

/**
 * dosya.tip / dosya.ad'dan content blok tipini ve mediaType'ı çıkar.
 * Desteklenmiyorsa null döner.
 */
export function getMediaType(dosya) {
  const tip = (dosya?.tip || '').toLowerCase();
  if (tip.includes('pdf'))                       return { kind: 'document', mediaType: 'application/pdf' };
  if (tip.includes('jpeg') || tip.includes('jpg')) return { kind: 'image',    mediaType: 'image/jpeg' };
  if (tip.includes('png'))                       return { kind: 'image',    mediaType: 'image/png' };
  if (tip.includes('webp'))                      return { kind: 'image',    mediaType: 'image/webp' };

  const ad = (dosya?.ad || '').toLowerCase();
  if (ad.endsWith('.pdf'))                                       return { kind: 'document', mediaType: 'application/pdf' };
  if (ad.endsWith('.jpg')  || ad.endsWith('.jpeg'))              return { kind: 'image',    mediaType: 'image/jpeg' };
  if (ad.endsWith('.png'))                                       return { kind: 'image',    mediaType: 'image/png' };
  if (ad.endsWith('.webp'))                                      return { kind: 'image',    mediaType: 'image/webp' };

  return null;
}

/**
 * Worker /storage-proxy üzerinden dosya base64'ünü al.
 * Body { url } → Response { base64, mediaType, size }
 * Hata varsa null + console.warn.
 */
async function _fetchDosyaBase64(dosya) {
  if (!dosya?.url) {
    console.error('[fetchAsBase64] url yok, atlanıyor:', dosya?.ad);
    return null;
  }
  try {
    const r = await fetch(STORAGE_PROXY_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ url: dosya.url })
    });
    if (!r.ok) {
      const t = await r.text().catch(() => '');
      console.error('[fetchAsBase64] Worker HTTP error:', r.status, t.slice(0, 200));
      return null;
    }
    const data = await r.json();
    if (!data?.base64) {
      console.error('[fetchAsBase64] Worker yanıtı base64 içermiyor:', data);
      return null;
    }
    return data.base64;
  } catch (e) {
    console.error('[fetchAsBase64] Worker proxy HATA:', dosya?.ad, e?.message);
    return null;
  }
}

/**
 * Görüntü base64'ünü canvas ile küçültüp JPEG'e çevirir.
 * Uzun kenar IMG_MAX_EDGE'i aşmıyorsa yine de JPEG'e re-encode edilir (boyut düşer).
 * Hata olursa orijinal base64 + mediaType döner (best-effort).
 * @returns {Promise<{data, mediaType}>}
 */
function _resizeImageBase64(base64, mediaType) {
  return new Promise((resolve) => {
    try {
      const img = new Image();
      img.onload = () => {
        try {
          const { width, height } = img;
          if (!width || !height) return resolve({ data: base64, mediaType });
          const uzun  = Math.max(width, height);
          const scale = uzun > IMG_MAX_EDGE ? IMG_MAX_EDGE / uzun : 1;
          const w = Math.round(width * scale);
          const h = Math.round(height * scale);

          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          // PNG şeffaflığı JPEG'de siyah olmasın → beyaz zemin
          ctx.fillStyle = '#fff';
          ctx.fillRect(0, 0, w, h);
          ctx.drawImage(img, 0, 0, w, h);

          const dataUrl = canvas.toDataURL('image/jpeg', IMG_JPEG_KALITE);
          const out = dataUrl.split(',')[1];
          if (!out) return resolve({ data: base64, mediaType });
          resolve({ data: out, mediaType: 'image/jpeg' });
        } catch (e) {
          console.warn('[resizeImage] canvas hatası, orijinal gönderiliyor:', e?.message);
          resolve({ data: base64, mediaType });
        }
      };
      img.onerror = () => resolve({ data: base64, mediaType });
      img.src = `data:${mediaType};base64,${base64}`;
    } catch {
      resolve({ data: base64, mediaType });
    }
  });
}

// Tetkikleri tarihe göre (yeni → eski) sırala
function _sortedByDate(tetkikler) {
  return [...(tetkikler || [])].sort((a, b) => new Date(b.tarih) - new Date(a.tarih));
}

// Auto seçim: son AUTO_LIMIT tetkiğin id'leri
function _autoIds(tetkikler) {
  return _sortedByDate(tetkikler).slice(0, AUTO_LIMIT).map(t => t.id);
}

// Dahil edilecek tetkikleri çöz: secilenTetkikIdleri null/undefined ise auto (son N), array ise filtrele
function _resolveDahilTetkikler(tetkikler, secilenTetkikIdleri) {
  const sorted = _sortedByDate(tetkikler);
  if (secilenTetkikIdleri == null) return sorted.slice(0, AUTO_LIMIT);
  const idSet = new Set(secilenTetkikIdleri);
  return sorted.filter(t => idSet.has(t.id));
}

/**
 * Bir tetkikin dosyalarını sayar (geçerli, boyut limiti içinde).
 */
function _tetkikDosyaSayisi(tetkik) {
  let pdf = 0, img = 0;
  for (const d of (tetkik.dosyalar || [])) {
    const mi = getMediaType(d);
    if (!mi) continue;
    const maxBytes = mi.kind === 'document' ? MAX_BYTES_PDF : MAX_BYTES_IMAGE;
    if (d.boyut && d.boyut > maxBytes) continue;
    if (mi.kind === 'document') pdf++;
    else img++;
  }
  return { pdf, img };
}

/**
 * UI önizleme için — fetch YAPMADAN sadece tipleri ve sayıları döner.
 * secilenTetkikIdleri verilmezse son AUTO_LIMIT tetkik baz alınır.
 */
export function gatherTetkikDosyaMetadata(tetkikler, secilenTetkikIdleri) {
  if (!tetkikler?.length) return { pdfCount: 0, imageCount: 0, atlananBoyut: 0, atlananDesteklenmeyen: 0 };

  const dahil = _resolveDahilTetkikler(tetkikler, secilenTetkikIdleri);

  let pdfCount = 0;
  let imageCount = 0;
  let atlananBoyut = 0;
  let atlananDesteklenmeyen = 0;

  for (const t of dahil) {
    for (const d of (t.dosyalar || [])) {
      const mi = getMediaType(d);
      if (!mi) { atlananDesteklenmeyen++; continue; }
      const maxBytes = mi.kind === 'document' ? MAX_BYTES_PDF : MAX_BYTES_IMAGE;
      if (d.boyut && d.boyut > maxBytes) { atlananBoyut++; continue; }
      if (mi.kind === 'document') pdfCount++;
      else imageCount++;
    }
  }

  return { pdfCount, imageCount, atlananBoyut, atlananDesteklenmeyen };
}

/**
 * UI hibrit seçim listesi için: tüm tetkikler için
 *   { id, baslik, tarih, tur, pdfCount, imageCount, toplamBoyut, autoSelected }
 * Liste tarihe göre yeni→eski sıralıdır. autoSelected = ilk AUTO_LIMIT içinde mi?
 */
export function gatherTetkikDosyaListMeta(tetkikler) {
  const sorted = _sortedByDate(tetkikler);
  const autoSet = new Set(_autoIds(tetkikler));
  return sorted.map(t => {
    const { pdf, img } = _tetkikDosyaSayisi(t);
    const toplamBoyut = (t.dosyalar || []).reduce((acc, d) => acc + (d.boyut || 0), 0);
    return {
      id: t.id,
      baslik: t.baslik || '',
      tarih: t.tarih || '',
      tur: t.tur || '',
      pdfCount: pdf,
      imageCount: img,
      toplamBoyut,
      autoSelected: autoSet.has(t.id)
    };
  });
}

/**
 * Default auto seçim (null geçildiğinde gather'ın seçeceği ID'ler).
 */
export function getDefaultSecilenIds(tetkikler) {
  return _autoIds(tetkikler);
}

/**
 * AI çağrısı için — verilen tetkiklerin desteklenen dosyalarını base64'le indirir.
 * @param {Array} tetkikler — Hastanın tüm tetkikleri (sıralanmamış olabilir)
 * @param {Array<string>|null} secilenTetkikIdleri — null ise auto (son AUTO_LIMIT), array ise yalnız o ID'ler
 * @returns [{ kind, mediaType, data, ad, tetkikId, tetkikTarih, tetkikBaslik, boyut }, ...]
 */
export async function gatherTetkikDosyalari(tetkikler, secilenTetkikIdleri) {
  if (!tetkikler?.length) return [];

  const dahil = _resolveDahilTetkikler(tetkikler, secilenTetkikIdleri);
  const out = [];

  for (const t of dahil) {
    if (!t.dosyalar?.length) continue;
    for (const d of t.dosyalar) {
      const mi = getMediaType(d);
      if (!mi) {
        console.warn('[gatherTetkikDosyalari] Desteklenmeyen format, atlanıyor:', d.ad);
        continue;
      }
      const maxBytes = mi.kind === 'document' ? MAX_BYTES_PDF : MAX_BYTES_IMAGE;
      if (d.boyut && d.boyut > maxBytes) {
        console.warn(`[gatherTetkikDosyalari] Boyut limiti aşıyor, atlanıyor: ${d.ad} (${(d.boyut/1024/1024).toFixed(1)} MB)`);
        continue;
      }
      try {
        const base64 = await _fetchDosyaBase64(d);
        if (!base64) continue;

        // Görüntüleri gönderim öncesi küçült (uzun kenar 1568px, JPEG q0.85)
        let data = base64;
        let mediaType = mi.mediaType;
        if (mi.kind === 'image') {
          const r = await _resizeImageBase64(base64, mi.mediaType);
          data = r.data;
          mediaType = r.mediaType;
        }

        out.push({
          kind:         mi.kind,
          mediaType,
          data,
          ad:           d.ad,
          tetkikId:     t.id,
          tetkikTarih:  t.tarih,
          tetkikBaslik: t.baslik,
          boyut:        d.boyut || 0
        });
      } catch (e) {
        console.error('[gatherTetkikDosyalari] HATA:', d.ad, e);
      }
    }
  }
  return out;
}
