import { getState } from '../state.js';
import { bugun, formatTarih } from '../utils.js';
import { openSkorSecimModal } from '../components/skorSecimModal.js';
import { SKORLAR } from '../skor/index.js';

export class DashboardView {
  render() {
    const hastalar = getState('hastalar') || {};
    const count    = Object.keys(hastalar).length;

    return `
      <div class="view-container">
        <div class="metric-grid">
          <div class="metric-card">
            <div class="label">Toplam Hasta</div>
            <div class="value">${count}</div>
            <div class="sub">kayıtlı</div>
          </div>
          <div class="metric-card">
            <div class="label">Bugünkü Kontrol</div>
            <div class="value">—</div>
            <div class="sub">v0.2'de</div>
          </div>
          <div class="metric-card">
            <div class="label">Bekleyen Lab</div>
            <div class="value">—</div>
            <div class="sub">v0.3'te</div>
          </div>
          <div class="metric-card">
            <div class="label">Aktif Tedavi</div>
            <div class="value">—</div>
            <div class="sub">v0.2'de</div>
          </div>
        </div>

        <div class="card">
          <div class="section-header">
            <span class="section-title">Bugün</span>
            <span class="section-link" id="takvimeGit">Takvim →</span>
          </div>
          <div class="empty-state" style="padding:24px 0">
            <div class="empty-icon">📅</div>
            <div class="empty-title">Bugün randevu yok</div>
            <div class="empty-sub">Takvim modülü v0.2'de gelecek</div>
          </div>
        </div>

        <div class="card dashboard-skor-card" id="dashboardSkorCard">
          <div class="dashboard-skor-icon">🧮</div>
          <div class="dashboard-skor-body">
            <div class="dashboard-skor-baslik">Klinik Skor Hesaplayıcı</div>
            <div class="dashboard-skor-aciklama">${SKORLAR.length} skor · kardiyo, renal, hepato, enfeksiyon, VTE</div>
          </div>
          <div class="dashboard-skor-ok">→</div>
        </div>

        <div class="card">
          <div class="section-header">
            <span class="section-title">Son Hastalar</span>
            <span class="section-link" id="hastaListeGit">Tümü →</span>
          </div>
          ${count === 0
            ? `<div class="empty-state" style="padding:24px 0">
                 <div class="empty-icon">👤</div>
                 <div class="empty-title">Henüz hasta yok</div>
                 <div class="empty-sub">v0.2'de hasta ekleme gelecek</div>
               </div>`
            : this._renderHastaList(hastalar)
          }
        </div>
      </div>
    `;
  }

  _renderHastaList(hastalar) {
    return Object.values(hastalar)
      .sort((a, b) => (b.olusturmaTarih || '').localeCompare(a.olusturmaTarih || ''))
      .slice(0, 5)
      .map(h => `
        <div class="list-item">
          <div class="list-icon">👤</div>
          <div class="list-body">
            <div class="list-title">${h.ad || '—'}</div>
            <div class="list-sub">${h.tani || 'Tanı girilmemiş'}</div>
          </div>
        </div>
      `).join('');
  }

  afterRender() {
    document.getElementById('takvimeGit')?.addEventListener('click', () => {
      window.location.hash = '#takvim';
    });
    document.getElementById('hastaListeGit')?.addEventListener('click', () => {
      window.location.hash = '#hastalar';
    });
    document.getElementById('dashboardSkorCard')?.addEventListener('click', () => {
      openSkorSecimModal(null);
    });
  }
}
