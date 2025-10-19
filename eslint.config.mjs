import { defineConfig } from "eslint/config";
import js from "@eslint/js";
import eslintConfigPrettier from "eslint-config-prettier/flat";
import globals from "globals";

export default defineConfig([
  {
    files: ["**/*.js"],
    plugins: {
      js,
    },
    extends: ["js/recommended"],
    languageOptions: {
      globals: {
        ...globals.jest,
        ...globals.node,
      },
      sourceType: "commonjs",
    },
    rules: {
      eqeqeq: ["error", "always"],
      "no-unused-vars": "error",
      "no-var": "error",
    },
  },
  eslintConfigPrettier,
]);
