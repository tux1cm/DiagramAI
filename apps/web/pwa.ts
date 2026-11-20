import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import type { Plugin } from 'vite';

// Static app shell only: no runtime API, graph, credential or document caching.
export function pwa(base: string): Plugin {
  let output = '';
  return {
    name: 'diagramai-static-offline',
    apply: 'build',
    configResolved(config) { output = resolve(config.root, config.build.outDir); },
    async closeBundle() {
      if (process.env.DIAGRAMAI_DESKTOP_BUILD === '1') return;
      const files: string[] = [];
      async function walk(directory: string) {
        for (const entry of await readdir(directory, { withFileTypes: true })) {
          const path = resolve(directory, entry.name), name = relative(output, path).replaceAll('\\', '/');
          if (entry.isDirectory()) { if (name !== 'reference') await walk(path); }
          else if (name !== 'sw.js') files.push(name);
        }
      }
      await walk(output); files.sort();
      const hash = createHash('sha256');
      for (const file of files) hash.update(await readFile(resolve(output, file)));
      const prefix = `diagramai-shell-${base}-`, cache = `${prefix}${hash.digest('hex').slice(0, 16)}`;
      await writeFile(resolve(output, 'sw.js'), `const CACHE=${JSON.stringify(cache)},PREFIX=${JSON.stringify(prefix)},BASE=${JSON.stringify(base)},FILES=${JSON.stringify(files.map((file) => base + file))};
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(FILES))));
// Do not skipWaiting or force reload: an editor may contain unsaved work.
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith(PREFIX)&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);
 if(event.request.method!=='GET'||url.origin!==self.location.origin||url.search)return;
 const file=event.request.mode==='navigate'&&url.pathname===BASE?BASE+'index.html':url.pathname;
 if(!FILES.includes(file))return;
 event.respondWith(caches.open(CACHE).then(cache=>cache.match(file)).then(hit=>hit||fetch(event.request)));
});`);
    },
  };
}
