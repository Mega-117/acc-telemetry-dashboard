// eslint.config.mjs — Flat Config (ESLint 9+)
// Nuxt FE / Vue 3 + TypeScript
//
// Obiettivo qualità (Phase 3):
//   - max-lines a 550 per .vue (training-overlay.vue è a 531), target definitivo 300
//   - max-lines a 400 per .ts (nuovi composables Phase 3 ≤ 130 righe)
//   - TypeScript strict già attivo via tsconfig → solo regole @typescript-eslint
//     senza duplicare i controlli del compilatore
//   - Regole type-aware abilitate (project: './tsconfig.json')
//
// Progressione soglie:
//   Phase 1: .vue 900 / .ts 400
//   Phase 2: .vue 700 / .ts 400
//   Phase 3: .vue 550 / .ts 400
//   Phase 4: .vue 550 / .ts 400 (nuovi file estratti ≤ 350 righe)
//   Phase 5 (target): .vue 300 / .ts 300

import pluginVue from 'eslint-plugin-vue'
import tsParser from '@typescript-eslint/parser'
import tsPlugin from '@typescript-eslint/eslint-plugin'
import vueParser from 'vue-eslint-parser'

/** @type {import('eslint').Linter.Config[]} */
export default [
  // ── Global ignores ───────────────────────────────────────────────────────────
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      '.nuxt/**',
      '.output/**',
      'public/**',
      '*.config.mjs',        // questo file stesso
      'scripts/**',
    ],
  },

  // ── Vue SFC — eslint-plugin-vue (recommended) ────────────────────────────────
  ...pluginVue.configs['flat/recommended'],
  {
    files: ['app/**/*.vue'],
    languageOptions: {
      parser: vueParser,
      parserOptions: {
        parser: tsParser,
        sourceType: 'module',
        extraFileExtensions: ['.vue'],
      },
    },
    rules: {
      // ── Dimensioni file ──────────────────────────────────────────────────
      // Phase-3 budget: 550 righe (training-overlay.vue è a 531).
      // TODO: abbassare a 300 nella fase 4 dopo split template residuo
      'max-lines': ['error', { max: 550, skipBlankLines: true, skipComments: true }],

      // ── Qualità Vue ──────────────────────────────────────────────────────
      'vue/multi-word-component-names': 'warn',
      'vue/no-unused-vars': 'error',
      'vue/no-v-html': 'warn',
      'vue/require-v-for-key': 'error',
      'vue/no-use-v-if-with-v-for': 'error',
      'vue/component-api-style': ['warn', ['script-setup', 'composition']],

      // ── Stile ────────────────────────────────────────────────────────────
      'vue/html-indent': ['warn', 2],
      'vue/html-self-closing': ['warn', {
        html: { void: 'always', normal: 'never', component: 'always' },
        svg: 'always',
        math: 'always',
      }],
    },
  },

  // ── TypeScript (composables, stores, services, utils) ────────────────────────
  {
    files: ['app/**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        sourceType: 'module',
        project: './tsconfig.json',
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
    rules: {
      // ── Dimensioni file ──────────────────────────────────────────────────
      // Composables / services max 400 righe
      'max-lines': ['error', { max: 400, skipBlankLines: true, skipComments: true }],

      // ── TypeScript base (non type-aware) ──────────────────────────────────
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': ['warn', { prefer: 'type-imports' }],
      '@typescript-eslint/no-non-null-assertion': 'warn',

      // ── TypeScript type-aware (richiedono project: tsconfig.json) ─────────
      '@typescript-eslint/no-floating-promises': 'warn',
      '@typescript-eslint/await-thenable': 'warn',
      '@typescript-eslint/no-misused-promises': 'warn',

      // ── Sicurezza base ───────────────────────────────────────────────────
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'no-debugger': 'error',
    },
  },

  // ── Test files — regole rilassate ─────────────────────────────────────────────
  {
    files: ['tests/**/*.ts', 'tests/**/*.spec.ts', 'tests/**/*.test.ts'],
    rules: {
      'max-lines': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
]
