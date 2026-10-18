import { LitElement, html } from 'lit';
import { type ChatbotSession } from '../../types.ts';
import './chatbot-card.ts';

export class ChatbotList extends LitElement {
  createRenderRoot() {
    return this;
  }

  static get properties() {
    return {
      sessions: { type: Array }
    };
  }

  declare public sessions: ChatbotSession[];

  constructor() {
    super();
    this.sessions = [];
  }

  render() {
    return html`
      ${this.sessions.length === 0
        ? html`<div class="card empty-state">
            <h3>Aún no hay chatbots</h3>
            <p class="muted m-0">Crea una instancia y vincula tu WhatsApp con un QR.</p>
            <button class="btn btn-primary" @click=${() => this.dispatchEvent(new CustomEvent('open-create', { bubbles: true, composed: true }))}>+ Nueva instancia</button>
          </div>`
        : html`<div class="bot-grid">${this.sessions.map((session) => html`<chatbot-card .session=${session}></chatbot-card>`)}</div>`}
    `;
  }
}

customElements.define('chatbot-list', ChatbotList);
