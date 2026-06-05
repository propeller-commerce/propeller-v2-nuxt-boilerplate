import type { Config } from 'tailwindcss';

// Tailwind v4 picks the design tokens up from propeller-v2-vue-ui/styles.css
// (@theme inline block). This config exists only so the @nuxtjs/tailwindcss
// module finds template paths to scan for class names.
export default {
  content: [
    './app/**/*.{vue,js,ts,jsx,tsx}',
    './node_modules/propeller-v2-vue-ui/dist/**/*.{vue,js,mjs,cjs}',
  ],
  theme: { extend: {} },
  plugins: [],
} satisfies Config;
