// Firefox content scripts can't be declared as ES modules, so this file is a
// deliberately import-free classic script — it's copied into dist-firefox/
// verbatim by scripts/build-firefox.mjs, never passed through Vite. Its only
// job is to bridge into a real module graph: browser.runtime.getURL() turns
// the bare filename into an moz-extension://<id>/... URL, and the resulting
// dynamic import() evaluates picker.js as a genuine ES module — from that
// point on, picker.js's own relative dynamic import('./tools') resolves
// against ITS OWN module URL rather than the host page's, exactly like the
// loader CRXJS auto-generates for the Chrome build.
(function () {
  (async () => {
    await import(browser.runtime.getURL('picker.js'));
  })().catch(console.error);
})();
