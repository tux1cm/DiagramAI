import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const root = new URL('../', import.meta.url);
const source = await readFile(new URL('DiagramAI_Mockup.html', root));
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
for (const name of ['design/reference/DiagramAI_Mockup.html', 'apps/web/public/reference/DiagramAI_Mockup.html']) {
  const destination = new URL(name, root);
  if (process.argv.includes('--check')) {
    const copy = await readFile(destination);
    if (!copy.equals(source)) throw new Error(`Reference changed: ${name}`);
  } else {
    await mkdir(new URL('./', destination), { recursive: true });
    // Do not overwrite a diverged design reference: it could be user work.
    if (name.startsWith('design/')) {
      const existing = await readFile(destination).catch((error) => {
        if (error.code !== 'ENOENT') throw error;
        return null;
      });
      if (existing && !existing.equals(source)) throw new Error(`Review diverged reference first: ${name}`);
    }
    await writeFile(destination, source);
  }
}
console.log(`Reference SHA-256: ${hash(source)} (${fileURLToPath(root)})`);
