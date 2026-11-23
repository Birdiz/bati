/**
 * Installable and offline. Same approach as Quart de tour: a cache-first service worker whose file list is
 * written at build time, silent updates. A new version installs in the background, takes over when the page
 * goes to the background (or at launch if it was already waiting), then the page reloads unseen. Every change
 * is already stored on input, so a reload loses nothing.
 */
const HOUR = 3_600_000;

const standalone = () =>
  matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;

export function startPWA(): void {
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
  const sw = navigator.serviceWorker;
  // Ask the browser not to evict the data; granted automatically to an installed app on most browsers.
  if (standalone()) void navigator.storage?.persist?.();

  let reloadNow = false;
  let swapped = false;
  sw.addEventListener("controllerchange", () => {
    if (!document.hidden && !reloadNow) {
      swapped = true;
      return;
    }
    location.reload();
  });

  void sw.register("sw.js").then((reg) => {
    // No controller: first install, the page is already the right version.
    const waiting = () => (sw.controller ? reg.waiting : null);
    const start = waiting();
    if (start) {
      reloadNow = true;
      start.postMessage("activate");
    }
    // A reload or a closed tab also hides the page. Activating then races the navigation: the next page is
    // already served by the old worker and finds nothing waiting, so a reload on desktop showed the old
    // version again. When leaving, the next launch activates the waiting version before anything is seen.
    let leaving = false;
    addEventListener("pagehide", () => (leaving = true));
    addEventListener("pageshow", () => (leaving = false));
    let checked = Date.now();
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        // Deferred: browsers fire pagehide and visibilitychange in either order, and a task queued while
        // unloading never runs.
        setTimeout(() => {
          if (leaving || !document.hidden) return;
          if (swapped) location.reload();
          else waiting()?.postMessage("activate");
        });
      } else if (Date.now() - checked > HOUR) {
        // An installed app can stay open for days without reloading.
        checked = Date.now();
        void reg.update();
      }
    });
  });
}
