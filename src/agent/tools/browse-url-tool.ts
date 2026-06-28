import { Type } from '@mariozechner/pi-ai';
import type { AgentTool } from '@mariozechner/pi-agent-core';

export const browseUrlParams = Type.Object({
    url: Type.String({
        description: 'Full URL to navigate to, including https://'
    }),
    waitForSelector: Type.Optional(Type.String({
        description: 'CSS selector to wait for before extracting content. Use when the page loads content asynchronously.'
    })),
    extraWaitMs: Type.Optional(Type.Number({
        description: 'Additional milliseconds to wait after page load. Use for pages with animations or lazy loading. Max 5000.'
    }))
});

export function createBrowseUrlTool(): AgentTool<typeof browseUrlParams> {
    return {
        name: 'browse_url',
        label: 'Browse URL',
        description: 'Navigates to a URL, executes JavaScript, and returns the page content as Markdown. Supports modern web applications built with React, Vue, Angular, etc.',
        parameters: browseUrlParams,
        execute: async (_toolCallId, params) => {
            const serviceUrl = process.env.BROWSER_SERVICE_URL || 'http://127.0.0.1:3001';
            const endpoint = `${serviceUrl}/browse`;

            console.log(`[TOOL] browse_url → url="${params.url}"`);

            try {
                const response = await fetch(endpoint, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        url: params.url,
                        waitForSelector: params.waitForSelector,
                        extraWaitMs: params.extraWaitMs
                    })
                });

                const data = await response.json() as {
                    url: string;
                    finalUrl?: string;
                    title?: string;
                    markdown?: string;
                    error?: string;
                    durationMs: number;
                };

                if (data.error) {
                    console.error(`[TOOL] browse_url FAILED: ${data.error}`);
                    return {
                        content: [{ type: 'text', text: `Failed to browse ${params.url}. Error: ${data.error}` }],
                        details: { error: data.error, durationMs: data.durationMs }
                    };
                }

                const resultText = `URL: ${data.finalUrl}\nTitle: ${data.title}\n\n${data.markdown}`;

                console.log(`[TOOL] browse_url OK → ${data.finalUrl} (${data.durationMs}ms)`);

                return {
                    content: [{ type: 'text', text: resultText }],
                    details: {
                        finalUrl: data.finalUrl,
                        title: data.title,
                        durationMs: data.durationMs
                    }
                };
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                console.error(`[TOOL] browse_url ERROR:`, errorMessage);
                return {
                    content: [{ type: 'text', text: `Browser service is not available. Make sure the browser-service is running. Error: ${errorMessage}` }],
                    details: { error: errorMessage }
                };
            }
        }
    };
}
