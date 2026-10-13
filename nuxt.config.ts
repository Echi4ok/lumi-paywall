export default defineNuxtConfig({
  compatibilityDate: '2026-10-13',
  devtools: { enabled: false },
  modules: ['@nuxt/eslint'],
  css: ['~/assets/css/main.css'],
  typescript: { strict: true, typeCheck: false },
  app: {
    head: {
      htmlAttrs: { lang: 'ru' },
      title: 'Луми — большой мир маленьких открытий',
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
        {
          name: 'description',
          content: 'Откройте все приключения Луми. Учебный paywall: без настоящих платежей.',
        },
        { name: 'theme-color', content: '#f8f6ff' },
      ],
    },
  },
  routeRules: { '/api/**': { headers: { 'cache-control': 'private, no-store' } } },
})
