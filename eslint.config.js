import js from "@eslint/js";

export default [
  // Archivos a analizar
  {
    files: ["src/**/*.js", "*.js"],
  },

  // Archivos a ignorar
  {
    ignores: ["node_modules/**", "swagger-output.json"],
  },

  // Reglas base de JS
  js.configs.recommended,

  // Entorno Node.js 18+ y globals nativos
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        // Node.js globals
        process: "readonly",
        console: "readonly",
        Buffer: "readonly",
        __dirname: "readonly",
        __filename: "readonly",
        global: "readonly",
        // Web APIs disponibles en Node 18+
        fetch: "readonly",
        URL: "readonly",
        URLSearchParams: "readonly",
        setTimeout: "readonly",
        setInterval: "readonly",
        clearTimeout: "readonly",
        clearInterval: "readonly",
        // Test globals
        describe: "readonly",
        it: "readonly",
        expect: "readonly",
        beforeAll: "readonly",
        afterAll: "readonly",
        beforeEach: "readonly",
        afterEach: "readonly",
        jest: "readonly",
      },
    },
    rules: {
      // Variables
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      "no-undef": "error",

      // Calidad de código
      "no-console": ["warn", { allow: ["warn", "error", "info"] }],
      "no-debugger": "error",

      // Bugs comunes
      "no-unreachable": "error",
      "no-constant-condition": "warn",
      "no-empty": "warn",
      "no-useless-escape": "warn",
      "no-useless-assignment": "warn",

      // Async
      "no-async-promise-executor": "error",
      "require-await": "warn",
    },
  },
];
