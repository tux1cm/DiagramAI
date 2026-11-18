import { registerHooks } from 'node:module';

// Opt-in preload for Neon login only: never launch the OS-default browser.
// Optionally launch the explicitly selected Coc Coc executable; otherwise use Review.
// Does not change PKCE, state validation, timeout, callback or credential storage.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'open' && /\/neon\/dist\/auth\.js$/.test(context.parentURL ?? '')) {
      return { shortCircuit: true, url: new URL('./neon-open-browser.mjs', import.meta.url).href };
    }
    return nextResolve(specifier, context);
  },
});
