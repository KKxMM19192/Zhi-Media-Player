import js from '@eslint/js'
import eslintConfigPrettier from 'eslint-config-prettier'
import pluginVue from 'eslint-plugin-vue'
import tseslint from 'typescript-eslint'
import vueParser from 'vue-eslint-parser'

const runtimeGlobals = {
  Buffer: 'readonly',
  DragEvent: 'readonly',
  Event: 'readonly',
  HTMLAudioElement: 'readonly',
  HTMLElement: 'readonly',
  HTMLInputElement: 'readonly',
  MouseEvent: 'readonly',
  URL: 'readonly',
  __dirname: 'readonly',
  clearTimeout: 'readonly',
  console: 'readonly',
  document: 'readonly',
  globalThis: 'readonly',
  navigator: 'readonly',
  process: 'readonly',
  setTimeout: 'readonly',
  window: 'readonly'
}

export default tseslint.config(
  {
    ignores: ['node_modules/**', 'dist/**', 'out/**']
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...pluginVue.configs['flat/recommended'],
  {
    files: ['**/*.{js,mjs,cjs,ts,mts,cts,vue}'],
    languageOptions: {
      globals: runtimeGlobals
    }
  },
  {
    files: ['**/*.vue'],
    languageOptions: {
      parser: vueParser,
      parserOptions: {
        parser: tseslint.parser,
        ecmaVersion: 'latest',
        sourceType: 'module',
        extraFileExtensions: ['.vue']
      }
    },
    rules: {
      'vue/multi-word-component-names': 'off',
      'vue/require-default-prop': 'off'
    }
  },
  eslintConfigPrettier
)
