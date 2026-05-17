export class IlacView {
  render() {
    return `
      <div class="view-container">
        <div class="coming-soon">
          <div class="cs-icon">💊</div>
          <div class="cs-title">İlaç Modülü</div>
          <div class="cs-desc">
            İlaç etkileşim kontrolü (RxNav + TİTCK), renal/hepatik doz ayarı,
            gebelik kategorisi ve TİTCK onaylı endikasyon listesi bu fazda gelecek.
          </div>
          <span class="cs-version">v0.8-ilac</span>
        </div>
      </div>
    `;
  }

  afterRender() {}
}
