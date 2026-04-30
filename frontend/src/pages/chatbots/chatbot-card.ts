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

  render() {
    if (!this.session) return html``;

    const badgeClasses = this.session.status === 'open'
      ? 'bg-[rgba(99,216,255,0.18)] text-[color:var(--color-primary)]'
      : this.session.status === 'error'
      ? 'bg-[rgba(138,77,255,0.16)] text-[color:var(--color-primary)]'
      : 'bg-[rgba(39,0,136,0.12)] text-[color:var(--color-primary)]';

    return html`
      <article class="overflow-hidden rounded-[10px] border border-[color:var(--color-border)] bg-white shadow-[0_14px_30px_rgba(39,0,136,0.06)]">
        <div class="border-b border-[color:var(--color-border)] bg-[color:var(--color-surface-muted)] px-6 py-5">
          <h3 class="text-lg font-semibold tracking-[0.03em] text-[color:var(--color-primary)]">${this.session.uuid}</h3>
          <p class="mt-1 text-sm text-[color:rgba(26,26,26,0.68)]">
            Estado: <span class="inline-flex rounded-[var(--radius-soft)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${badgeClasses}">${this.session.status}</span>
          </p>
        </div>
        <div class="p-6 grid gap-4">
          <div class="flex min-h-[220px] items-center justify-center rounded-[8px] border border-dashed border-[rgba(151,170,255,0.28)] bg-[color:var(--color-surface-muted)]">
            ${this.session.loading
              ? html`<span class="text-[color:rgba(26,26,26,0.62)]">Cargando QR...</span>`
              : this.session.qrUrl
              ? html`<img src="${this.session.qrUrl}" alt="QR de ${this.session.uuid}" class="max-w-full h-auto rounded-2xl" @load=${this.handleQrImageLoad} @error=${this.handleQrImageError} />`
              : html`<span class="text-[color:rgba(26,26,26,0.62)]">QR no disponible</span>`}
          </div>
          <div class="grid gap-3 sm:grid-cols-2">
            <button class="inline-flex items-center justify-center rounded-[var(--radius-soft)] bg-[color:var(--color-primary)] px-5 py-3 text-sm font-semibold text-[color:var(--color-text-on-dark)] transition hover:bg-[color:var(--color-secondary)] disabled:cursor-not-allowed disabled:bg-[rgba(58,124,165,0.45)]"
              @click=${this.triggerRefresh} ?disabled=${this.session.loading}>
              Refrescar QR
            </button>
            <button class="inline-flex items-center justify-center rounded-[var(--radius-soft)] border border-[color:var(--color-border)] bg-white px-5 py-3 text-sm font-semibold text-[color:var(--color-primary)] transition hover:bg-[color:var(--color-surface-muted)] disabled:cursor-not-allowed disabled:border-[rgba(58,124,165,0.12)]"
              @click=${this.triggerRefresh} ?disabled=${this.session.loading}>
              Actualizar estado
            </button>
          </div>
          ${this.session.error ? html`<p class="text-sm font-semibold text-[color:var(--color-primary)]">${this.session.error}</p>` : ''}
          <p class="text-sm text-[color:rgba(26,26,26,0.62)]">GET /api/sessions/${this.session.uuid}/qr/png</p>
        </div>
      </article>
    `;
  }
}

customElements.define('chatbot-card', ChatbotCard);
