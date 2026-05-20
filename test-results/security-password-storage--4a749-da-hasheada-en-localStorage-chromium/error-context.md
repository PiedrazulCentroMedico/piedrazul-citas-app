# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: security\password-storage.spec.ts >> la contraseña de un paciente recién registrado queda hasheada en localStorage
- Location: e2e\security\password-storage.spec.ts:38:1

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: locator.fill: Test timeout of 30000ms exceeded.
Call log:
  - waiting for getByLabel('Cédula')

```

# Test source

```ts
  1  | import { expect, test } from '@playwright/test';
  2  | 
  3  | const HASH_PATTERN = /^[0-9a-f]{32}:[0-9a-f]{64}$/;
  4  | 
  5  | test.beforeEach(async ({ page }) => {
  6  |   await page.goto('/');
  7  |   await page.waitForFunction(() => localStorage.getItem('piedrazul-accounts-v2') !== null);
  8  | });
  9  | 
  10 | test('las contraseñas de las cuentas semilla no están en texto plano en localStorage', async ({ page }) => {
  11 |   const accounts = await page.evaluate(() => {
  12 |     const raw = localStorage.getItem('piedrazul-accounts');
  13 |     return raw ? JSON.parse(raw) : [];
  14 |   });
  15 | 
  16 |   expect(accounts.length).toBeGreaterThan(0);
  17 | 
  18 |   const plainPasswords = ['Admin123*', 'Medico123*', 'Paciente123*', 'Agenda123*'];
  19 | 
  20 |   for (const account of accounts) {
  21 |     expect(plainPasswords).not.toContain(account.password);
  22 |   }
  23 | });
  24 | 
  25 | test('las contraseñas almacenadas tienen formato de hash PBKDF2 (sal:hash)', async ({ page }) => {
  26 |   const accounts = await page.evaluate(() => {
  27 |     const raw = localStorage.getItem('piedrazul-accounts');
  28 |     return raw ? JSON.parse(raw) : [];
  29 |   });
  30 | 
  31 |   expect(accounts.length).toBeGreaterThan(0);
  32 | 
  33 |   for (const account of accounts) {
  34 |     expect(account.password).toMatch(HASH_PATTERN);
  35 |   }
  36 | });
  37 | 
  38 | test('la contraseña de un paciente recién registrado queda hasheada en localStorage', async ({ page }) => {
  39 |   const uniqueDoc = `8${Date.now().toString().slice(-9)}`;
  40 |   const plainPassword = 'MiClave123*';
  41 | 
  42 |   await page.goto('/crear-cuenta');
  43 |   await page.waitForFunction(() => localStorage.getItem('piedrazul-accounts-v2') !== null);
  44 | 
> 45 |   await page.getByLabel('Cédula').fill(uniqueDoc);
     |                                   ^ Error: locator.fill: Test timeout of 30000ms exceeded.
  46 |   await page.getByLabel('Nombres').fill('Luis');
  47 |   await page.getByLabel('Apellidos').fill('Torres');
  48 |   await page.locator('[autocomplete="new-password"]').first().fill(plainPassword);
  49 |   await page.locator('[autocomplete="new-password"]').last().fill(plainPassword);
  50 |   await page.getByRole('button', { name: 'Crear cuenta' }).click();
  51 |   await page.waitForURL('/portal/paciente/perfil');
  52 | 
  53 |   const accounts = await page.evaluate(() => {
  54 |     const raw = localStorage.getItem('piedrazul-accounts');
  55 |     return raw ? JSON.parse(raw) : [];
  56 |   });
  57 | 
  58 |   const newAccount = accounts.find((a: { documentNumber: string }) => a.documentNumber === uniqueDoc);
  59 |   expect(newAccount).toBeDefined();
  60 |   expect(newAccount.password).not.toBe(plainPassword);
  61 |   expect(newAccount.password).toMatch(HASH_PATTERN);
  62 | });
  63 | 
  64 | test('la sesión activa en localStorage no contiene contraseña', async ({ page }) => {
  65 |   await page.goto('/iniciar-sesion');
  66 |   await page.waitForFunction(() => localStorage.getItem('piedrazul-accounts-v2') !== null);
  67 | 
  68 |   await page.getByLabel('Número de cédula').fill('1000000001');
  69 |   await page.locator('[autocomplete="current-password"]').fill('Paciente123*');
  70 |   await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  71 |   await page.waitForURL('/portal/paciente');
  72 | 
  73 |   const session = await page.evaluate(() => {
  74 |     const raw = localStorage.getItem('piedrazul-patient-session');
  75 |     return raw ? JSON.parse(raw) : null;
  76 |   });
  77 | 
  78 |   expect(session).not.toBeNull();
  79 |   expect(session.password).toBeUndefined();
  80 |   expect(Object.keys(session)).not.toContain('password');
  81 | });
  82 | 
```