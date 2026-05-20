import { expect, test } from '@playwright/test';

const CEDULA_DEMO = '1000000001';
const PASSWORD_DEMO = 'Paciente123*';

test.beforeEach(async ({ page }) => {
  await page.goto('/iniciar-sesion');
  await page.waitForFunction(() => localStorage.getItem('piedrazul-accounts-v2') !== null);
});

test('paciente inicia sesión con cédula y contraseña correctas', async ({ page }) => {
  await page.getByLabel('Número de cédula').fill(CEDULA_DEMO);
  await page.locator('[autocomplete="current-password"]').fill(PASSWORD_DEMO);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();

  await page.waitForURL('/portal/paciente');
  await expect(page).toHaveURL('/portal/paciente');
});

test('muestra error con contraseña incorrecta', async ({ page }) => {
  await page.getByLabel('Número de cédula').fill(CEDULA_DEMO);
  await page.locator('[autocomplete="current-password"]').fill('ContraseñaEquivocada1*');
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();

  await expect(page.locator('.feedback-card.error')).toBeVisible();
  await expect(page.locator('.feedback-card.error')).toContainText('contraseña');
});

test('muestra error con cédula inexistente', async ({ page }) => {
  await page.getByLabel('Número de cédula').fill('99999999');
  await page.locator('[autocomplete="current-password"]').fill(PASSWORD_DEMO);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();

  await expect(page.locator('.feedback-card.error')).toBeVisible();
});

test('muestra error al enviar formulario vacío', async ({ page }) => {
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();

  await expect(page.locator('.feedback-card.error')).toBeVisible();
});

test('la contraseña se puede revelar con el toggle', async ({ page }) => {
  await page.locator('[autocomplete="current-password"]').fill(PASSWORD_DEMO);

  const passwordInput = page.locator('[autocomplete="current-password"]');
  await expect(passwordInput).toHaveAttribute('type', 'password');

  await page.getByLabel('Mostrar contraseña').check();
  await expect(passwordInput).toHaveAttribute('type', 'text');
});

test('enlace a recuperar contraseña es visible', async ({ page }) => {
  await expect(page.getByRole('link', { name: /olvidé/i })).toBeVisible();
});

test('enlace a crear cuenta es visible en el formulario', async ({ page }) => {
  await expect(page.locator('.auth-links').getByRole('link', { name: 'Crear cuenta' })).toBeVisible();
});
