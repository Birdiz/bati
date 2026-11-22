import path from "node:path";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { staticFiles } from "./static";

/* Serves the built site. No API, no database, no stored data: everything stays on the user's device.
   /sante answers Railway's health check. */

const port = Number(process.env.PORT ?? 3000);
const https = process.env.RAILWAY_PUBLIC_DOMAIN !== undefined || process.env.HTTPS === "1";

const app = new Hono();
app.use(async (c, next) => {
  await next();
  c.header("X-Content-Type-Options", "nosniff");
  c.header("Referrer-Policy", "no-referrer");
  if (https) c.header("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
});
app.get("/sante", (c) => c.text("ok"));
app.use(await staticFiles(path.resolve(import.meta.dirname, "../dist")));

const server = serve({ fetch: app.fetch, port }, () => console.log(`bati on http://localhost:${port}`));
process.on("SIGTERM", () => server.close(() => process.exit(0)));
