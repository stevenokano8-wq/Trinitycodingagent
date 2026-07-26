import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import workerApp from "./server/worker.js";

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Serve Hono API app on /api and /ws routes
  app.use(async (req, res, next) => {
    if (req.url.startsWith("/api") || req.url.startsWith("/ws")) {
      try {
        const protocol = req.headers["x-forwarded-proto"] || "http";
        const host = req.headers.host || `localhost:${PORT}`;
        const fullUrl = `${protocol}://${host}${req.url}`;

        const headers = new Headers();
        for (const [k, v] of Object.entries(req.headers)) {
          if (v !== undefined) {
            if (Array.isArray(v)) {
              v.forEach((val) => headers.append(k, val));
            } else {
              headers.set(k, v);
            }
          }
        }

        let body: any = undefined;
        if (req.method !== "GET" && req.method !== "HEAD") {
          body = req;
        }

        const webReq = new Request(fullUrl, {
          method: req.method,
          headers,
          body,
          // @ts-ignore
          duplex: "half",
        });

        const webRes = await workerApp.fetch(webReq, process.env as any, {
          waitUntil: () => {},
          passThroughOnException: () => {},
        } as any);

        res.status(webRes.status);
        webRes.headers.forEach((value, key) => {
          // Avoid duplicate or invalid headers in Express
          if (key.toLowerCase() === "transfer-encoding" && value === "chunked") return;
          res.setHeader(key, value);
        });

        if (webRes.body) {
          const reader = webRes.body.getReader();
          req.on("close", () => {
            reader.cancel().catch(() => {});
          });

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            res.write(value);
          }
          res.end();
        } else {
          res.end();
        }
      } catch (err) {
        console.error("API proxy error:", err);
        if (!res.headersSent) {
          res.status(500).json({ error: "Internal server error in API proxy" });
        } else {
          res.end();
        }
      }
    } else {
      next();
    }
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[Full-Stack Server] Running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
