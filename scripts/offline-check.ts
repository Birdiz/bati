/**
 * Offline check, for real: production build served by the production server, one online load, then the
 * server is stopped AND the browser is put offline, and every feature is used: reload, house profile, quick
 * check, cold surface, log, export, import, reference sheet (printed to PDF), reload again to check that the
 * data stayed on the device.
 *
 * Usage: npm run build && npm run test:offline. Screenshots and the printed sheet go to out/offline/.
 */
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { chromium, devices, type Page } from "playwright";

const PORT = 4300 + Math.floor(Math.random() * 500);
const BASE = `http://localhost:${PORT}/`;
const OUT = path.resolve("out/offline");

let failures = 0;
function check(label: string, ok: boolean, detail = ""): void {
  console.log(`${ok ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

async function waitForServer(): Promise<void> {
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(`${BASE}sante`)).ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("server did not start");
}

const text = (page: Page, sel: string) => page.locator(sel).innerText();

await fs.mkdir(OUT, { recursive: true });
const server = spawn("node", ["dist-server/main.js"], {
  env: { ...process.env, PORT: String(PORT) },
  stdio: "inherit",
});
await waitForServer();

const browser = await chromium.launch();
const context = await browser.newContext({ ...devices["Pixel 7"], acceptDownloads: true });
const page = await context.newPage();
const consoleErrors: string[] = [];
page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text()));
page.on("pageerror", (e) => consoleErrors.push(e.message));

try {
  // 1. One online load, until the service worker has cached everything and is active.
  await page.goto(BASE);
  await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready;
    if (!reg.active) throw new Error("no active service worker");
  });
  check("service worker installed and active after the first load", true);

  // 2. Cut the network: server stopped and browser offline.
  server.kill();
  await new Promise((r) => server.once("exit", r));
  await context.setOffline(true);
  const offlineFetch = await page.evaluate(() =>
    fetch("/sante", { cache: "no-store" }).then(
      () => "reached",
      () => "failed",
    ),
  );
  check("network really cut (a request outside the cache fails)", offlineFetch === "failed", offlineFetch);
  // That deliberate failure is logged by the browser; start counting errors from here.
  consoleErrors.length = 0;

  await page.reload();
  check("app reloads offline", (await page.title()).includes("Maison Bloc"));
  check("page is controlled by the service worker", await page.evaluate(() => !!navigator.serviceWorker.controller));

  // 3. House profile.
  await page.goto(`${BASE}#maison`);
  await page.selectOption("#ventilation", "singleFlow");
  await page.fill("#facadeName", "Côté ruisseau");
  await page.selectOption("#facadeOrientation", "NE");
  await page.check("#facadeWet");
  await page.check("#facadeUp");
  await page.click("#facadeForm button[type=submit]");
  await page.fill("#facadeName", "Jardin");
  await page.selectOption("#facadeOrientation", "SW");
  await page.check("#facadeUp");
  await page.click("#facadeForm button[type=submit]");
  await page.fill("#coldSurfaceName", "Plancher du salon");
  await page.fill("#coldSurfaceLocation", "Au-dessus de la cave");
  await page.click("#coldSurfaceForm button[type=submit]");
  check(
    "house profile: 2 facades, 1 cold surface",
    (await page.locator("#facadeList li").count()) === 2 && (await page.locator("#surfaceList li").count()) === 1,
  );
  await page.screenshot({ path: `${OUT}/2-maison.png`, fullPage: true });

  // 4. Quick check, after rain with the stream facade.
  await page.goto(`${BASE}#releve`);
  await page.fill("#indoorT", "21");
  await page.fill("#indoorRh", "73");
  await page.fill("#outdoorT", "10");
  await page.fill("#outdoorRh", "80");
  await page.check("#recentRain");
  check("indoor AH 13,3 g/m³", (await text(page, "#indoorAH")) === "13,3 g/m³", await text(page, "#indoorAH"));
  check("outdoor AH 7,5 g/m³", (await text(page, "#outdoorAH")) === "7,5 g/m³", await text(page, "#outdoorAH"));
  check("advice: open + VMC at full speed", (await text(page, "#adviceTitle")) === "Ouvrir + VMC à fond");
  const lines = await text(page, "#adviceLines");
  check("advice avoids the stream facade", lines.includes("ne pas ouvrir la façade Côté ruisseau (nord-est)"));
  check("advice: upstairs, opposite side", lines.includes("Ouvrir à l'étage, côté Jardin (sud-ouest)"));
  check("indoor dew point shown", (await text(page, "#dewPointLine")).includes("16,"));
  await page.fill("#note", "Essai hors ligne");
  await page.click("#saveForm button[type=submit]");
  check("quick check saved", (await text(page, "#saveStatus")) === "Enregistré dans le carnet.");
  await page.screenshot({ path: `${OUT}/1-releve.png`, fullPage: true });

  // Storm overrides.
  await page.check("#storm");
  check("storm overrides the measurements", (await text(page, "#adviceTitle")) === "Orage : garder fermé");
  await page.uncheck("#storm");

  // 5. Cold surface.
  await page.goto(`${BASE}#surface`);
  check("room air prefilled from the quick check", (await page.inputValue("#surfIndoorT")) === "21");
  await page.fill("#surfaceT", "14");
  check("cold surface at risk", (await text(page, "#surfaceResultTitle")) === "Risque de condensation");
  await page.click("#surfaceSave");
  await page.screenshot({ path: `${OUT}/3-surface.png`, fullPage: true });

  // 6. Log, export.
  await page.goto(`${BASE}#carnet`);
  check("log shows 2 entries", (await page.locator("#logList li").count()) === 2);
  check(
    "trend shown, waiting for a second day",
    (await page.locator("#trend").isVisible()) &&
      (await page.locator("#trendFew").isVisible()) &&
      (await text(page, "#trendResultTitle")) === "Pas encore de comparaison",
  );
  const [download] = await Promise.all([page.waitForEvent("download"), page.click("#exportBtn")]);
  const exportPath = `${OUT}/${download.suggestedFilename()}`;
  await download.saveAs(exportPath);
  const exported = JSON.parse(await fs.readFile(exportPath, "utf8")) as { format: string; log: unknown[] };
  check(
    "export file written offline",
    exported.format === "bati-export" && exported.log.length === 2,
    download.suggestedFilename(),
  );
  await page.screenshot({ path: `${OUT}/4-carnet.png`, fullPage: true });

  // 7. Import (merge) after deleting an entry.
  page.once("dialog", (d) => void d.accept());
  await page.locator("#logList li").first().locator("button").click();
  check("entry deleted", (await page.locator("#logList li").count()) === 1);
  await page.setInputFiles("#importFile", exportPath);
  await page.click("#importMerge");
  check(
    "import restores the deleted entry",
    (await page.locator("#logList li").count()) === 2,
    await text(page, "#importStatus"),
  );

  // 8. Reference sheet, printed to PDF.
  await page.goto(`${BASE}#fiche`);
  check("AH table 5–40 °C", (await page.locator("#ahTable tbody tr").count()) === 36);
  check("rules table filled", (await page.locator("#rulesTable tbody tr").count()) === 6);
  await page.emulateMedia({ media: "print" });
  await page.pdf({
    path: `${OUT}/5-fiche.pdf`,
    format: "A4",
    margin: { top: "12mm", bottom: "12mm", left: "12mm", right: "12mm" },
  });
  await page.emulateMedia({ media: "screen" });
  check("reference sheet printed to PDF", (await fs.stat(`${OUT}/5-fiche.pdf`)).size > 10_000);

  // 9. Data stays on the device across an offline reload.
  await page.goto(`${BASE}#carnet`);
  await page.reload();
  check("log kept after an offline reload", (await page.locator("#logList li").count()) === 2);
  await page.goto(`${BASE}#maison`);
  check("profile kept after an offline reload", (await page.locator("#facadeList li").count()) === 2);

  check("no console error or CSP violation", consoleErrors.length === 0, consoleErrors.join(" | "));
} catch (e) {
  check("run completed", false, String(e));
} finally {
  await browser.close();
  if (server.exitCode === null) server.kill();
}

console.log(failures === 0 ? "\nOffline check passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
