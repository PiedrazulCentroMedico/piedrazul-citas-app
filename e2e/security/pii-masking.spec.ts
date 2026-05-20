import { expect, test } from '@playwright/test';

const MOCK_PROVIDERS = [
  { id: 'prov-1', fullName: 'Dr. Juan Pérez', specialty: 'Medicina General' },
];

const MOCK_LOOKUP_WITH_DATA = {
  exists: true,
  id: 'patient-uuid-1',
  firstName: 'Ana',
  lastName: 'García',
  gender: 'Female',
  maskedPhone: '*** ***-4567',
  maskedEmail: 'a****@gmail.com',
  birthYear: 1990,
};

const MOCK_LOOKUP_NOT_FOUND = {
  exists: false, id: null, firstName: null, lastName: null,
  gender: null, maskedPhone: null, maskedEmail: null, birthYear: null,
};

test.beforeEach(async ({ page }) => {
  await page.route('**/api/public/providers', (route) =>
    route.fulfill({ json: MOCK_PROVIDERS }),
  );
});

test('el lookup público devuelve teléfono enmascarado, nunca el número real', async ({ page }) => {
  await page.route('**/api/public/patients/lookup**', (route) =>
    route.fulfill({ json: MOCK_LOOKUP_WITH_DATA }),
  );

  await page.goto('/reservar');
  await page.getByLabel('Número de cédula').first().fill('1000000001');
  await page.getByRole('button', { name: 'Verificar cédula' }).click();

  await expect(page.locator('text=*** ***-4567')).toBeVisible();
  await expect(page.locator('text=3001234567')).not.toBeVisible();
});

test('el lookup público devuelve correo enmascarado, nunca el correo real', async ({ page }) => {
  await page.route('**/api/public/patients/lookup**', (route) =>
    route.fulfill({ json: MOCK_LOOKUP_WITH_DATA }),
  );

  await page.goto('/reservar');
  await page.getByLabel('Número de cédula').first().fill('1000000001');
  await page.getByRole('button', { name: 'Verificar cédula' }).click();

  await expect(page.locator('text=a****@gmail.com')).toBeVisible();
  await expect(page.locator('text=ana@gmail.com')).not.toBeVisible();
});

test('el lookup público expone solo el año de nacimiento, no la fecha completa', async ({ page }) => {
  await page.route('**/api/public/patients/lookup**', (route) =>
    route.fulfill({ json: MOCK_LOOKUP_WITH_DATA }),
  );

  await page.goto('/reservar');
  await page.getByLabel('Número de cédula').first().fill('1000000001');
  await page.getByRole('button', { name: 'Verificar cédula' }).click();

  await expect(page.locator('text=1990')).toBeVisible();
  await expect(page.locator('text=1990-03-15')).not.toBeVisible();
});

test('cuando la cédula no existe el formulario queda desbloqueado para ingresar datos nuevos', async ({ page }) => {
  await page.route('**/api/public/patients/lookup**', (route) =>
    route.fulfill({ json: MOCK_LOOKUP_NOT_FOUND }),
  );

  await page.goto('/reservar');
  await page.getByLabel('Número de cédula').first().fill('9999999999');
  await page.getByRole('button', { name: 'Verificar cédula' }).click();

  await expect(page.locator('.feedback-card.success')).toBeVisible();
  await expect(page.getByLabel('Nombres')).toBeEnabled();
});

test('los campos de datos personales están bloqueados antes de verificar la cédula', async ({ page }) => {
  await page.goto('/reservar');

  await expect(page.getByLabel('Nombres')).toBeDisabled();
  await expect(page.getByLabel('Apellidos')).toBeDisabled();
});
