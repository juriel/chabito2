import Fastify from 'fastify';
import { chromium } from 'playwright';
import TurndownService from 'turndown';

const PORT = parseInt(process.env.BROWSER_SERVICE_PORT || '3001', 10);

const turndown = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  bulletListMarker: '-',
  emDelimiter: '*',
});

turndown.remove(['script', 'style', 'nav', 'header', 'footer', 'aside']);

const headless = (() => {
  if (process.argv.includes('--headed')) return false;
  if (process.argv.includes('--headless')) return true;
  return process.env.BROWSER_SERVICE_HEADLESS !== 'false';
})();
const browser = await chromium.launch({ headless });

const app = Fastify({ logger: false });

app.post<{
  Body: {
    url: string;
    waitForSelector?: string;
    extraWaitMs?: number;
    waitUntil?: 'load' | 'domcontentloaded' | 'networkidle';
  };
}>('/browse', async (request, reply) => {
  const start = Date.now();
  const { url, waitForSelector, extraWaitMs = 0, waitUntil = 'networkidle' } = request.body;

  if (!url) {
    return reply.status(400).send({
      url: '',
      error: 'Missing required field: url',
      durationMs: Date.now() - start,
    });
  }

  let context;
  try {
    context = await browser.newContext({ javaScriptEnabled: true });

    await context.route('**/*', (route) => {
      const type = route.request().resourceType();
      if (type === 'image' || type === 'media' || type === 'font') {
        route.abort();
      } else {
        route.continue();
      }
    });

    const page = await context.newPage();
    await page.goto(url, { waitUntil, timeout: 30000 });

    if (waitForSelector) {
      await page.waitForSelector(waitForSelector, { timeout: 10000 });
    }

    if (extraWaitMs > 0) {
      await page.waitForTimeout(Math.min(extraWaitMs, 5000));
    }

    const title = await page.title();
    const finalUrl = page.url();
    const html = await page.content();
    const markdown = turndown.turndown(html);

    await context.close();

    return {
      url,
      finalUrl,
      title,
      markdown,
      durationMs: Date.now() - start,
    };
  } catch (err) {
    if (context) {
      await context.close().catch(() => {});
    }

    const message = err instanceof Error ? err.message : String(err);
    return {
      url,
      error: message,
      durationMs: Date.now() - start,
    };
  }
});

const shutdown = async () => {
  await browser.close().catch(() => {});
  await app.close().catch(() => {});
  process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

await app.listen({ port: PORT, host: '127.0.0.1' });
console.log(`[browser-service] listening on http://127.0.0.1:${PORT}`);
