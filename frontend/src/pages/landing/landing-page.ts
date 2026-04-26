import { LitElement, html } from 'lit';

export class LandingPage extends LitElement {
  createRenderRoot() {
    return this;
  }

  private navigate(route: string) {
    window.location.hash = route;
  }

  render() {
    return html`
      <section class="rounded-[2rem] bg-gradient-to-br from-violet-700 via-fuchsia-600 to-pink-500 px-8 py-16 text-white shadow-[0_28px_80px_rgba(15,23,42,0.12)] text-center">
        <h1 class="text-4xl font-extrabold tracking-tight sm:text-5xl">Chabito</h1>
        <p class="mx-auto mt-6 max-w-2xl text-base leading-8 text-violet-100 sm:text-lg">
          Tu asistente WhatsApp con IA, listo para lanzar chatbots y emparejar sesiones con QR.
        </p>
        <div class="mt-10 grid gap-4 sm:grid-cols-2 justify-center">
          <a href="#/chatbots" @click=${(event: Event) => { event.preventDefault(); this.navigate('#/chatbots'); }} class="inline-flex items-center justify-center rounded-full bg-white px-6 py-3 text-sm font-semibold transition hover:bg-violet-50" style="color: #6d28d9 !important;">Administrar Chatbots</a>
          <a href="/html/documentation.html" class="inline-flex items-center justify-center rounded-full border border-white/30 bg-white/10 px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/20">Documentación</a>
        </div>
      </section>

      <section class="py-20">
        <h2 class="text-3xl font-bold text-slate-900 text-center">Qué puedes hacer</h2>
        <div class="mt-12 grid gap-6 lg:grid-cols-3">
          <div class="rounded-3xl border border-slate-200 bg-white p-8 shadow-lg">
            <div class="mb-5 inline-flex h-12 w-12 items-center justify-center rounded-3xl bg-violet-100 text-2xl">🤖</div>
            <h3 class="text-xl font-semibold text-slate-900">Crear chatbots</h3>
            <p class="mt-3 text-slate-600">Inicializa sesiones por UUID y muestra su QR en pantalla.</p>
          </div>
          <div class="rounded-3xl border border-slate-200 bg-white p-8 shadow-lg">
            <div class="mb-5 inline-flex h-12 w-12 items-center justify-center rounded-3xl bg-fuchsia-100 text-2xl">📱</div>
            <h3 class="text-xl font-semibold text-slate-900">Monitorear estado</h3>
            <p class="mt-3 text-slate-600">Actualiza el estado de cada sesión y revisa si ya fue emparejada.</p>
          </div>
          <div class="rounded-3xl border border-slate-200 bg-white p-8 shadow-lg">
            <div class="mb-5 inline-flex h-12 w-12 items-center justify-center rounded-3xl bg-pink-100 text-2xl">⚡</div>
            <h3 class="text-xl font-semibold text-slate-900">Ver QR PNG</h3>
            <p class="mt-3 text-slate-600">Obtén el QR directamente desde el endpoint y refresca la imagen cuando quieras.</p>
          </div>
        </div>
      </section>
    `;
  }
}

customElements.define('chabito-landing', LandingPage);
