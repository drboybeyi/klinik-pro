// AI sorgusuna eklenecek tetkik dosyalarını Cloudflare Worker proxy üzerinden base64'e çevirir.
// Önceki yaklaşımlar (SDK getBytes / direct fetch) CORS engeline takıldı — Worker proxy CORS-immune.
//
// Worker route: POST https://muddy-cherry-1712.drahmetboyoglu.workers.dev/storage-proxy
//   Body:     { url }
//   Response: { base64, mediaType, size }

const STORAGE_PROXY_URL = 'https://muddy-cherry-1712.drahmetboyoglu.workers.dev/storage-proxy';

const MAX_PDF_MB   = 32;   // Anthropic limit'i
const MAX_IMAGE_MB = 5;
const MAX_BYTES_PDF   = MAX_PDF_MB   * 1024 * 1024;
const MAX_BYTES_IMAGE = MAX_IMAGE_MB * 1024 * 1024;

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
  console.log('[fetchAsBase64] Başladı:', dosya?.ad, 'url:', dosya?.url?.substring(0, 80));

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
    console.log('[fetchAsBase64] Worker başarılı:', {
      ad: dosya.ad,
      size: data.size,
      mediaType: data.mediaType,
      base64Length: data.base64.length
    });
    return data.base64;
  } catch (e) {
    console.error('[fetchAsBase64] Worker proxy HATA:', dosya?.ad, e?.message, e);
    return null;
  }
}

/**
 * UI önizleme için — fetch YAPMADAN sadece tipleri ve sayıları döner.
 * (gerçek base64 indirme askAI çağrıldığında yapılır)
 */
export function gatherTetkikDosyaMetadata(tetkikler, maxTetkik = 5) {
  if (!tetkikler?.length) return { pdfCount: 0, imageCount: 0, atlananBoyut: 0, atlananDesteklenmeyen: 0 };

  const sorted = [...tetkikler]
    .sort((a, b) => new Date(b.tarih) - new Date(a.tarih))
    .slice(0, maxTetkik);

  let pdfCount = 0;
  let imageCount = 0;
  let atlananBoyut = 0;
  let atlananDesteklenmeyen = 0;

  for (const t of sorted) {
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
 * AI çağrısı için — son N tetkiğin desteklenen dosyalarını base64'le indirir.
 * Boyut limiti aşan veya desteklenmeyen formatlar sessizce atlanır (console.warn).
 *
 * @returns [{ kind: 'document'|'image', mediaType, data: base64, ad, tetkikTarih, tetkikBaslik }, ...]
 */
export async function gatherTetkikDosyalari(tetkikler, maxTetkik = 5) {
  console.log('[gatherTetkikDosyalari] Başladı', { tetkikSayisi: tetkikler?.length, maxTetkik });

  if (!tetkikler?.length) {
    console.log('[gatherTetkikDosyalari] Tetkik yok, boş array dönüyor');
    return [];
  }

  const sorted = [...tetkikler]
    .sort((a, b) => new Date(b.tarih) - new Date(a.tarih))
    .slice(0, maxTetkik);

  console.log('[gatherTetkikDosyalari] Sıralı tetkikler:', sorted.map(t => ({
    baslik:        t.baslik,
    tarih:         t.tarih,
    dosyaSayisi:   t.dosyalar?.length || 0,
    dosyaPathleri: (t.dosyalar || []).map(d => d.path || d.url?.substring(0, 80))
  })));

  const out = [];

  for (const t of sorted) {
    if (!t.dosyalar?.length) {
      console.log('[gatherTetkikDosyalari] Tetkikte dosya yok:', t.baslik);
      continue;
    }
    for (const d of t.dosyalar) {
      console.log('[gatherTetkikDosyalari] Dosya işleniyor:', d.ad, 'tip:', d.tip, 'boyut:', d.boyut);

      const mi = getMediaType(d);
      console.log('[gatherTetkikDosyalari] MediaInfo:', mi);
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
        console.log('[gatherTetkikDosyalari] Base64 sonucu:', base64 ? `${base64.length} chars` : 'NULL');

        if (!base64) {
          console.warn('[gatherTetkikDosyalari] Base64 boş, atlanıyor:', d.ad);
          continue;
        }

        out.push({
          kind:         mi.kind,
          mediaType:    mi.mediaType,
          data:         base64,
          ad:           d.ad,
          tetkikTarih:  t.tarih,
          tetkikBaslik: t.baslik
        });
        console.log('[gatherTetkikDosyalari] Dosya eklendi:', d.ad);
      } catch (e) {
        console.error('[gatherTetkikDosyalari] HATA:', d.ad, e);
      }
    }
  }

  console.log('[gatherTetkikDosyalari] Bitti, toplam:', out.length, 'dosya hazır');
  return out;
}
