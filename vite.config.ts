import { defineConfig } from "vitest/config";

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
  test: { include: ["tests/**/*.test.ts"] },
}));
