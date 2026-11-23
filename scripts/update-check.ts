/**
 * Update check, for real: a device that has the previous version must get the new one, in the two ways an
 * update reaches people:
 * - desktop: the tab never goes to the background, the user reloads; the second load must show the new version;
 * - phone: the app goes to the background; the new version takes over and the page reloads unseen.
 *
 * The "previous" version is a copy of this build with another service worker version and a marker on the
 * page: same update code, since what is tested is how this version hands over to the next one.
 *
 * Usage: npm run build && npm run test:update.
 */
import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { chromium, type Browser, type Page } from "playwright";

const PORT = 4800 + Math.floor(Math.random() * 500);
const BASE = `http://localhost:${PORT}/`;
const PREVIOUS = path.resolve("out/update/previous");

let failures = 0;
function check(label: string, ok: boolean, detail = ""): void {
  console.log(`${ok ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

async function serve(root: string): Promise<ChildProcess> {
  const server = spawn("node", [path.join(root, "dist-server/main.js")], {
    env: { ...process.env, PORT: String(PORT) },
    stdio: "ignore",
  });
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(`${BASE}sante`)).ok) return server;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("server did not start");
}

async function stop(server: ChildProcess): Promise<void> {
  server.kill();
  await new Promise((r) => server.once("exit", r));
}

const isPrevious = (page: Page) => page.evaluate(() => document.documentElement.dataset.build === "previous");
const hasWaiting = (page: Page) =>
  page.evaluate(async () => !!(await navigator.serviceWorker.getRegistration())?.waiting);

/** From the previous version installed on the device to the new one, `takeOver` being what the user does. */
async function scenario(browser: Browser, name: string, takeOver: (page: Page) => Promise<void>): Promise<void> {
  console.log(`\n${name}`);
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const consoleErrors: string[] = [];
  page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text()));
  page.on("pageerror", (e) => consoleErrors.push(e.message));

  let server = await serve(PREVIOUS);
  try {
    // The device gets the previous version and keeps it in cache.
    await page.goto(BASE);
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload();
    check(
      "previous version installed and in control",
      (await isPrevious(page)) && (await page.evaluate(() => !!navigator.serviceWorker.controller)),
    );

    // Deploy. The next load is still the cached previous version; the new one installs and waits.
    await stop(server);
    server = await serve(".");
    await page.reload();
    await page.waitForFunction(async () => !!(await navigator.serviceWorker.getRegistration())?.waiting, null, {
      timeout: 10_000,
    });
    // Chromium may install the new version twice in the first seconds (the navigation's update check, then
    // the page's register), the second replacing the first; a reload in between costs one more load.
    await page.waitForTimeout(3000);
    check("after deploy: previous version still shown, new one waiting", await isPrevious(page));

    await takeOver(page);
    await page
      .waitForFunction(() => document.documentElement.dataset.build !== "previous", null, { timeout: 10_000 })
      .catch(() => undefined);
    await page.waitForLoadState("load");
    check("new version shown", !(await isPrevious(page)));
    check("no version left waiting", !(await hasWaiting(page)));
    check(
      "only the new cache is kept",
      await page.evaluate(async () => (await caches.keys()).every((k) => k !== "bati-previous")),
    );
    check("no console error", consoleErrors.length === 0, consoleErrors.join(" | "));
  } catch (e) {
    check("scenario ran without exception", false, String(e));
  } finally {
    await context.close();
    await stop(server);
  }
}

// The previous version: this build, its service worker under another version, its page marked.
await fs.rm(PREVIOUS, { recursive: true, force: true });
await fs.cp("dist", path.join(PREVIOUS, "dist"), { recursive: true });
await fs.cp("dist-server", path.join(PREVIOUS, "dist-server"), { recursive: true });
const swFile = path.join(PREVIOUS, "dist/sw.js");
const sw = await fs.readFile(swFile, "utf8");
const swPrevious = sw.replace(/^const VERSION = "[0-9a-f]+";/m, 'const VERSION = "previous";');
if (swPrevious === sw) throw new Error("VERSION not found in dist/sw.js");
await fs.writeFile(swFile, swPrevious);
const pageFile = path.join(PREVIOUS, "dist/index.html");
await fs.writeFile(pageFile, (await fs.readFile(pageFile, "utf8")).replace("<html", '<html data-build="previous"'));

const browser = await chromium.launch();
try {
  await scenario(browser, "Desktop: the user reloads", (page) => page.reload().then(() => undefined));
  // Headless Chromium never hides a page: the change of visibility is emulated. A string, because tsx would
  // add a helper to named functions that does not exist in the page.
  await scenario(browser, "Phone: the app goes to the background", (page) =>
    page.evaluate(`
      Object.defineProperty(document, "hidden", { configurable: true, value: true });
      Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
      document.dispatchEvent(new Event("visibilitychange"));
    `),
  );
} finally {
  await browser.close();
}

console.log(failures === 0 ? "\nUpdate check passed." : `\n${failures} failure(s).`);
process.exit(failures === 0 ? 0 : 1);
