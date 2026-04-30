import { LitElement, html } from 'lit';

export class LandingPage extends LitElement {
  private readonly logoSrc = '/images/chabi-logo-web.svg';

  createRenderRoot() {
    return this;
  }

  private navigate(route: string) {
    window.location.hash = route;
  }

  render() {
    return html`
      <section class="overflow-hidden rounded-[12px] border border-[color:var(--color-border)] px-8 py-16 text-center shadow-[0_18px_40px_rgba(39,0,136,0.08)]" style="background: linear-gradient(135deg, #270088 0%, #3A7CA5 58%, #81C3D7 100%);">
        <div class="relative">
          <div class="mx-auto flex w-fit items-center justify-center rounded-[8px] border border-white/20 bg-white/10 p-4">
            <img src="${this.logoSrc}" alt="Logo de Chabito" class="h-24 w-24" />
          </div>
          <h1 class="mt-8 text-4xl font-black tracking-[0.08em] text-[color:var(--color-text-on-dark)] uppercase sm:text-5xl">Chabito</h1>
          <p class="mx-auto mt-6 max-w-2xl text-base leading-8 text-[color:rgba(217,220,214,0.92)] sm:text-lg">
            Tu asistente de WhatsApp con IA para lanzar sesiones, mostrar QR y administrar chatbots desde una interfaz simple y clara.
          </p>
        </div>
        <div class="relative mt-10 grid gap-4 sm:grid-cols-2 justify-center">
          <a href="#/chatbots" @click=${(event: Event) => { event.preventDefault(); this.navigate('#/chatbots'); }} class="inline-flex items-center justify-center rounded-[var(--radius-soft)] border border-white/30 bg-[color:var(--color-text-on-dark)] px-6 py-3 text-sm font-semibold text-[color:var(--color-primary)] transition hover:opacity-90">Administrar Chatbots</a>
          <a href="/html/documentation.html" class="inline-flex items-center justify-center rounded-[var(--radius-soft)] border border-white/30 bg-white/12 px-6 py-3 text-sm font-semibold text-[color:var(--color-text-on-dark)] transition hover:bg-white/20">Documentación</a>
        </div>
      </section>

      <section class="py-20">
        <h2 class="text-center text-3xl font-bold text-[color:var(--color-primary)]">Qué puedes hacer</h2>
        <div class="mt-12 grid gap-6 lg:grid-cols-3">
          <div class="rounded-[10px] border border-[color:var(--color-border)] bg-white p-8 shadow-[0_14px_30px_rgba(39,0,136,0.06)]">
            <div class="mb-5 inline-flex h-12 w-12 items-center justify-center rounded-[8px] bg-[rgba(39,0,136,0.12)] text-2xl">🤖</div>
            <h3 class="text-xl font-semibold text-[color:var(--color-primary)]">Crear chatbots</h3>
            <p class="mt-3 text-[color:rgba(26,26,26,0.76)]">Inicializa sesiones por UUID y muestra su QR en pantalla.</p>
          </div>
          <div class="rounded-[10px] border border-[color:var(--color-border)] bg-white p-8 shadow-[0_14px_30px_rgba(39,0,136,0.06)]">
            <div class="mb-5 inline-flex h-12 w-12 items-center justify-center rounded-[8px] bg-[rgba(58,124,165,0.14)] text-2xl">📱</div>
            <h3 class="text-xl font-semibold text-[color:var(--color-primary)]">Monitorear estado</h3>
            <p class="mt-3 text-[color:rgba(26,26,26,0.76)]">Actualiza el estado de cada sesión y revisa si ya fue emparejada.</p>
          </div>
          <div class="rounded-[10px] border border-[color:var(--color-border)] bg-white p-8 shadow-[0_14px_30px_rgba(39,0,136,0.06)]">
            <div class="mb-5 inline-flex h-12 w-12 items-center justify-center rounded-[8px] bg-[rgba(129,195,215,0.2)] text-2xl">⚡</div>
            <h3 class="text-xl font-semibold text-[color:var(--color-primary)]">Ver QR PNG</h3>
            <p class="mt-3 text-[color:rgba(26,26,26,0.76)]">Obtén el QR directamente desde el endpoint y refresca la imagen cuando quieras.</p>
          </div>
        </div>
      </section>
    `;
  }
}

customElements.define('chabito-landing', LandingPage);
