import { expect, test } from '@playwright/test';
import { createWorkspace, connectWorkspace, openLibrary, closeLibrary, updateLibrary } from '../helpers/workspace';

test('owner card deletion confirms affected drawings and propagates without deleting local backups', async ({ page, browser, baseURL }) => {
  const source = await createWorkspace(page);
  const context = await browser.newContext({ baseURL }), other = await context.newPage();
  try {
    await connectWorkspace(other, source.link);
    await expect(other.getByRole('button', { name: 'Dự án đầu tiên', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Dự án đầu tiên', exact: true }).click();
    await page.getByRole('button', { name: `Xóa bản vẽ ${source.title}`, exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Xác nhận xóa' });
    await expect(dialog).toContainText('Sẽ xóa 1 bản vẽ');
    await expect(dialog.getByRole('button', { name: 'Xác nhận xóa', exact: true })).toBeDisabled();
    await dialog.getByRole('button', { name: 'Hủy', exact: true }).click();
    await expect(page.getByRole('button', { name: `Mở bản vẽ ${source.title}`, exact: true })).toBeVisible();
    await page.getByRole('button', { name: `Xóa bản vẽ ${source.title}`, exact: true }).click();
    await dialog.getByRole('checkbox').check(); await dialog.getByRole('button', { name: 'Xác nhận xóa', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole('button', { name: `Mở bản vẽ ${source.title}`, exact: true })).toHaveCount(0);
    await updateLibrary(other);
    await other.getByRole('button', { name: 'Dự án đầu tiên', exact: true }).click();
    await expect(other.getByRole('button', { name: `Mở bản vẽ ${source.title}`, exact: true })).toHaveCount(0);
    await page.locator('.workspace-surface').getByRole('button', { name: 'Kho', exact: true }).click();
    await page.getByRole('button', { name: 'Xóa Project Dự án đầu tiên', exact: true }).click();
    await expect(dialog).toContainText('Sẽ xóa 0 bản vẽ');
    await dialog.getByRole('checkbox').check(); await dialog.getByRole('button', { name: 'Xác nhận xóa', exact: true }).click();
    await expect(dialog).toHaveCount(0); await updateLibrary(other);
    await openLibrary(other);
    await expect(other.getByRole('button', { name: 'Dự án đầu tiên', exact: true })).toHaveCount(0);
    await other.reload(); await openLibrary(other); await updateLibrary(other);
    await expect(other.getByRole('button', { name: 'Dự án đầu tiên', exact: true })).toHaveCount(0);
    await other.getByRole('button', { name: 'File / Bản vẽ chỉ trên máy / Checkpoint', exact: true }).click();
    await expect(other.locator('.project-list')).toContainText(source.title);
    await closeLibrary(other);
  } finally { await context.close(); }
});
