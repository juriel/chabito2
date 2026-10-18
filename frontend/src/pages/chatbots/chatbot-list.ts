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
        ? html`<div class="card p-10 text-center"><p class="muted">Aún no hay chatbots. Crea uno para vincular tu WhatsApp con un QR.</p></div>`
        : html`<div class="bot-grid">${this.sessions.map((session) => html`<chatbot-card .session=${session}></chatbot-card>`)}</div>`}
    `;
  }
}

customElements.define('chatbot-list', ChatbotList);
