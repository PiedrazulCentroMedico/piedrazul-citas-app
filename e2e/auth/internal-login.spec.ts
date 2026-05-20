import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/portal/interno/login');
  await page.waitForFunction(() => localStorage.getItem('piedrazul-accounts-v2') !== null);
});

test('administrador inicia sesión correctamente', async ({ page }) => {
  await page.getByLabel('Correo corporativo').fill('admin@piedrazul.local');
  await page.locator('[autocomplete="current-password"]').fill('Admin123*');
  await page.getByRole('button', { name: 'Ingresar al portal interno' }).click();

  await page.waitForURL('/portal/interno/citas');
  await expect(page).toHaveURL('/portal/interno/citas');
});

test('médico inicia sesión y accede al portal interno', async ({ page }) => {
  await page.getByLabel('Correo corporativo').fill('medico@piedrazul.local');
  await page.locator('[autocomplete="current-password"]').fill('Medico123*');
  await page.getByRole('button', { name: 'Ingresar al portal interno' }).click();

  await page.waitForURL('/portal/interno/citas');
  await expect(page).toHaveURL('/portal/interno/citas');
});

test('agendador inicia sesión correctamente', async ({ page }) => {
  await page.getByLabel('Correo corporativo').fill('agenda@piedrazul.local');
  await page.locator('[autocomplete="current-password"]').fill('Agenda123*');
  await page.getByRole('button', { name: 'Ingresar al portal interno' }).click();

  await page.waitForURL('/portal/interno/citas');
  await expect(page).toHaveURL('/portal/interno/citas');
});

test('muestra error con contraseña incorrecta', async ({ page }) => {
  await page.getByLabel('Correo corporativo').fill('admin@piedrazul.local');
  await page.locator('[autocomplete="current-password"]').fill('ContraseñaMal1*');
  await page.getByRole('button', { name: 'Ingresar al portal interno' }).click();

  await expect(page.locator('.feedback-card.error')).toBeVisible();
  await expect(page.locator('.feedback-card.error')).toContainText('contraseña');
});

test('muestra error al enviar formulario vacío', async ({ page }) => {
  await page.getByRole('button', { name: 'Ingresar al portal interno' }).click();

  await expect(page.locator('.feedback-card.error')).toBeVisible();
});

test('muestra credenciales demo en modo demo', async ({ page }) => {
  await expect(page.locator('.notice-card')).toBeVisible();
  await expect(page.locator('.notice-card')).toContainText('admin@piedrazul.local');
  await expect(page.locator('.notice-card')).toContainText('medico@piedrazul.local');
});

test('enlace al portal de pacientes es visible', async ({ page }) => {
  await expect(page.getByRole('link', { name: /portal de pacientes/i })).toBeVisible();
});
