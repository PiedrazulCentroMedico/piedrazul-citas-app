import { expect, test } from '@playwright/test';

const HASH_PATTERN = /^[0-9a-f]{32}:[0-9a-f]{64}$/;

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => localStorage.getItem('piedrazul-accounts-v2') !== null);
});

test('las contraseñas de las cuentas semilla no están en texto plano en localStorage', async ({ page }) => {
  const accounts = await page.evaluate(() => {
    const raw = localStorage.getItem('piedrazul-accounts');
    return raw ? JSON.parse(raw) : [];
  });

  expect(accounts.length).toBeGreaterThan(0);

  const plainPasswords = ['Admin123*', 'Medico123*', 'Paciente123*', 'Agenda123*'];

  for (const account of accounts) {
    expect(plainPasswords).not.toContain(account.password);
  }
});

test('las contraseñas almacenadas tienen formato de hash PBKDF2 (sal:hash)', async ({ page }) => {
  const accounts = await page.evaluate(() => {
    const raw = localStorage.getItem('piedrazul-accounts');
    return raw ? JSON.parse(raw) : [];
  });

  expect(accounts.length).toBeGreaterThan(0);

  for (const account of accounts) {
    expect(account.password).toMatch(HASH_PATTERN);
  }
});

test('la contraseña de un paciente recién registrado queda hasheada en localStorage', async ({ page }) => {
  const uniqueDoc = `8${Date.now().toString().slice(-9)}`;
  const plainPassword = 'MiClave123*';

  await page.goto('/crear-cuenta');
  await page.waitForFunction(() => localStorage.getItem('piedrazul-accounts-v2') !== null);

  await page.getByLabel('Cédula').fill(uniqueDoc);
  await page.getByLabel('Nombres').fill('Luis');
  await page.getByLabel('Apellidos').fill('Torres');
  await page.locator('[autocomplete="new-password"]').first().fill(plainPassword);
  await page.locator('[autocomplete="new-password"]').last().fill(plainPassword);
  await page.getByRole('button', { name: 'Crear cuenta' }).click();
  await page.waitForURL('/portal/paciente/perfil');

  const accounts = await page.evaluate(() => {
    const raw = localStorage.getItem('piedrazul-accounts');
    return raw ? JSON.parse(raw) : [];
  });

  const newAccount = accounts.find((a: { documentNumber: string }) => a.documentNumber === uniqueDoc);
  expect(newAccount).toBeDefined();
  expect(newAccount.password).not.toBe(plainPassword);
  expect(newAccount.password).toMatch(HASH_PATTERN);
});

test('la sesión activa en localStorage no contiene contraseña', async ({ page }) => {
  await page.goto('/iniciar-sesion');
  await page.waitForFunction(() => localStorage.getItem('piedrazul-accounts-v2') !== null);

  await page.getByLabel('Número de cédula').fill('1000000001');
  await page.locator('[autocomplete="current-password"]').fill('Paciente123*');
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await page.waitForURL('/portal/paciente');

  const session = await page.evaluate(() => {
    const raw = localStorage.getItem('piedrazul-patient-session');
    return raw ? JSON.parse(raw) : null;
  });

  expect(session).not.toBeNull();
  expect(session.password).toBeUndefined();
  expect(Object.keys(session)).not.toContain('password');
});
