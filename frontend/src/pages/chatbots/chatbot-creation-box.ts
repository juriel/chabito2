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
        <label for="uuid" class="text-sm font-semibold text-slate-700">UUID del chatbot</label>
        <input id="uuid" type="text" .value=${this.uuidInput} @input=${this.updateUuid} placeholder="ejemplo: demo-session"
          class="rounded-2xl border border-slate-300 bg-slate-50 px-4 py-3 text-slate-900 outline-none transition focus:border-violet-500 focus:bg-white" />
      </div>
      <p class="text-sm text-slate-500 mt-3">Cada UUID crea una nueva sesión /api/sessions/:uuid y permite mostrar su QR.</p>
      ${this.apiError ? html`<p class="rounded-2xl bg-rose-50 px-4 py-3 mt-3 text-sm font-semibold text-rose-700">${this.apiError}</p>` : ''}
      <button class="mt-3 inline-flex w-full items-center justify-center rounded-full bg-violet-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-violet-700"
        @click=${this.handleCreate}>Crear chatbot</button>
    `;
  }
}

customElements.define('chatbot-creation-box', ChatbotCreationBox);
