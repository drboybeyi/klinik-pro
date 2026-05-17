export class TakvimView {
  render() {
    return `
      <div class="view-container">
        <div class="coming-soon">
          <div class="cs-icon">📅</div>
          <div class="cs-title">Takvim</div>
          <div class="cs-desc">
            Kontrol tarihleri, lab tekrarları ve vade takibi
            bu fazda gelecek.
          </div>
          <span class="cs-version">v0.2-hasta</span>
        </div>
      </div>
    `;
  }

  afterRender() {}
}
