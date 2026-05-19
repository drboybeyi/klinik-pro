# Klinik Pro

Türk klinisyenler için mobil-first, PWA tabanlı hasta takip ve karar destek sistemi.

## Özellikler (faz planı)

| Faz | İçerik | Durum |
|-----|--------|-------|
| v0.1-iskelet | PWA shell, design system, auth, 5-view routing | ✅ Tamamlandı |
| v0.2-hasta | Hasta CRUD, detay overlay, SOAP notları, tanı/ilaç/alerji, 3 seed hasta | ✅ Tamamlandı |
| v0.3-lab | 60+ parametre, referans aralık, 4-seviye flagger, trend grafik | 🔜 |
| v0.4-skor | 17 hesaplayıcı (CHA₂DS₂-VASc, CKD-EPI 2021, MELD-Na, Wells…) | 🔜 |
| v0.5-rehber | Decision tree motoru, HFrEF/KOAH/T2DM+KBH/FMF algoritmaları | 🔜 |
| v0.6-AI | Claude API + DDx asistanı + hasta özetleme + ilaç sorgu | 🔜 |
| v0.7-kaynak | PubMed/ESC/ADA/KDIGO kaynak otomasyonu | 🔜 |
| v0.8-ilac | RxNav + TİTCK etkileşim, renal/hepatik doz, gebelik kategorisi | 🔜 |

## v0.2-hasta — Neler Eklendi

**Hasta listesi (`#hastalar`)**
- Arama input — isim veya tanıya göre anlık filtreleme
- Hasta kartı: ad, yaş/cinsiyet/MRN, kritik tanı sayısı badge, ilaç sayısı badge
- Empty state + "Örnek Hastaları Yükle" butonu (3 gerçek klinik hasta — KVKK: baş harf)
- FAB (+) → Yeni Hasta modal

**Yeni Hasta / Düzenle formu**
- Ad Soyad, yaş, cinsiyet (btn-group), MRN, telefon, klinik özet
- Firebase'e anlık kayıt, realtime listener ile liste güncellenir

**Hasta Detay Overlay (sağdan slide-in)**
- Header: geri ← butonu, hasta adı, ⋯ menü (Düzenle / Sil)
- 3 top-tab: **Özet** / **Semptomlar** / **Notlar**
- **Özet sekmesi:**
  - Demografi grid (yaş/cinsiyet, MRN, telefon)
  - Klinik özet bandı (turuncu sol border)
  - Aktif Tanılar — seviye badge: `kritik` (kırmızı) / `izlem` (turuncu) / `stabil` (yeşil), ICD-10
  - İlaçlar — durum badge: `aktif` / `kesilecek` / `planlı`, doz · sıklık · endikasyon
  - Alerjiler — ajan + reaksiyon
  - Her listede + ekle, ✏️ düzenle, 🗑️ sil
- **Semptomlar sekmesi (v0.3.2.a):**
  - 5 kart: 📋 Başvuru Şikayetleri · 📖 Hikaye (HPI) · 📜 Özgeçmiş · 👪 Soygeçmiş · 🩺 Fizik Muayene
  - Boş kart: "Henüz girilmedi" + **Düzenle**
  - Dolu kart: ilk 200 karakter önizleme + **Tamamını Gör / Düzenle**
  - Tıklayınca tam ekran modal — büyük textarea + Kaydet/İptal
- **Notlar sekmesi:**
  - SOAP not listesi (yeni → eski)
  - S / O / A / P dört textarea, tarih + tip (vizit/telefon/lab)
  - Kart tıklanınca genişler (chevron animasyonu)

**Veri Modeli (Firebase RTDB)**
```
/users/{uid}/hastalar/{id}   — ad, yas, cinsiyet, mrn, telefon, klinikOzet
/users/{uid}/tanilar/{id}    — hastaId, tanim, seviye, icd
/users/{uid}/ilaclar/{id}    — hastaId, ad, doz, siklik, endikasyon, durum
/users/{uid}/alerjiler/{id}  — hastaId, ajan, reaksiyon
/users/{uid}/notlar/{id}     — hastaId, tarih, tip, S, O, A, P
```

**Seed hastaları (3/12 — kalan 9'u sonraki turda):**
- S.İ. 89E — HFrEF EF %25-30, 5 tanı, 4 ilaç (Entresto/Forxiga geçiş)
- E.T. 68E — KOAH akut alevlenme, 2 tanı, 3 ilaç
- Ş.S. 60K — Yükselen Kromogranin A / NET workup, 2 tanı

## Lokal Çalıştırma

ES module formatı nedeniyle `file://` ile açılamaz — HTTP server gereklidir.

```bash
# Python (önerilen)
python -m http.server 8080
# → http://localhost:8080

# Node.js
npx serve .
```

Firebase Console → Authentication → Sign-in method → Email/Password aktif olmalı.

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
