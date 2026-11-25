// Wenige, fehlerfindende Regeln – keine Stilregeln.
import globals from "globals";

const regeln = {
  "no-undef": "error",
  "no-unused-vars": ["warn", { args: "none", caughtErrors: "none", varsIgnorePattern: "^_" }],
  "no-dupe-keys": "error",
  "no-dupe-else-if": "error",
  "no-unreachable": "error",
  "no-self-assign": "error",
  "no-redeclare": "error",
  "no-const-assign": "error",
  "no-func-assign": "error",
  "no-import-assign": "error",
  "use-isnan": "error",
  "valid-typeof": "error",
  "no-unsafe-finally": "error",
  "no-sparse-arrays": "error",
  "no-cond-assign": ["error", "except-parens"],
};

export default [
  {
    ignores: [
      "node_modules/**",
      "client/grafik/**",
      "client/karten/**",
      "tools/glb_draufsicht/lib/**",
      "tools_demo/**",
    ],
  },
  {
    files: ["**/*.mjs", "**/*.js"],
    languageOptions: { ecmaVersion: "latest", sourceType: "module", globals: { ...globals.node } },
    rules: regeln,
  },
  {
    files: ["client/**/*.mjs", "client/**/*.js"],
    languageOptions: { globals: { ...globals.browser, Phaser: "readonly", Colyseus: "readonly" } },
  },
  {
    // läuft im Browser (Canvas) bzw. mit DOM-Attrappe im Test
    files: ["tools/panzer_modell/teile.mjs", "tests/aufheben_offen.test.mjs"],
    languageOptions: { globals: { document: "readonly" } },
  },
  {
    files: ["client/sw.js"],
    languageOptions: { globals: { ...globals.serviceworker } },
  },
];
