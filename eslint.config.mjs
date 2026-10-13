import withNuxt from './.nuxt/eslint.config.mjs'

export default withNuxt({
  ignores: ['design/**'],
  // Prettier owns template whitespace and void-element formatting.
  rules: { 'vue/html-self-closing': 'off' },
})
