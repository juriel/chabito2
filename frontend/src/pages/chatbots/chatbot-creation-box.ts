import { LitElement, html } from 'lit';

export class ChatbotCreationBox extends LitElement {
  createRenderRoot() {
    return this;
  }

  static get properties() {
    return {
      apiError: { type: String },
      uuidInput: { type: String }
    };
  }

  declare public apiError: string;
  declare public uuidInput: string;

  constructor() {
    super();
    this.apiError = '';
    this.uuidInput = '';
  }

  private updateUuid = (event: Event) => {
    const input = event.target as HTMLInputElement;
    this.uuidInput = input.value;
  };

  private handleCreate = (event: Event) => {
    event.preventDefault();
    const uuid = this.uuidInput.trim();
    if (!uuid) {
      this.apiError = 'Ingresa un UUID válido para crear la sesión.';
      this.requestUpdate();
      return;
    }
    this.apiError = '';
    this.dispatchEvent(new CustomEvent('create-session', {
      detail: { uuid },
      bubbles: true,
      composed: true
    }));
  };

  render() {
    return html`
      <div class="grid gap-3">
        <label for="uuid" class="text-sm font-semibold uppercase tracking-[0.16em] text-[color:var(--color-primary)]">UUID del chatbot</label>
        <input id="uuid" type="text" .value=${this.uuidInput} @input=${this.updateUuid} placeholder="ejemplo: demo-session"
          class="rounded-[var(--radius-soft)] border border-[color:var(--color-border)] bg-white px-4 py-3 text-[color:var(--color-text-on-light)] outline-none transition focus:border-[color:var(--color-secondary)] focus:shadow-[0_0_0_1px_rgba(58,124,165,0.18)]" />
      </div>
      <p class="mt-3 text-sm leading-7 text-[color:rgba(26,26,26,0.68)]">Cada UUID crea una nueva sesión <code>/api/sessions/:uuid</code> y permite mostrar su QR.</p>
      ${this.apiError ? html`<p class="mt-3 rounded-[var(--radius-soft)] border border-[rgba(58,124,165,0.14)] bg-[color:var(--color-surface-muted)] px-4 py-3 text-sm font-semibold text-[color:var(--color-primary)]">${this.apiError}</p>` : ''}
      <button class="mt-4 inline-flex w-full items-center justify-center rounded-[var(--radius-soft)] bg-[color:var(--color-primary)] px-6 py-3 text-sm font-semibold text-[color:var(--color-text-on-dark)] transition hover:bg-[color:var(--color-secondary)]"
        @click=${this.handleCreate}>Crear chatbot</button>
    `;
  }
}

customElements.define('chatbot-creation-box', ChatbotCreationBox);
