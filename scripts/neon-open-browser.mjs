import { spawn } from 'node:child_process';

export default async function openSelectedNeonBrowser(url) {
  const executable = process.env.DIAGRAMAI_LOGIN_BROWSER;
  if (!executable) return; // Open the CLI's printed URL in the in-app browser instead.
  const target = new URL(url);
  if (target.protocol !== 'https:' || target.hostname !== 'oauth2.neon.tech') throw new Error('Unexpected Neon OAuth host');
  if (!/[/\\]CocCoc[/\\]Browser[/\\]Application[/\\]browser\.exe$/i.test(executable)) throw new Error('Only explicitly selected Coc Coc is permitted');
  await new Promise((resolve, reject) => {
    const browser = spawn(executable, [target.href], { detached: true, stdio: 'ignore' });
    browser.once('error', reject);
    browser.once('spawn', () => { browser.unref(); resolve(); });
  });
}
