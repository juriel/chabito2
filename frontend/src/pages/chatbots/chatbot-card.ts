import { LitElement, html } from 'lit';
import { type ChatbotSession } from '../../types.ts';

export class ChatbotCard extends LitElement {
  createRenderRoot() {
    return this;
  }

  static get properties() {
    return {
      session: { type: Object }
    };
  }

  declare public session: ChatbotSession;

  private handleQrImageLoad() {
    console.log('[Frontend] QR image loaded', { uuid: this.session.uuid });
  }

  private handleQrImageError() {
    console.error('[Frontend] QR image failed to load', { uuid: this.session.uuid });
  }

  private triggerRefresh() {
    this.dispatchEvent(new CustomEvent('refresh-session', {
      detail: { uuid: this.session.uuid },
      bubbles: true,
      composed: true
    }));
  }

  private triggerRegenerateQr() {
    this.dispatchEvent(new CustomEvent('regenerate-qr', {
      detail: { uuid: this.session.uuid },
      bubbles: true,
      composed: true
    }));
  }

  render() {
    if (!this.session) return html``;

    const status = this.session.status;
    const badgeClass = ['open', 'connecting', 'close', 'error'].includes(status) ? `badge-${status}` : '';
    const statusLabel: Record<string, string> = { open: 'Conectado', connecting: 'Conectando', close: 'Desconectado', error: 'Error' };
    const initial = (this.session.name || this.session.uuid).trim().charAt(0).toUpperCase();

    return html`
      <article class="card overflow-hidden">
        <div class="bot-card-head">
          <h3 class="bot-card-name">${this.session.uuid}</h3>
          <span class="badge ${badgeClass}">${statusLabel[status] ?? status}</span>
        </div>
        <div class="bot-card-body">
          <div class="bot-panel">
            ${status === 'open'
              ? html`<div class="grid justify-items-center gap-1">
                  <div class="avatar">
                    ${initial}
                    ${this.session.avatarUrl
                      ? html`<img src="${this.session.avatarUrl}" alt="Avatar de ${this.session.phoneNumber ?? this.session.uuid}"
                          @error=${(e: Event) => { (e.target as HTMLImageElement).style.display = 'none'; }} />`
                      : ''}
                  </div>
                  <p class="m-0 mt-3 text-lg font-bold">${this.session.name || 'Cuenta vinculada'}</p>
                  ${this.session.phoneNumber ? html`<p class="muted m-0">+${this.session.phoneNumber}</p>` : ''}
                </div>`
              : this.session.loading
              ? html`<span class="muted">Cargando QR...</span>`
              : this.session.qrUrl
              ? html`<img class="qr" src="${this.session.qrUrl}" alt="QR de ${this.session.uuid}" @load=${this.handleQrImageLoad} @error=${this.handleQrImageError} />`
              : html`<span class="muted">QR no disponible. Pulsa “Generar nuevo QR”.</span>`}
          </div>
          <div class="bot-actions">
            <button class="btn btn-primary" @click=${this.triggerRegenerateQr} ?disabled=${this.session.loading || status === 'open'}>Generar nuevo QR</button>
            <button class="btn btn-outline" @click=${this.triggerRefresh} ?disabled=${this.session.loading}>Actualizar estado</button>
          </div>
          ${this.session.error ? html`<p class="notice m-0">${this.session.error}</p>` : ''}
        </div>
      </article>
    `;
  }
}

customElements.define('chatbot-card', ChatbotCard);
