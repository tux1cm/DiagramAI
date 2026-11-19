import { readFile, writeFile } from 'node:fs/promises';

const source = await readFile(new URL('../design/reference/DiagramAI_Mockup.html', import.meta.url), 'utf8');
const css = source.match(/<style>([\s\S]*?)<\/style>/)?.[1];
if (!css) throw new Error('Reference CSS missing');
const generated = `/* Generated from the approved mockup. Put P1-specific rules in styles.css. */\n${css.replace(/\r\n/g, '\n').replace(/}/g, '}\n').trim()}\n`;
const destination = new URL('../packages/ui/src/reference.css', import.meta.url);
let existing;
try { existing = await readFile(destination, 'utf8'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
if (existing !== undefined && existing !== generated) throw new Error('Derived CSS diverged: review before overwriting.');
if (process.argv.includes('--check')) {
  if (existing !== generated) throw new Error('Run npm run prepare:reference first');
} else if (existing === undefined) {
  await writeFile(destination, generated);
}
console.log('Approved UI CSS verified (no reference edits).');
