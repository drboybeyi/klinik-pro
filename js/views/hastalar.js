import { getState, subscribe } from '../state.js';
import { seedHastalar } from '../db.js';
import { openHastaDetay } from './hastaDetay.js';
import { showToast } from '../components/toast.js';

let _search  = '';
let _unsubs  = [];

export class HastalarView {
  render() {
    const toplamHasta = Object.keys(getState('hastalar') || {}).length;
    return `
      <div class="view-container">
        <div class="arama-kutusu-wrap">
          <span class="arama-icon">🔍</span>
          <input type="text" class="arama-input" id="hastaArama"
                 placeholder="İsim veya tanı ara…"
                 value="${_search}" autocomplete="off" spellcheck="false">
          ${_search ? `<button class="arama-temizle" id="aramaTmz">✕</button>` : ''}
        </div>
        ${toplamHasta > 0 ? `
          <div style="display:flex;justify-content:flex-end;margin:-4px 0 8px">
            <button id="seedUpdateBtn"
                    style="background:none;border:none;color:var(--text-secondary);font-size:12px;cursor:pointer;padding:4px 8px;text-decoration:underline">
              🔄 Örnekleri güncelle
            </button>
          </div>
        ` : ''}
        <div id="hastaListeWrap">${this._renderList()}</div>
      </div>
    `;
  }

  _renderList() {
    const hastalar = getState('hastalar') || {};
    const tanilar  = getState('tanilar')  || {};
    const ilaclar  = getState('ilaclar')  || {};

    const toplamHasta = Object.keys(hastalar).length;

    if (toplamHasta === 0) {
      return `
        <div class="empty-state">
          <div class="empty-icon">👤</div>
          <div class="empty-title">Henüz hasta yok</div>
          <div class="empty-sub">Sağ alttaki + butonu ile yeni hasta ekleyebilirsiniz.</div>
          <button class="btn btn-secondary" id="seedBtn" style="margin-top:20px">
            📋 Örnek Hastaları Yükle (12 hasta)
          </button>
        </div>
      `;
    }

    let list = Object.values(hastalar);

    if (_search) {
      const q = _search.toLowerCase();
      list = list.filter(h => {
        if (h.ad?.toLowerCase().includes(q)) return true;
        return Object.values(tanilar)
          .filter(t => t.hastaId === h.id)
          .some(t => t.tanim?.toLowerCase().includes(q));
      });
    }

    list.sort((a, b) => (b.olusturmaTarih || '').localeCompare(a.olusturmaTarih || ''));

    if (!list.length) {
      return `
        <div class="empty-state">
          <div class="empty-icon">🔍</div>
          <div class="empty-title">Sonuç yok</div>
          <div class="empty-sub">"${_search}" için eşleşen hasta bulunamadı</div>
        </div>
      `;
    }

    return list.map(h => {
      const hTanilar   = Object.values(tanilar).filter(t => t.hastaId === h.id);
      const hIlaclar   = Object.values(ilaclar).filter(i => i.hastaId === h.id);
      const kritikSayisi = hTanilar.filter(t => t.seviye === 'kritik').length;
      const initials   = (h.ad || '?').split(/[\s.]+/).filter(Boolean).map(s => s[0]).join('').slice(0,2).toUpperCase();

      return `
        <div class="hasta-kart" data-hasta-id="${h.id}">
          <div class="hasta-avatar">${initials}</div>
          <div class="hasta-kart-sol">
            <div class="hasta-ad">${h.ad}</div>
            <div class="hasta-demo">
              ${h.yas} yaş · ${h.cinsiyet === 'E' ? 'Erkek' : 'Kadın'}${h.mrn ? ` · ${h.mrn}` : ''}
            </div>
          </div>
          <div class="hasta-kart-sag">
            ${kritikSayisi > 0 ? `<span class="badge seviye-kritik">⚠ ${kritikSayisi} kritik</span>` : ''}
            ${hIlaclar.length > 0 ? `<span class="badge badge-medical">💊 ${hIlaclar.length}</span>` : ''}
          </div>
        </div>
      `;
    }).join('');
  }

  afterRender() {
    // Temizle önceki subscriptions
    _unsubs.forEach(fn => fn());
    _unsubs = [
      subscribe('hastalar', () => this._refresh()),
      subscribe('tanilar',  () => this._refresh()),
      subscribe('ilaclar',  () => this._refresh())
    ];

    const input = document.getElementById('hastaArama');
    input?.addEventListener('input', e => {
      _search = e.target.value;
      this._refresh();
    });

    this._attachCardAndSeed();
  }

  _refresh() {
    const wrap = document.getElementById('hastaListeWrap');
    if (!wrap) return;
    wrap.innerHTML = this._renderList();
    this._attachCardAndSeed();

    const tmz = document.getElementById('aramaTmz');
    tmz?.addEventListener('click', () => { _search = ''; this._refresh(); });
  }

  _attachCardAndSeed() {
    document.querySelectorAll('.hasta-kart[data-hasta-id]').forEach(el => {
      el.addEventListener('click', () => openHastaDetay(el.dataset.hastaId));
    });

    // Empty state'teki büyük "Örnek Hastaları Yükle" butonu
    const seedBtn = document.getElementById('seedBtn');
    if (seedBtn) {
      seedBtn.addEventListener('click', () =>
        this._runSeed(seedBtn, 'Yükleniyor…', '📋 Örnek Hastaları Yükle (12 hasta)'));
    }

    // Liste başlığındaki küçük "Örnekleri güncelle" linki (sadece >0 hasta varken)
    const seedUpdateBtn = document.getElementById('seedUpdateBtn');
    if (seedUpdateBtn) {
      seedUpdateBtn.addEventListener('click', () =>
        this._runSeed(seedUpdateBtn, '🔄 Güncelleniyor…', '🔄 Örnekleri güncelle'));
    }
  }

  async _runSeed(btn, loadingText, defaultText) {
    btn.disabled = true;
    btn.textContent = loadingText;
    try {
      const { eklenen, guncellenen, tetkikEklenen } = await seedHastalar();
      const parts = [];
      if (eklenen)       parts.push(`${eklenen} yeni hasta`);
      if (guncellenen)   parts.push(`${guncellenen} hasta güncellendi`);
      if (tetkikEklenen) parts.push(`${tetkikEklenen} tetkik eklendi`);
      const msg = parts.length ? parts.join(' · ') : 'Tüm hastalar zaten güncel';
      showToast(msg, 'success');
      btn.disabled = false;
      btn.textContent = defaultText;
    } catch (e) {
      console.error('Seed başarısız:', e);
      showToast('Yükleme başarısız', 'error');
      btn.disabled = false;
      btn.textContent = defaultText;
    }
  }
}
