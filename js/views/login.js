import { loginUser, registerUser } from '../firebase-config.js';

export class LoginView {
  constructor() {
    this._mode = 'login';
  }

  render() {
    return `
      <div class="login-screen">
        <div class="login-logo">🏥</div>
        <div class="login-title">Klinik Pro</div>
        <div class="login-sub">Hasta takip ve karar destek sistemi</div>

        <div class="login-card">
          <h2 id="loginHeading">Giriş Yap</h2>
          <div id="loginError" class="login-error" style="display:none"></div>

          <div class="form-group">
            <label class="form-label">E-posta</label>
            <input type="email" id="loginEmail" class="form-control" placeholder="doktor@klinik.com" autocomplete="email">
          </div>
          <div class="form-group">
            <label class="form-label">Şifre</label>
            <input type="password" id="loginPassword" class="form-control" placeholder="••••••••" autocomplete="current-password">
          </div>

          <button class="btn btn-primary btn-full" id="loginBtn">Giriş Yap</button>

          <div class="login-toggle">
            Hesabın yok mu?
            <a id="loginToggle">Kayıt ol</a>
          </div>
        </div>
      </div>
    `;
  }

  afterRender() {
    document.getElementById('loginToggle').addEventListener('click', () => this._toggle());
    document.getElementById('loginBtn').addEventListener('click', () => this._submit());
    document.getElementById('loginPassword').addEventListener('keydown', e => {
      if (e.key === 'Enter') this._submit();
    });
  }

  _toggle() {
    this._mode = this._mode === 'login' ? 'register' : 'login';
    const isLogin = this._mode === 'login';
    document.getElementById('loginHeading').textContent = isLogin ? 'Giriş Yap' : 'Kayıt Ol';
    document.getElementById('loginBtn').textContent = isLogin ? 'Giriş Yap' : 'Kayıt Ol';
    document.getElementById('loginToggle').textContent = isLogin ? 'Kayıt ol' : 'Giriş yap';
    document.querySelector('.login-toggle').childNodes[0].textContent =
      isLogin ? 'Hesabın yok mu? ' : 'Zaten hesabın var mı? ';
    this._showError('');
  }

  async _submit() {
    const email    = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    const btn      = document.getElementById('loginBtn');

    if (!email || !password) {
      this._showError('E-posta ve şifre gereklidir.');
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Lütfen bekle...';
    this._showError('');

    try {
      if (this._mode === 'login') {
        await loginUser(email, password);
      } else {
        await registerUser(email, password);
      }
    } catch (err) {
      btn.disabled = false;
      btn.textContent = this._mode === 'login' ? 'Giriş Yap' : 'Kayıt Ol';
      this._showError(this._parseError(err.code));
    }
  }

  _showError(msg) {
    const el = document.getElementById('loginError');
    if (msg) {
      el.textContent = msg;
      el.style.display = 'block';
    } else {
      el.style.display = 'none';
    }
  }

  _parseError(code) {
    const map = {
      'auth/user-not-found':      'Bu e-posta ile kayıtlı kullanıcı bulunamadı.',
      'auth/wrong-password':      'Şifre hatalı.',
      'auth/invalid-email':       'Geçersiz e-posta adresi.',
      'auth/email-already-in-use':'Bu e-posta zaten kullanımda.',
      'auth/weak-password':       'Şifre en az 6 karakter olmalı.',
      'auth/too-many-requests':   'Çok fazla hatalı giriş. Lütfen bekle.',
      'auth/invalid-credential':  'E-posta veya şifre hatalı.'
    };
    return map[code] || 'Bir hata oluştu. Tekrar dene.';
  }
}
