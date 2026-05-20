import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/crear-cuenta');
  await page.waitForFunction(() => localStorage.getItem('piedrazul-accounts-v2') !== null);
});

test('paciente nuevo se registra exitosamente', async ({ page }) => {
  const uniqueDoc = `7${Date.now().toString().slice(-9)}`;

  await page.getByLabel('Cédula').fill(uniqueDoc);
  await page.getByLabel('Nombres').fill('Carlos');
  await page.getByLabel('Apellidos').fill('Muñoz');
  await page.locator('[autocomplete="new-password"]').first().fill('Segura123*');
  await page.locator('[autocomplete="new-password"]').last().fill('Segura123*');
  await page.getByRole('button', { name: 'Crear cuenta' }).click();

  await page.waitForURL('/portal/paciente/perfil');
  await expect(page).toHaveURL('/portal/paciente/perfil');
});

test('muestra error con cédula demasiado corta', async ({ page }) => {
  await page.getByLabel('Cédula').fill('123');
  await page.getByLabel('Nombres').fill('Ana');
  await page.getByLabel('Apellidos').fill('López');
  await page.locator('[autocomplete="new-password"]').first().fill('Segura123*');
  await page.locator('[autocomplete="new-password"]').last().fill('Segura123*');
  await page.getByRole('button', { name: 'Crear cuenta' }).click();

  await expect(page.locator('.feedback-card.error')).toBeVisible();
  await expect(page.locator('.feedback-card.error')).toContainText('cédula');
});

test('muestra error con contraseña sin mayúscula', async ({ page }) => {
  await page.getByLabel('Cédula').fill('12345678');
  await page.getByLabel('Nombres').fill('Ana');
  await page.getByLabel('Apellidos').fill('López');
  await page.locator('[autocomplete="new-password"]').first().fill('sinmayuscula1*');
  await page.locator('[autocomplete="new-password"]').last().fill('sinmayuscula1*');
  await page.getByRole('button', { name: 'Crear cuenta' }).click();

  await expect(page.locator('.feedback-card.error')).toBeVisible();
  await expect(page.locator('.feedback-card.error')).toContainText('contraseña');
});

test('muestra error cuando la confirmación no coincide', async ({ page }) => {
  await page.getByLabel('Cédula').fill('12345678');
  await page.getByLabel('Nombres').fill('Ana');
  await page.getByLabel('Apellidos').fill('López');
  await page.locator('[autocomplete="new-password"]').first().fill('Segura123*');
  await page.locator('[autocomplete="new-password"]').last().fill('Diferente123*');
  await page.getByRole('button', { name: 'Crear cuenta' }).click();

  await expect(page.locator('.feedback-card.error')).toBeVisible();
  await expect(page.locator('.feedback-card.error')).toContainText('confirmación');
});

test('muestra error al intentar registrar una cédula ya existente', async ({ page }) => {
  await page.getByLabel('Cédula').fill('1000000001');
  await page.getByLabel('Nombres').fill('Ana');
  await page.getByLabel('Apellidos').fill('López');
  await page.locator('[autocomplete="new-password"]').first().fill('Segura123*');
  await page.locator('[autocomplete="new-password"]').last().fill('Segura123*');
  await page.getByRole('button', { name: 'Crear cuenta' }).click();

  await expect(page.locator('.feedback-card.error')).toBeVisible();
  await expect(page.locator('.feedback-card.error')).toContainText('cédula');
});

test('enlace a iniciar sesión es visible en el formulario', async ({ page }) => {
  await expect(page.locator('.auth-links').getByRole('link', { name: 'Iniciar sesión' })).toBeVisible();
});
