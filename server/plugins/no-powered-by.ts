/** Nuxt's page renderer announces itself (`x-powered-by: Nuxt`); nothing needs that header (#16). */
export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('render:response', (response) => {
    delete response.headers['x-powered-by'];
  });
});
