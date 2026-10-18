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
      <form class="grid gap-4" @submit=${this.handleCreate}>
        <div class="grid gap-2">
          <label for="uuid" class="field-label">UUID del chatbot</label>
          <input id="uuid" type="text" class="input" .value=${this.uuidInput} @input=${this.updateUuid} placeholder="ejemplo: demo-session" autocomplete="off" />
          <p class="muted m-0">Cada UUID crea una sesión nueva y muestra su QR para vincularla.</p>
        </div>
        ${this.apiError ? html`<p class="notice m-0">${this.apiError}</p>` : ''}
        <button type="submit" class="btn btn-primary btn-block">Crear chatbot</button>
      </form>
    `;
  }
}

customElements.define('chatbot-creation-box', ChatbotCreationBox);
