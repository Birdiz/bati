import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";
import globals from "globals";

export default tseslint.config(
  { ignores: ["dist/", "dist-server/", "node_modules/", "out/"] },
  js.configs.recommended,
  ...tseslint.configs.strict,
  prettier,
  {
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: {
      // With noUncheckedIndexedAccess, "!" marks index accesses that are guaranteed by construction.
      "@typescript-eslint/no-non-null-assertion": "off",
    },
  },
);
