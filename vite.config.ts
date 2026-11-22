import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { Plugin } from "vite";
import { defineConfig } from "vitest/config";

/** Writes dist/sw.js: src/sw.js with the list of built files and their hash (same approach as Quart de tour). */
function pwa(): Plugin {
  let publicDir = "";
  return {
    name: "bati-pwa",
    apply: (_, env) => env.command === "build" && !env.isSsrBuild,
    enforce: "post",
    configResolved(c) {
      publicDir = c.publicDir;
    },
    generateBundle(_, bundle) {
      // A missing page would be served as a 404: better fail the build and keep the old version online.
      if (!bundle["index.html"]) this.error("index.html missing from the build");
      const hash = createHash("sha256");
      const files: string[] = [];
      for (const [name, out] of Object.entries(bundle).sort(([a], [b]) => a.localeCompare(b))) {
        if (name.endsWith(".map")) continue;
        files.push(name);
        hash.update(name).update(out.type === "chunk" ? out.code : out.source);
      }
      const walk = (dir: string): string[] =>
        fs
          .readdirSync(dir, { withFileTypes: true })
          .flatMap((d) => (d.isDirectory() ? walk(path.join(dir, d.name)) : [path.join(dir, d.name)]));
      for (const f of walk(publicDir).sort()) {
        const name = path.relative(publicDir, f).split(path.sep).join("/");
        files.push(name);
        hash.update(name).update(fs.readFileSync(f));
      }
      const src = fs.readFileSync(path.resolve(import.meta.dirname, "src/sw.js"), "utf8");
      hash.update(src);
      const source = src
        .replace('"__VERSION__"', JSON.stringify(hash.digest("hex").slice(0, 12)))
        .replace('["__FILES__"]', JSON.stringify(["./", ...files]));
      this.emitFile({ type: "asset", fileName: "sw.js", source });
    },
  };
}

export default defineConfig(({ isSsrBuild }) => ({
  // Relative paths: dist/ can be served from any sub-path.
  base: "./",
  build: {
    target: "es2022",
    sourcemap: true,
    modulePreload: { polyfill: false },
    // The server build (--ssr) does not carry public/.
    copyPublicDir: !isSsrBuild,
  },
  plugins: [pwa()],
  test: { include: ["tests/**/*.test.ts"] },
}));
