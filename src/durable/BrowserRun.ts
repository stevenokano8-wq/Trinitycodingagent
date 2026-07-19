/**
 * BROWSER_RUN — Durable Object
 *
 * Headless browser actions via Cloudflare Browser Rendering (env.BROWSER).
 */

import { AppEnv } from "../../server/env.js";

interface NavigateResult {
  url: string;
  title: string;
  status: number;
  content: string;
  loadedAt: string;
}

interface ScreenshotResult {
  dataUrl: string;
  width: number;
  height: number;
}

interface EvaluateResult {
  result: unknown;
}

interface TestAssertion {
  type: "contains" | "not_contains" | "exists" | "not_exists" | "equals";
  selector?: string;
  value?: string;
}

interface TestResult {
  assertion: TestAssertion;
  passed: boolean;
  actual?: string;
}

interface BrowserSession {
  id: string;
  action: string;
  url: string;
  ts: string;
  success: boolean;
}

const MAX_SESSIONS = 20;

export class BrowserRun {
  private state: DurableObjectState;
  private env: AppEnv;

  constructor(state: DurableObjectState, env: AppEnv) {
    this.state = state;
    this.env = env;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const { pathname } = url;

    if (request.method === "GET" && pathname === "/sessions") {
      const sessions = await this.state.storage.get<BrowserSession[]>("sessions") ?? [];
      return Response.json(sessions.slice(-20));
    }

    if (request.method !== "POST") return new Response("Not found", { status: 404 });

    const body = await request.json() as Record<string, unknown>;

    switch (pathname) {
      case "/navigate":     return this.navigate(body);
      case "/screenshot":   return this.screenshot(body);
      case "/evaluate":     return this.evaluate(body);
      case "/test":         return this.test(body);
      case "/fill-and-submit": return this.fillAndSubmit(body);
      default:              return new Response("Not found", { status: 404 });
    }
  }

  // ── /navigate ──────────────────────────────────────────────────────────────
  private async navigate(body: Record<string, unknown>): Promise<Response> {
    const targetUrl = body.url as string;
    if (!targetUrl) return new Response("Missing url", { status: 400 });

    if (!this.env.BROWSER) {
      return this.unavailable("navigate", targetUrl, {
        url: targetUrl, title: "Browser binding unavailable",
        status: 0, content: "", loadedAt: new Date().toISOString(),
      });
    }

    try {
      // @ts-ignore — @cloudflare/puppeteer types unavailable at compile time
      const puppeteer = await import("@cloudflare/puppeteer");
      const browser = await puppeteer.default.launch(this.env.BROWSER);
      const page    = await browser.newPage();
      const resp    = await page.goto(targetUrl, { waitUntil: "networkidle0" });
      const title   = await page.title();
      const content = await page.content();
      await browser.close();

      const result: NavigateResult = {
        url: targetUrl, title, status: resp?.status() ?? 200,
        content: content.slice(0, 50_000), loadedAt: new Date().toISOString(),
      };
      await this.appendSession({ id: crypto.randomUUID(), action: "navigate", url: targetUrl, ts: result.loadedAt, success: true });
      return Response.json(result);
    } catch (err) {
      return Response.json({ error: String(err) }, { status: 500 });
    }
  }

  // ── /screenshot ────────────────────────────────────────────────────────────
  private async screenshot(body: Record<string, unknown>): Promise<Response> {
    const targetUrl = body.url as string;
    const fullPage  = body.fullPage !== false;
    if (!targetUrl) return new Response("Missing url", { status: 400 });

    if (!this.env.BROWSER) {
      return this.unavailable("screenshot", targetUrl, {
        dataUrl: "data:image/png;base64,", width: 0, height: 0,
      });
    }

    try {
      // @ts-ignore — @cloudflare/puppeteer types unavailable at compile time
      const puppeteer = await import("@cloudflare/puppeteer");
      const browser   = await puppeteer.default.launch(this.env.BROWSER);
      const page      = await browser.newPage();
      await page.setViewport({ width: 1280, height: 800 });
      await page.goto(targetUrl, { waitUntil: "networkidle0" });
      const buf = await page.screenshot({ fullPage, type: "png" }) as Buffer;
      await browser.close();

      const dataUrl = `data:image/png;base64,${buf.toString("base64")}`;
      const result: ScreenshotResult = { dataUrl, width: 1280, height: 800 };
      await this.appendSession({ id: crypto.randomUUID(), action: "screenshot", url: targetUrl, ts: new Date().toISOString(), success: true });
      return Response.json(result);
    } catch (err) {
      return Response.json({ error: String(err) }, { status: 500 });
    }
  }

  // ── /evaluate ─────────────────────────────────────────────────────────────
  private async evaluate(body: Record<string, unknown>): Promise<Response> {
    const { url: targetUrl, script } = body as { url: string; script: string };
    if (!targetUrl || !script) return new Response("Missing url or script", { status: 400 });

    if (!this.env.BROWSER) {
      return this.unavailable("evaluate", targetUrl, { result: null });
    }

    try {
      // @ts-ignore — @cloudflare/puppeteer types unavailable at compile time
      const puppeteer = await import("@cloudflare/puppeteer");
      const browser   = await puppeteer.default.launch(this.env.BROWSER);
      const page      = await browser.newPage();
      await page.goto(targetUrl, { waitUntil: "networkidle0" });
      const result: unknown = await page.evaluate(script);
      await browser.close();
      await this.appendSession({ id: crypto.randomUUID(), action: "evaluate", url: targetUrl, ts: new Date().toISOString(), success: true });
      return Response.json({ result } satisfies EvaluateResult);
    } catch (err) {
      return Response.json({ error: String(err) }, { status: 500 });
    }
  }

  // ── /test ──────────────────────────────────────────────────────────────────
  private async test(body: Record<string, unknown>): Promise<Response> {
    const { url: targetUrl, assertions } = body as { url: string; assertions: TestAssertion[] };
    if (!targetUrl || !assertions?.length)
      return new Response("Missing url or assertions", { status: 400 });

    if (!this.env.BROWSER) {
      return this.unavailable("test", targetUrl, {
        passed: false, results: assertions.map(a => ({ assertion: a, passed: false, actual: "Browser unavailable" })),
      });
    }

    try {
      // @ts-ignore — @cloudflare/puppeteer types unavailable at compile time
      const puppeteer = await import("@cloudflare/puppeteer");
      const browser   = await puppeteer.default.launch(this.env.BROWSER);
      const page      = await browser.newPage();
      await page.goto(targetUrl, { waitUntil: "networkidle0" });
      const content = await page.content();

      const results: TestResult[] = await Promise.all(assertions.map(async a => {
        try {
          switch (a.type) {
            case "contains":
              return { assertion: a, passed: content.includes(a.value ?? ""), actual: a.value };
            case "not_contains":
              return { assertion: a, passed: !content.includes(a.value ?? ""), actual: a.value };
            case "exists": {
              const el = await page.$(a.selector ?? "body");
              return { assertion: a, passed: el !== null };
            }
            case "not_exists": {
              const el = await page.$(a.selector ?? "");
              return { assertion: a, passed: el === null };
            }
            case "equals": {
              const text = a.selector
                ? await page.$eval(a.selector, (el: Element) => el.textContent?.trim() ?? "")
                : content;
              return { assertion: a, passed: text === a.value, actual: text };
            }
            default:
              return { assertion: a, passed: false, actual: "Unknown assertion type" };
          }
        } catch (e) {
          return { assertion: a, passed: false, actual: String(e) };
        }
      }));

      await browser.close();
      const passed = results.every(r => r.passed);
      await this.appendSession({ id: crypto.randomUUID(), action: "test", url: targetUrl, ts: new Date().toISOString(), success: passed });
      return Response.json({ passed, results });
    } catch (err) {
      return Response.json({ error: String(err) }, { status: 500 });
    }
  }

  // ── /fill-and-submit ───────────────────────────────────────────────────────
  private async fillAndSubmit(body: Record<string, unknown>): Promise<Response> {
    const { url: targetUrl, fields, submitSelector } = body as {
      url: string; fields: Record<string, string>; submitSelector: string;
    };
    if (!targetUrl || !fields) return new Response("Missing url or fields", { status: 400 });

    if (!this.env.BROWSER) {
      return this.unavailable("fill-and-submit", targetUrl, { success: false, note: "Browser unavailable" });
    }

    try {
      // @ts-ignore — @cloudflare/puppeteer types unavailable at compile time
      const puppeteer = await import("@cloudflare/puppeteer");
      const browser   = await puppeteer.default.launch(this.env.BROWSER);
      const page      = await browser.newPage();
      await page.goto(targetUrl, { waitUntil: "networkidle0" });
      for (const [selector, value] of Object.entries(fields)) {
        await page.type(selector, value);
      }
      if (submitSelector) {
        await Promise.all([page.waitForNavigation(), page.click(submitSelector)]);
      }
      const finalUrl = page.url();
      await browser.close();
      await this.appendSession({ id: crypto.randomUUID(), action: "fill-and-submit", url: targetUrl, ts: new Date().toISOString(), success: true });
      return Response.json({ success: true, finalUrl });
    } catch (err) {
      return Response.json({ error: String(err) }, { status: 500 });
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────────
  private unavailable(action: string, url: string, payload: unknown): Response {
    return Response.json({
      ...payload as object,
      _note: `BROWSER binding not configured. Enable via Cloudflare Dashboard → Workers → Browser Rendering, then uncomment [browser] in wrangler.api.toml.`,
    });
  }

  private async appendSession(entry: BrowserSession): Promise<void> {
    const sessions = await this.state.storage.get<BrowserSession[]>("sessions") ?? [];
    sessions.push(entry);
    if (sessions.length > MAX_SESSIONS) sessions.splice(0, sessions.length - MAX_SESSIONS);
    await this.state.storage.put("sessions", sessions);
  }
}
