# Klinik Pro

Türk klinisyenler için mobil-first, PWA tabanlı hasta takip ve karar destek sistemi.

## Özellikler (faz planı)

| Faz | İçerik | Durum |
|-----|--------|-------|
| v0.1-iskelet | PWA shell, design system, auth, 5-view routing | ✅ Tamamlandı |
| v0.2-hasta | Hasta CRUD, detay overlay, SOAP notları, tanı/ilaç/alerji, 3 seed hasta | ✅ Tamamlandı |
| v0.3.2.a-semptom | Semptomlar sekmesi (5 kart, modal düzenleyici) | ✅ |
| v0.3.2.b-tetkik | Tetkikler sekmesi (jenerik metin) → v0.3.3'te koleksiyona göç etti | ✅ |
| v0.3.3-tetkik-kayit | Tetkik koleksiyonu + Firebase Storage dosya ekleri | ✅ |
| v0.3.4-AI | AI Konsültasyon sekmesi (5. tab) — Claude API, 6 şablon, markdown render | ✅ |
| v0.3.4.1-AI-iyilestirme | Web Search, PDF export, Markdown/Düz Metin kopyala, sil | ✅ |
| v0.3.4.2-pdf-fix | html2pdf container CSS düzeltmesi (opacity:0 + onclone callback) | ✅ |
| v0.3.4.3-print-dialog | html2pdf kaldırıldı, native print dialog'a geçildi (window.open + win.print) | ✅ |
| v0.3-lab-yapilandirilmis | 60+ parametre, referans aralık, 4-seviye flagger, trend grafik | 🔜 |
| v0.4-skor | 17 hesaplayıcı (CHA₂DS₂-VASc, CKD-EPI 2021, MELD-Na, Wells…) | 🔜 |
| v0.5-rehber | Decision tree motoru, HFrEF/KOAH/T2DM+KBH/FMF algoritmaları | 🔜 |
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
- 5 top-tab: **Özet** / **Semptomlar** / **Tetkikler** / **Notlar** / **AI**
- **Özet sekmesi:**
  - Demografi grid (yaş/cinsiyet, MRN, telefon)
  - Klinik özet bandı (turuncu sol border)
  - Aktif Tanılar — seviye badge: `kritik` (kırmızı) / `izlem` (turuncu) / `stabil` (yeşil), ICD-10
  - İlaçlar — durum badge: `aktif` / `kesilecek` / `planlı`, doz · sıklık · endikasyon
  - Alerjiler — ajan + reaksiyon
  - Her listede + ekle, ✏️ düzenle, 🗑️ sil
- **Semptomlar sekmesi (v0.3.2.a):**
  - 5 kart: 📋 Başvuru Şikayetleri · 📖 Hikaye (HPI) · 📜 Özgeçmiş · 👪 Soygeçmiş · 🩺 Fizik Muayene
  - Boş kart: "Henüz girilmedi" + **Düzenle**; doluda 200 karakter önizleme + **Tamamını Gör / Düzenle** → modal textarea
- **Tetkikler sekmesi (v0.3.3):**
  - Tetkik kayıtları koleksiyon listesi — tarih (yeni → eski), **kritikler en üstte**
  - Her tetkik: tarih + tür badge'i (🩸 kan, 🧫 idrar, 📡 USG, 🧲 MR, 🩻 BT, ☢️ röntgen, 💓 EKG, 💗 eko, 🔬 endoskopi/kolonoskopi, 🧬 patoloji, 📋 diğer)
  - Tıklayınca expand olur — özet metni + dosya ekleri
  - "+ Yeni Tetkik" → form modal: tür, tarih, başlık, özet, kritik flag, **dosya yükleme** (PDF/JPG/PNG/WEBP, max 10 MB, 5 dosya)
  - Dosyalar **Firebase Storage**'da saklanır; tetkik veya hasta silinince Storage dosyaları da silinir
- **Notlar sekmesi:**
  - SOAP not listesi (yeni → eski)
  - S / O / A / P dört textarea, tarih + tip (vizit/telefon/lab)
  - Kart tıklanınca genişler (chevron animasyonu)
- **AI sekmesi (v0.3.4 + v0.3.4.1):**
  - Cloudflare Worker proxy → Anthropic API (Claude)
  - Model seçimi: **Sonnet 4.5** (varsayılan) / **Opus 4.7** / **Haiku 4.5**
  - 🌐 **Web search** checkbox (default kapalı, açıkken canlı PubMed/ESC/ADA arar — `web_search_20250305` tool, max 5 arama, +$0.01/arama)
  - **6 şablon butonu:** 🩺 Ayırıcı Tanı · 🔬 Tetkik Öner · 💊 Tedavi Planı · 📊 Lab Yorumla · 📋 Panöneri (yatak başı) · 📚 Kılavuz Sorgula
  - Şablon tıklayınca textarea, hastanın tüm verisiyle (demografi, semptomlar, tetkikler, tanılar, ilaçlar, alerjiler) otomatik doldurulur
  - Yanıt: **marked.js** ile markdown render — başlıklar, listeler, kod blokları, kaynak linkleri
  - Metadata satırı: model • token (in+out) • web search sayısı • tahmini maliyet (USD)
  - Aksiyonlar: **📋 Markdown** (raw) · **📝 Düz Metin** (HTML stripped) · **📄 PDF İndir** (native print dialog: yeni sekme → Ctrl+P → "PDF olarak kaydet") · **💾 Kaydet**
  - **Önceki Konsültasyonlar** listesi: hasta bazlı, tarih sıralı, 🗑 sil ile tekil silme
  - Karta tıkla → modal: metadata + soru (uzunsa collapse/expand) + tam yanıt + 4 buton (MD/Metin/PDF/Sil)
  - PDF dosya adı: `KlinikPro_{hastaAd}_{YYYY-MM-DD}.pdf`

**Veri Modeli (Firebase RTDB)**
```
/users/{uid}/hastalar/{id}   — ad, yas, cinsiyet, mrn, telefon, klinikOzet,
                                sikayetler, hikaye, ozgecmis, soygecmis, fmBulgular
/users/{uid}/tanilar/{id}    — hastaId, tanim, seviye, icd
/users/{uid}/ilaclar/{id}    — hastaId, ad, doz, siklik, endikasyon, durum
/users/{uid}/alerjiler/{id}  — hastaId, ajan, reaksiyon
/users/{uid}/notlar/{id}     — hastaId, tarih, tip, S, O, A, P
/users/{uid}/tetkikler/{id}  — hastaId, tarih, tur, baslik, ozet, kritik,
                                dosyalar[{ad, url, path, boyut, tip, yuklemeTarihi}]
/users/{uid}/aiSorgulari/{id} — hastaId, model, apiModel, sablonAdi,
                                soru, yanit, inputTokens, outputTokens,
                                webSearchCount, tahminiMaliyet, olusturmaTarih
```

**Firebase Storage**
```
/users/{uid}/tetkikler/{hastaId}/{timestamp}-{filename}
```
Storage güvenlik kuralı: kullanıcı yalnızca kendi `users/{uid}/...` altındaki dosyalara erişebilir.

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
- **Backend:** Firebase Realtime Database + Firebase Auth (v10.13.2), Firebase Storage
- **AI:** Anthropic Claude API (Sonnet 4.5 / Opus 4.7 / Haiku 4.5) — Cloudflare Worker proxy + opsiyonel `web_search_20250305` tool
- **PWA:** Service Worker (network-first), Web App Manifest
- **Üçüncü taraf CDN:** marked.js (markdown render) — PDF export tarayıcının native print dialog'ı ile yapılır (ek kütüphane yok)
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
