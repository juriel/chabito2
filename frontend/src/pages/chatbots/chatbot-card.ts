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
      ? 'bg-emerald-100 text-emerald-700'
      : this.session.status === 'error'
      ? 'bg-rose-100 text-rose-700'
      : 'bg-amber-100 text-amber-700';

    return html`
      <article class="rounded-3xl border border-slate-200 bg-white shadow-lg overflow-hidden">
        <div class="px-6 py-5 border-b border-slate-200">
          <h3 class="text-lg font-semibold text-slate-900">${this.session.uuid}</h3>
          <p class="text-sm text-slate-500 mt-1">
            Estado: <span class="inline-flex rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${badgeClasses}">${this.session.status}</span>
          </p>
        </div>
        <div class="p-6 grid gap-4">
          <div class="min-h-[220px] rounded-3xl border border-dashed border-slate-300 bg-slate-50 flex items-center justify-center">
            ${this.session.loading
              ? html`<span class="text-slate-500">Cargando QR...</span>`
              : this.session.qrUrl
              ? html`<img src="${this.session.qrUrl}" alt="QR de ${this.session.uuid}" class="max-w-full h-auto rounded-2xl" @load=${this.handleQrImageLoad} @error=${this.handleQrImageError} />`
              : html`<span class="text-slate-500">QR no disponible</span>`}
          </div>
          <div class="grid gap-3 sm:grid-cols-2">
            <button class="inline-flex items-center justify-center rounded-full bg-violet-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:bg-slate-400"
              @click=${this.triggerRefresh} ?disabled=${this.session.loading}>
              Refrescar QR
            </button>
            <button class="inline-flex items-center justify-center rounded-full border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-900 disabled:cursor-not-allowed disabled:border-slate-200"
              @click=${this.triggerRefresh} ?disabled=${this.session.loading}>
              Actualizar estado
            </button>
          </div>
          ${this.session.error ? html`<p class="text-sm font-semibold text-rose-600">${this.session.error}</p>` : ''}
          <p class="text-sm text-slate-500">GET /api/sessions/${this.session.uuid}/qr/png</p>
        </div>
      </article>
    `;
  }
}

customElements.define('chatbot-card', ChatbotCard);
