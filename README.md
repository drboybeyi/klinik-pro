# Klinik Pro

Türk klinisyenler için mobil-first, PWA tabanlı hasta takip ve karar destek sistemi.

## Özellikler (faz planı)

| Faz | İçerik | Durum |
|-----|--------|-------|
| v0.1-iskelet | PWA shell, design system, auth, 5-view routing | ✅ Tamamlandı |
| v0.2-hasta | Hasta CRUD, SOAP notları, tanı/ilaç/alerji, 12 seed hasta | 🔜 |
| v0.3-lab | 60+ parametre, referans aralık, 4-seviye flagger, trend grafik | 🔜 |
| v0.4-skor | 17 hesaplayıcı (CHA₂DS₂-VASc, CKD-EPI 2021, MELD-Na, Wells…) | 🔜 |
| v0.5-rehber | Decision tree motoru, HFrEF/KOAH/T2DM+KBH/FMF algoritmaları | 🔜 |
| v0.6-AI | Claude API + DDx asistanı + hasta özetleme + ilaç sorgu | 🔜 |
| v0.7-kaynak | PubMed/ESC/ADA/KDIGO kaynak otomasyonu | 🔜 |
| v0.8-ilac | RxNav + TİTCK etkileşim, renal/hepatik doz, gebelik kategorisi | 🔜 |

## Lokal Çalıştırma

ES module formatı nedeniyle `file://` ile açılamaz — HTTP server gereklidir.

```bash
# Python (önerilen)
cd klinik-pro
python -m http.server 8080
# → http://localhost:8080

# Node.js
npx serve .
```

Firebase Authentication → Email/Password sign-in yönteminin Firebase Console'da aktif olduğundan emin olun.

## Teknoloji

- **Frontend:** Vanilla JS (ES modules), CSS custom properties
- **Backend:** Firebase Realtime Database + Firebase Auth (v10.13.2)
- **PWA:** Service Worker (network-first), Web App Manifest
- **Tasarım:** [Defter Pro](../smm-pro) görsel kimliği — sıcak bej palette

## Tasarım Sistemi

Defter Pro'nun CSS değişkenleri birebir korunmuştur:

```css
--bg-primary:   #f5ede0   /* Sıcak bej arka plan */
--accent:       #8b6f47   /* Header, FAB, primary buton */
--text-primary: #3d2817   /* Koyu kahve metin */
--success:      #5a7a3a   /* Normal/yeşil */
--danger:       #9a4a3a   /* Kritik/kırmızı */
--warning:      #c9923c   /* Uyarı/turuncu */
```

Klinik eklentiler (`--medical-green`, `--lab-critical`, `--lab-high`, `--lab-low`, `--lab-normal`) iç bileşenlerde kullanılır; PWA theme rengi Defter Pro ile aynıdır (`#8b6f47`).

## Klinik Sorumluluk Reddi

> **ÖNEMLİ:** Bu uygulama klinik karar desteği amaçlıdır; tıbbi tanı veya tedavi kararlarının yerini almaz. Her klinik öneri için güncel kılavuzları (UpToDate, ESC, AHA/ACC, ADA, KDIGO) ve yetkili kaynakları doğrulayın. İlaç dozları için UpToDate/Lexicomp/TİTCK'i ikinci kaynak olarak kullanın. Hasta verileri KVKK kapsamında işlenir.

## Lisans

Özel kullanım — tüm hakları saklıdır.
