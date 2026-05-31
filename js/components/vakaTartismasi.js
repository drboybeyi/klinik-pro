// Vaka Tartışması — interaktif AI sohbet (v0.5.2 Sprint 6A → 6C)
//
// 6A: tek-turn, RTDB yok. 6C: hasta bağlamı (system prompt + ilk turn dosyalar).
// Çok-turn mantığı 6A'daki gibi (her gönderim tek user turn) — 6B'de genişleyecek.
// Mevcut konsültasyon (aiSorgu.js) akışına DOKUNULMAZ — ayrı modül.

import { streamMessages } from '../utils/aiStream.js';
import { showToast } from './toast.js';
import { getState } from '../state.js';
import { formatTarih } from '../labDefteri/labDefteriHelper.js';
import { gatherTetkikDosyalari } from '../utils/aiDosya.js';

const TETKIK_TUR_LBL = {
  kan: 'Kan', idrar: 'İdrar', usg: 'USG', mr: 'MR', bt: 'BT',
  rontgen: 'Röntgen', ekg: 'EKG', echo: 'Eko', endoskopi: 'Endoskopi',
  kolonoskopi: 'Kolonoskopi', patoloji: 'Patoloji', diger: 'Diğer'
};

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
let _mesajlar = [];               // [{ role:'user'|'assistant', content, streaming? }]
let _streaming = false;
let _abortController = null;
let _renderPending = false;
let _hastaId = null;              // hasta detaydan açıldıysa dolu; dashboard'dan null
let _ilkTurnDosyaGonderildi = false; // dosyalar yalnız ilk turn'de eklenir

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

// Hasta bağlam metni (system prompt'a eklenir). Hasta yoksa '' (genel sohbet).
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

// --- Render ---

export function renderTartismaPanel(hastaId) {
  _hastaId = hastaId || null;
  const hasta = _hasta(_hastaId);
  const rozet = hasta
    ? `<div class="tartisma-baglam-rozet tartisma-baglam-yuklu">📋 ${_esc(hasta.ad || 'Hasta')} bağlamı yüklü</div>`
    : `<div class="tartisma-baglam-rozet tartisma-baglam-genel">💬 Genel tıbbi tartışma</div>`;

  return `
    <div class="view-container tartisma-panel">
      ${rozet}
      <div class="tartisma-mesajlar" id="tartismaMesajlar">${_renderMesajlar()}</div>

      <div class="tartisma-input-bar">
        <textarea id="tartismaInput" class="form-control tartisma-input"
                  rows="2" placeholder="Vaka hakkında soru yaz… (örn. KOAH alevlenmesinde antibiyotik seçimi?)"></textarea>
        <button class="btn btn-primary tartisma-gonder" id="tartismaGonderBtn" type="button">
          <span id="tartismaGonderLabel">Gönder</span>
        </button>
      </div>
      <div class="tartisma-not">🌐 Web search açık · ${'Sonnet 4.5'} · 6A: tek soru-yanıt (sohbet geçmişi 6B'de)</div>
    </div>
  `;
}

function _renderMesajlar() {
  if (!_mesajlar.length) {
    return `
      <div class="tartisma-bos">
        <div class="tartisma-bos-icon">💬</div>
        <div class="tartisma-bos-baslik">Vaka Tartışması</div>
        <div class="tartisma-bos-sub">Bir tıbbi soru yazıp gönder — AI kanıta dayalı yanıt versin.</div>
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

export function attachTartismaListeners() {
  const btn = document.getElementById('tartismaGonderBtn');
  btn?.addEventListener('click', () => {
    if (_streaming) _stop();
    else _gonder();
  });

  const ta = document.getElementById('tartismaInput');
  ta?.addEventListener('keydown', e => {
    // Enter = gönder, Shift+Enter = yeni satır
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!_streaming) _gonder();
    }
  });
}

// --- Gönder / Stream ---

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

async function _gonder() {
  const ta = document.getElementById('tartismaInput');
  const soru = (ta?.value || '').trim();
  if (!soru) { showToast('Soru boş olamaz', 'error'); return; }

  // Kullanıcı balonu + boş asistan balonu (canlı dolacak)
  _mesajlar.push({ role: 'user', content: soru });
  const asistan = { role: 'assistant', content: '', streaming: true };
  _mesajlar.push(asistan);
  if (ta) ta.value = '';

  _streaming = true;
  _abortController = new AbortController();
  _setButton(true);
  _refreshMesajlar(true);

  // 6C: hasta bağlamı → system prompt; tetkik dosyaları → yalnız ilk turn
  const system = SYSTEM_PROMPT + _buildHastaContext(_hastaId);

  let content = soru; // string (dosyasız)
  if (_hastaId && !_ilkTurnDosyaGonderildi) {
    try {
      const tetkikler = _items('tetkikler', _hastaId);
      const dosyalar = await gatherTetkikDosyalari(tetkikler, null); // auto: son 5, resize dahil
      if (dosyalar.length) {
        content = [
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

  // Çok-turn değil (6A mantığı) — yalnız bu soru gönderilir
  try {
    await streamMessages({
      model:    MODEL,
      system,
      messages: [{ role: 'user', content }],
      tools:    [{ type: 'web_search_20250305', name: 'web_search', max_uses: 5 }],
      signal:   _abortController.signal,
      onChunk: (_chunk, full) => {
        asistan.content = full;
        _scheduleRender();
      },
      onDone: ({ text, aborted }) => {
        asistan.content = text || asistan.content || (aborted ? '_(yarıda kesildi)_' : '');
        asistan.streaming = false;
        _streaming = false;
        _abortController = null;
        _setButton(false);
        _refreshMesajlar(true);
      },
      onError: (err) => {
        asistan.content = `⚠️ Hata: ${err.message || err}`;
        asistan.streaming = false;
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
  _streaming = false;
  _abortController = null;
  _renderPending = false;
  _hastaId = null;
  _ilkTurnDosyaGonderildi = false;
}
