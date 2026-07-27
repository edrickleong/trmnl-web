import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  // Vendored Fluid Functionalism registry code — installed via the shadcn CLI
  // and re-fetched on update, so we don't lint or hand-edit it.
  globalIgnores([
    'dist',
    'src/components/ui/**',
    'src/hooks/use-proximity-hover.ts',
    'src/lib/elevated.tsx',
    'src/lib/font-weight.ts',
    'src/lib/icon-context.tsx',
    'src/lib/shape-context.tsx',
    'src/lib/springs.ts',
    'src/lib/surface-classes.ts',
    'src/lib/surface-context.tsx',
  ]),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
  },
])
