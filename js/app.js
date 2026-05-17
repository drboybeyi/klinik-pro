import { onAuthChange, logoutUser } from './firebase-config.js';
import { setCurrentUser } from './db.js';
import { startListeners, stopListeners, initDefaultData } from './db.js';
import { showToast } from './components/toast.js';

import { LoginView    } from './views/login.js';
import { DashboardView} from './views/dashboard.js';
import { HastalarView } from './views/hastalar.js';
import { TakvimView   } from './views/takvim.js';
import { RehberlerView} from './views/rehberler.js';
import { IlacView     } from './views/ilac.js';

const VIEWS = {
  dashboard: DashboardView,
  hastalar:  HastalarView,
  takvim:    TakvimView,
  rehberler: RehberlerView,
  ilac:      IlacView
};

const NAV_ITEMS = [
  { key: 'dashboard', label: 'Özet',      icon: iconHome()    },
  { key: 'hastalar',  label: 'Hastalar',  icon: iconHasta()   },
  { key: 'takvim',    label: 'Takvim',    icon: iconTakvim()  },
  { key: 'rehberler', label: 'Rehberler', icon: iconRehber()  },
  { key: 'ilac',      label: 'İlaç',      icon: iconIlac()    }
];

let _currentView = 'dashboard';
let _authenticated = false;

// --- Auth ---

onAuthChange(async user => {
  if (user) {
    setCurrentUser(user.uid);
    await initDefaultData();
    startListeners();
    _authenticated = true;
    showAppUI();
    navigate(_currentView);
  } else {
    stopListeners();
    _authenticated = false;
    hideAppUI();
    renderLogin();
  }
});

// --- UI Show/Hide ---

function showAppUI() {
  document.querySelector('.header').style.display = 'flex';
  document.querySelector('.bottom-nav').style.display = 'flex';
  document.querySelector('.fab').style.display = 'flex';
}

function hideAppUI() {
  document.querySelector('.header').style.display = 'none';
  document.querySelector('.bottom-nav').style.display = 'none';
  document.querySelector('.fab').style.display = 'none';
}

// --- Login ---

function renderLogin() {
  const app  = document.getElementById('app');
  const view = new LoginView();
  app.innerHTML = view.render();
  view.afterRender();
}

// --- Router ---

export function navigate(viewKey) {
  const key = VIEWS[viewKey] ? viewKey : 'dashboard';
  _currentView = key;

  history.replaceState(null, '', `#${key}`);

  const ViewClass = VIEWS[key];
  const view      = new ViewClass();
  const app       = document.getElementById('app');

  app.innerHTML = `<div class="loading">Yükleniyor…</div>`;
  requestAnimationFrame(() => {
    app.innerHTML = view.render();
    view.afterRender?.();
    app.scrollTop = 0;
    window.scrollTo(0, 0);
    updateNav(key);
  });
}

function updateNav(activeKey) {
  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.view === activeKey);
  });
}

// --- Hash routing ---

window.addEventListener('hashchange', () => {
  if (!_authenticated) return;
  const hash = window.location.hash.replace('#', '') || 'dashboard';
  navigate(hash);
});

// --- Header date ---

function updateHeaderDate() {
  const el = document.getElementById('headerDate');
  if (!el) return;
  const now = new Date();
  const days = ['Pazar','Pazartesi','Salı','Çarşamba','Perşembe','Cuma','Cumartesi'];
  const months = ['Oca','Şub','Mar','Nis','May','Haz','Tem','Ağu','Eyl','Eki','Kas','Ara'];
  el.textContent = `${days[now.getDay()]}, ${now.getDate()} ${months[now.getMonth()]}`;
}

updateHeaderDate();

// --- FAB ---

document.getElementById('fabBtn').addEventListener('click', () => {
  showToast('v0.2\'de yeni hasta ekleme gelecek', 'info');
});

// --- Nav clicks ---

document.querySelectorAll('.nav-item').forEach(el => {
  el.addEventListener('click', () => {
    if (!_authenticated) return;
    navigate(el.dataset.view);
  });
});

// --- Build bottom nav HTML ---

(function buildNav() {
  const nav = document.querySelector('.bottom-nav');
  nav.innerHTML = NAV_ITEMS.map(item => `
    <div class="nav-item" data-view="${item.key}">
      ${item.icon}
      <span>${item.label}</span>
    </div>
  `).join('');

  nav.querySelectorAll('.nav-item').forEach(el => {
    el.addEventListener('click', () => {
      if (!_authenticated) return;
      navigate(el.dataset.view);
    });
  });
})();

// --- Service Worker ---

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./service-worker.js').catch(() => {});
}

// --- SVG Icons ---

function iconHome() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
    <polyline points="9 22 9 12 15 12 15 22"/>
  </svg>`;
}

function iconHasta() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
    <circle cx="12" cy="7" r="4"/>
  </svg>`;
}

function iconTakvim() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
    <line x1="16" y1="2" x2="16" y2="6"/>
    <line x1="8" y1="2" x2="8" y2="6"/>
    <line x1="3" y1="10" x2="21" y2="10"/>
  </svg>`;
}

function iconRehber() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
    <polyline points="14 2 14 8 20 8"/>
    <line x1="16" y1="13" x2="8" y2="13"/>
    <line x1="16" y1="17" x2="8" y2="17"/>
    <polyline points="10 9 9 9 8 9"/>
  </svg>`;
}

function iconIlac() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>
    <path d="M3.22 12H9.5l.5-1 2 4.5 2-7 1.5 3.5h5.27"/>
  </svg>`;
}
