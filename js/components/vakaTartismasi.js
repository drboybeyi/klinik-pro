// Vaka Tartışması — interaktif AI sohbet (v0.5.x Sprint 6A → 6C → 6B)
//
// 6A: tek mesaj + streaming. 6C: hasta bağlamı (system prompt + ilk turn dosyalar).
// 6B: RTDB kayıt (users/{uid}/tartismalar) + GERÇEK çok-turn (geçmiş AI'ya gider) + geçmiş UI.
// Mevcut konsültasyon (aiSorgu.js) akışına DOKUNULMAZ — ayrı modül.

import { streamMessages } from '../utils/aiStream.js';
import { showToast } from './toast.js';
import { getState } from '../state.js';
import { formatTarih } from '../labDefteri/labDefteriHelper.js';
import { gatherTetkikDosyalari } from '../utils/aiDosya.js';
import { createTartisma, addMesaj, getTartismalar, getTartisma } from './tartismaDb.js';

const MODEL = 'claude-sonnet-4-5-20250929';

const SYSTEM_PROMPT = `Sen 20+ yıllık deneyimli bir dahiliye uzmanısın. UpToDate, PubMed, ESC, ADA, KDIGO, GOLD, TİTCK kaynaklarına hakimsin ve bir klinisyen meslektaşınla vaka tartışıyorsun.

KURALLAR:
- Türkçe yanıt ver
- Kanıta dayalı, güncel kılavuz referanslı konuş (ESC 2024, KDIGO 2024, GOLD 2025 vb.)
- Doz/etkileşim sorularında ikinci kaynak doğrulamasını öner
- Belirsiz alanlarda dürüst ol ("kanıt yetersiz", "uzman konsültasyonu önerilir")
- Klinik kararın doktor sorumluluğunda olduğunu unutma (bilgi desteği veriyorsun)
- Web search açıksa ESC/AHA/KDIGO/ADA/GOLD/PubMed gibi kaynakları aktif ara ve yanıt sonuna 'Kaynaklar:' başlığıyla ekle`;

// --- Modül state ---
let _mesajlar = [];               // UI: [{ role, content:<text>, streaming? }]
let _apiMesajlar = [];            // API geçmişi: [{ role, content:<text|block[]> }] — çok-turn
let _streaming = false;
let _abortController = null;
let _renderPending = false;
let _hastaId = null;              // hasta detaydan açıldıysa dolu; dashboard'dan null
let _ilkTurnDosyaGonderildi = false; // dosyalar yalnız ilk turn'de eklenir
let _aktifTartismaId = null;      // RTDB tartışma id (yoksa ilk mesajda oluşur)
let _gecmisAcik = false;
let _kayitDurum = '';             // '✓ kaydedildi' göstergesi

// --- Markdown ---
function _renderMd(text) {
  if (window.marked?.parse) {
    try { return window.marked.parse(text || '', { breaks: true }); }
    catch { /* fallthrough */ }
  }
  return `<pre style="white-space:pre-wrap;font-family:inherit;margin:0">${_esc(text || '')}</pre>`;
}

function _esc(s) {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// --- Veri toplama (getState; aiSorgu.js'e dokunmadan) ---

function _items(col, hastaId) {
  return Object.values(getState(col) || {}).filter(i => i.hastaId === hastaId);
}

function _hasta(hastaId) {
  return (getState('hastalar') || {})[hastaId] || null;
}

// Lab Defteri'nden her parametrenin EN GÜNCEL ölçümü (olcumler yeni→eski sıralı)
function _labOzeti(hasta) {
  const params = hasta?.labDefteri?.parametreler;
  if (!params || !Object.keys(params).length) return '';
  const satirlar = [];
  for (const p of Object.values(params)) {
    const son = (p.olcumler || [])[0];
    if (!son || son.deger == null) continue;
    const birim = p.birim ? ` ${p.birim}` : '';
    const tarih = son.tarih ? ` (${formatTarih(son.tarih)})` : '';
    satirlar.push(`- ${p.isim || ''}: ${son.deger}${birim}${tarih}`);
  }
  return satirlar.join('\n');
}

// Hasta bağlam metni (system prompt'a eklenir). Hasta yoksa '' (genel sohbet). [6C — değişmedi]
function _buildHastaContext(hastaId) {
  const hasta = _hasta(hastaId);
  if (!hasta) return '';

  const cins = hasta.cinsiyet === 'E' ? 'E' : (hasta.cinsiyet === 'K' ? 'K' : '?');
  const bolumler = [`HASTA: ${hasta.ad || '?'}, ${hasta.yas || '?'}${cins}${hasta.mrn ? ` (MRN: ${hasta.mrn})` : ''}`];

  const tanilar = _items('tanilar', hastaId);
  if (tanilar.length) {
    bolumler.push('TANILAR:\n' + tanilar.map(t =>
      `- ${t.tanim}${t.icd ? ` (${t.icd})` : ''} [${t.seviye || 'izlem'}]`).join('\n'));
  }

  const ilaclar = _items('ilaclar', hastaId);
  if (ilaclar.length) {
    bolumler.push('İLAÇLAR:\n' + ilaclar.map(i => {
      const doz = i.doz ? ` ${i.doz}` : '';
      const sik = i.siklik ? ` ${i.siklik}` : '';
      const end = i.endikasyon ? ` — ${i.endikasyon}` : '';
      const dur = i.durum ? ` [${i.durum}]` : '';
      return `- ${i.ad}${doz}${sik}${end}${dur}`;
    }).join('\n'));
  }

  const alerjiler = _items('alerjiler', hastaId);
  if (alerjiler.length) {
    bolumler.push('ALERJİLER:\n' + alerjiler.map(a =>
      `- ${a.ajan}${a.reaksiyon ? ` (${a.reaksiyon})` : ''}`).join('\n'));
  }

  if (hasta.klinikOzet) bolumler.push(`KLİNİK ÖZET:\n${hasta.klinikOzet}`);

  const anamnez = [];
  if (hasta.sikayetler) anamnez.push(`Şikayetler: ${hasta.sikayetler}`);
  if (hasta.hikaye)     anamnez.push(`Hikaye: ${hasta.hikaye}`);
  if (hasta.ozgecmis)   anamnez.push(`Özgeçmiş: ${hasta.ozgecmis}`);
  if (hasta.fmBulgular) anamnez.push(`Fizik muayene: ${hasta.fmBulgular}`);
  if (anamnez.length) bolumler.push('ANAMNEZ:\n' + anamnez.join('\n'));

  const lab = _labOzeti(hasta);
  if (lab) bolumler.push('LAB DEFTERİ:\n' + lab);

  return `\n\nAşağıdaki hasta hakkında tartışacağız:\n\n${bolumler.join('\n\n')}\n\n` +
    `Sorular bu hasta bağlamında, hastanın tanı/ilaç/lab/görüntülerini dikkate alarak yanıtlanmalı. ` +
    `Eklenen tetkik PDF ve görüntülerini (varsa akciğer grafisi vb.) radyolojik/laboratuvar açıdan yorumla.`;
}

// İlk sorudan kısa başlık (~40 karakter)
function _baslikUret(soru) {
  const tek = (soru || '').replace(/\s+/g, ' ').trim();
  return tek.length > 40 ? tek.slice(0, 40) + '…' : (tek || 'Yeni tartışma');
}

// --- Render ---

export function renderTartismaPanel(hastaId) {
  _hastaId = hastaId || null;
  const hasta = _hasta(_hastaId);
  const rozet = hasta
    ? `<div class="tartisma-baglam-rozet tartisma-baglam-yuklu">📋 ${_esc(hasta.ad || 'Hasta')} bağlamı yüklü</div>`
    : `<div class="tartisma-baglam-rozet tartisma-baglam-genel">💬 Genel tıbbi tartışma</div>`;

  return `
    <div class="view-container tartisma-panel">
      <div class="tartisma-ust">
        ${rozet}
        <div class="tartisma-ust-aksiyon">
          <button class="link-btn" id="tartismaGecmisToggle" type="button">📜 Geçmiş</button>
          <button class="link-btn" id="tartismaYeniBtn" type="button">➕ Yeni</button>
        </div>
      </div>
      <div class="tartisma-gecmis-liste" id="tartismaGecmisListe" ${_gecmisAcik ? '' : 'hidden'}>
        ${_renderGecmisListe()}
      </div>

      <div class="tartisma-mesajlar" id="tartismaMesajlar">${_renderMesajlar()}</div>

      <div class="tartisma-input-bar">
        <textarea id="tartismaInput" class="form-control tartisma-input"
                  rows="2" placeholder="Vaka hakkında soru yaz… (örn. KOAH alevlenmesinde antibiyotik seçimi?)"></textarea>
        <button class="btn btn-primary tartisma-gonder" id="tartismaGonderBtn" type="button">
          <span id="tartismaGonderLabel">Gönder</span>
        </button>
      </div>
      <div class="tartisma-not">
        <span>🌐 Web search açık · Sonnet 4.5 · sohbet hafızalı (çok-turn)</span>
        <span class="tartisma-kayit-durum" id="tartismaKayitDurum">${_esc(_kayitDurum)}</span>
      </div>
    </div>
  `;
}

function _renderGecmisListe() {
  const list = getTartismalar(_hastaId);
  if (!list.length) {
    return `<div class="tartisma-gecmis-bos">Bu ${_hastaId ? 'hasta için' : 'kapsamda'} kayıtlı tartışma yok.</div>`;
  }
  return list.map(t => {
    const tarih = t.sonGuncelleme
      ? new Date(t.sonGuncelleme).toLocaleString('tr-TR',
          { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
      : '';
    const aktif = t.id === _aktifTartismaId ? ' tartisma-gecmis-aktif' : '';
    return `
      <button class="tartisma-gecmis-kart${aktif}" data-tartisma-id="${t.id}" type="button">
        <span class="tartisma-gecmis-baslik">${_esc(t.baslik || 'Tartışma')}</span>
        <span class="tartisma-gecmis-tarih">${tarih}</span>
      </button>
    `;
  }).join('');
}

function _renderMesajlar() {
  if (!_mesajlar.length) {
    return `
      <div class="tartisma-bos">
        <div class="tartisma-bos-icon">💬</div>
        <div class="tartisma-bos-baslik">Vaka Tartışması</div>
        <div class="tartisma-bos-sub">Bir tıbbi soru yazıp gönder — AI kanıta dayalı yanıt versin. Sohbet otomatik kaydedilir.</div>
      </div>
    `;
  }
  return _mesajlar.map(m => {
    if (m.role === 'user') {
      return `<div class="tartisma-balon tartisma-balon-user">${_esc(m.content)}</div>`;
    }
    const akan = m.streaming ? '<span class="tartisma-akan-dot"></span>' : '';
    return `<div class="tartisma-balon tartisma-balon-ai">
      <div class="markdown-body">${_renderMd(m.content)}</div>${akan}
    </div>`;
  }).join('');
}

// --- Listeners ---

export function attachTartismaListeners(hastaId) {
  if (hastaId !== undefined) _hastaId = hastaId || null;

  // Panel açılışında o hastanın SON tartışmasını auto-yükle (henüz aktif sohbet yoksa)
  if (!_aktifTartismaId && !_mesajlar.length) {
    const sonuncu = getTartismalar(_hastaId)[0];
    if (sonuncu) _loadTartisma(sonuncu.id);
  }

  document.getElementById('tartismaGonderBtn')?.addEventListener('click', () => {
    if (_streaming) _stop();
    else _gonder();
  });

  document.getElementById('tartismaInput')?.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!_streaming) _gonder();
    }
  });

  document.getElementById('tartismaGecmisToggle')?.addEventListener('click', () => {
    _gecmisAcik = !_gecmisAcik;
    _refreshGecmis();
  });

  document.getElementById('tartismaYeniBtn')?.addEventListener('click', () => _yeniTartisma());

  _attachGecmisKartListeners();
}

function _attachGecmisKartListeners() {
  document.querySelectorAll('[data-tartisma-id]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (_streaming) { showToast('Önce mevcut yanıtı bitirin veya durdurun', 'warning'); return; }
      _loadTartisma(btn.dataset.tartismaId);
      _gecmisAcik = false;
      _refreshGecmis();
    });
  });
}

// --- Geçmiş yükleme ---

function _loadTartisma(id) {
  const t = getTartisma(id);
  if (!t) return;
  _aktifTartismaId = id;
  _ilkTurnDosyaGonderildi = true; // yüklenen sohbette dosya yeniden gönderilmez (sadece metin geçmişi)
  _mesajlar = t.mesajlarDizi.map(m => ({ role: m.role, content: m.content }));
  _apiMesajlar = t.mesajlarDizi.map(m => ({ role: m.role, content: m.content }));
  _kayitDurum = '✓ kaydedildi';
  _refreshMesajlar(true);
  _refreshKayitDurum();
}

function _yeniTartisma() {
  if (_streaming) { showToast('Önce mevcut yanıtı bitirin veya durdurun', 'warning'); return; }
  _aktifTartismaId = null;
  _mesajlar = [];
  _apiMesajlar = [];
  _ilkTurnDosyaGonderildi = false;
  _kayitDurum = '';
  _gecmisAcik = false;
  _refreshMesajlar(false);
  _refreshGecmis();
  _refreshKayitDurum();
  document.getElementById('tartismaInput')?.focus();
}

// --- Gönder / Stream (çok-turn) ---

function _setButton(streaming) {
  const lbl = document.getElementById('tartismaGonderLabel');
  if (lbl) lbl.textContent = streaming ? '⏹ Durdur' : 'Gönder';
}

function _scheduleRender() {
  if (_renderPending) return;
  _renderPending = true;
  requestAnimationFrame(() => {
    _renderPending = false;
    _refreshMesajlar(true);
  });
}

function _refreshMesajlar(scroll) {
  const box = document.getElementById('tartismaMesajlar');
  if (!box) return;
  box.innerHTML = _renderMesajlar();
  if (scroll) box.scrollTop = box.scrollHeight;
}

function _refreshGecmis() {
  const liste = document.getElementById('tartismaGecmisListe');
  if (liste) {
    liste.hidden = !_gecmisAcik;
    liste.innerHTML = _renderGecmisListe();
    _attachGecmisKartListeners();
  }
  const toggle = document.getElementById('tartismaGecmisToggle');
  if (toggle) toggle.textContent = _gecmisAcik ? '📜 Geçmişi gizle' : '📜 Geçmiş';
}

function _refreshKayitDurum() {
  const el = document.getElementById('tartismaKayitDurum');
  if (el) el.textContent = _kayitDurum;
}

async function _gonder() {
  const ta = document.getElementById('tartismaInput');
  const soru = (ta?.value || '').trim();
  if (!soru) { showToast('Soru boş olamaz', 'error'); return; }

  // UI balonları
  _mesajlar.push({ role: 'user', content: soru });
  const asistan = { role: 'assistant', content: '', streaming: true };
  _mesajlar.push(asistan);
  if (ta) ta.value = '';

  _streaming = true;
  _abortController = new AbortController();
  _setButton(true);
  _refreshMesajlar(true);

  // RTDB: tartışma yoksa oluştur (ilk mesajda) + kullanıcı mesajını kaydet
  const hasta = _hasta(_hastaId);
  try {
    if (!_aktifTartismaId) {
      _aktifTartismaId = await createTartisma(_hastaId, hasta?.ad || null, _baslikUret(soru));
    }
    await addMesaj(_aktifTartismaId, 'user', soru);
    _kayitDurum = '✓ kaydedildi';
    _refreshKayitDurum();
    _refreshGecmis();
  } catch (e) {
    console.warn('[vakaTartismasi] RTDB kayıt hatası (sohbet devam eder):', e?.message);
  }

  // 6C: hasta bağlamı → system prompt (DEĞİŞMEDİ)
  const system = SYSTEM_PROMPT + _buildHastaContext(_hastaId);

  // Çok-turn: yeni user mesajını API geçmişine ekle. İlk turn + hasta varsa dosya blokları.
  let userContent = soru;
  if (_hastaId && !_ilkTurnDosyaGonderildi) {
    try {
      const tetkikler = _items('tetkikler', _hastaId);
      const dosyalar = await gatherTetkikDosyalari(tetkikler, null); // auto son 5, resize dahil
      if (dosyalar.length) {
        userContent = [
          ...dosyalar.map(d => ({
            type: d.kind,
            source: { type: 'base64', media_type: d.mediaType, data: d.data }
          })),
          { type: 'text', text: soru }
        ];
      }
    } catch (e) {
      console.warn('[vakaTartismasi] dosya toplama hatası, dosyasız gönderiliyor:', e?.message);
    }
    _ilkTurnDosyaGonderildi = true;
  }
  _apiMesajlar.push({ role: 'user', content: userContent });

  try {
    await streamMessages({
      model:    MODEL,
      system,
      messages: _apiMesajlar,   // TÜM geçmiş → AI önceki turn'leri hatırlar
      tools:    [{ type: 'web_search_20250305', name: 'web_search', max_uses: 5 }],
      signal:   _abortController.signal,
      onChunk: (_chunk, full) => {
        asistan.content = full;
        _scheduleRender();
      },
      onDone: async ({ text, aborted }) => {
        const yanit = text || asistan.content || (aborted ? '_(yarıda kesildi)_' : '');
        asistan.content = yanit;
        asistan.streaming = false;
        // API geçmişine asistan yanıtını ekle (sonraki turn hatırlasın)
        _apiMesajlar.push({ role: 'assistant', content: yanit });
        _streaming = false;
        _abortController = null;
        _setButton(false);
        _refreshMesajlar(true);
        // RTDB: asistan yanıtını kaydet
        if (_aktifTartismaId && yanit) {
          try {
            await addMesaj(_aktifTartismaId, 'assistant', yanit);
            _kayitDurum = '✓ kaydedildi';
            _refreshKayitDurum();
            _refreshGecmis();
          } catch (e) {
            console.warn('[vakaTartismasi] yanıt kaydı hatası:', e?.message);
          }
        }
      },
      onError: (err) => {
        asistan.content = `⚠️ Hata: ${err.message || err}`;
        asistan.streaming = false;
        // Başarısız user turn'ünü geçmişten çıkar (tutarlılık)
        if (_apiMesajlar[_apiMesajlar.length - 1]?.role === 'user') _apiMesajlar.pop();
        _streaming = false;
        _abortController = null;
        _setButton(false);
        _refreshMesajlar(true);
        showToast(`Hata: ${err.message || err}`, 'error');
      }
    });
  } catch (e) {
    asistan.content = `⚠️ Hata: ${e.message || e}`;
    asistan.streaming = false;
    if (_apiMesajlar[_apiMesajlar.length - 1]?.role === 'user') _apiMesajlar.pop();
    _streaming = false;
    _abortController = null;
    _setButton(false);
    _refreshMesajlar(true);
  }
}

function _stop() {
  if (_abortController) { try { _abortController.abort(); } catch {} }
}

// --- Reset ---

export function resetTartisma() {
  if (_abortController) { try { _abortController.abort(); } catch {} }
  _mesajlar = [];
  _apiMesajlar = [];
  _streaming = false;
  _abortController = null;
  _renderPending = false;
  _hastaId = null;
  _ilkTurnDosyaGonderildi = false;
  _aktifTartismaId = null;
  _gecmisAcik = false;
  _kayitDurum = '';
}

// db.js subscribe('tartismalar') → çoklu-cihaz senkronu için geçmiş listesini tazele
export function refreshTartismaGecmis() {
  if (document.getElementById('tartismaGecmisListe')) _refreshGecmis();
}
