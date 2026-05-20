import { expect, test } from '@playwright/test';

const PROVIDER_ID = 'prov-1';

const MOCK_PROVIDERS = [
  { id: PROVIDER_ID, fullName: 'Dr. Juan Pérez', specialty: 'Medicina General' },
];

const MOCK_SLOTS = [
  { startTime: '09:00', endTime: '09:30', available: true },
  { startTime: '09:30', endTime: '10:00', available: false },
  { startTime: '10:00', endTime: '10:30', available: true },
];

const MOCK_APPOINTMENT = {
  id: 'appt-uuid-1',
  patientFullName: 'Carlos Muñoz',
  providerName: 'Dr. Juan Pérez',
  specialty: 'Medicina General',
  appointmentDate: '2026-05-22',
  startTime: '09:00',
  status: 'Scheduled',
};

function tomorrowDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().split('T')[0];
}

test.beforeEach(async ({ page }) => {
  await page.route('**/api/public/providers', (route) =>
    route.fulfill({ json: MOCK_PROVIDERS }),
  );
  await page.route(`**/api/public/providers/${PROVIDER_ID}/availability**`, (route) =>
    route.fulfill({ json: MOCK_SLOTS }),
  );
  await page.route('**/api/public/patients/lookup**', (route) =>
    route.fulfill({
      json: { exists: false, id: null, firstName: null, lastName: null, gender: null, maskedPhone: null, maskedEmail: null, birthYear: null },
    }),
  );
  await page.route('**/api/public/appointments', (route) =>
    route.fulfill({ json: MOCK_APPOINTMENT }),
  );
});

test('la página de reserva carga y muestra el selector de profesional', async ({ page }) => {
  await page.goto('/reservar');
  await expect(page.getByRole('heading', { name: /agenda tu cita/i })).toBeVisible();
  await expect(page.getByLabel('Profesional')).toBeVisible();
});

test('paso 1 — verificar cédula desbloquea el formulario de datos', async ({ page }) => {
  await page.goto('/reservar');

  await page.getByLabel('Número de cédula').first().fill('55512345678');
  await page.getByRole('button', { name: 'Verificar cédula' }).click();

  await expect(page.locator('.feedback-card.success')).toBeVisible();
  await expect(page.getByLabel('Nombres')).toBeEnabled();
  await expect(page.getByLabel('Apellidos')).toBeEnabled();
});

test('paso 3 — al seleccionar profesional y fecha se muestran franjas horarias', async ({ page }) => {
  await page.goto('/reservar');

  await page.getByLabel('Número de cédula').first().fill('55512345678');
  await page.getByRole('button', { name: 'Verificar cédula' }).click();
  await expect(page.locator('.feedback-card.success')).toBeVisible();

  await page.getByLabel('Profesional').selectOption(PROVIDER_ID);
  await page.getByLabel('Fecha').last().fill(tomorrowDate());

  await expect(page.locator('.slot-button').first()).toBeVisible();
});

test('flujo completo — reserva como invitado y muestra modal de confirmación', async ({ page }) => {
  await page.goto('/reservar');

  // Paso 1: verificar cédula
  await page.getByLabel('Número de cédula').first().fill('55512345678');
  await page.getByRole('button', { name: 'Verificar cédula' }).click();
  await expect(page.locator('.feedback-card.success')).toBeVisible();

  // Paso 2: datos del paciente
  await page.getByLabel('Nombres').fill('Carlos');
  await page.getByLabel('Apellidos').fill('Muñoz');
  await page.getByLabel('Celular').fill('3001234567');
  await page.getByLabel('Género').selectOption('Male');
  await page.getByLabel('Fecha de nacimiento').fill('1990-05-15');

  // Paso 3: profesional y fecha
  await page.getByLabel('Profesional').selectOption(PROVIDER_ID);
  await page.getByLabel('Fecha').last().fill(tomorrowDate());

  // Paso 4: seleccionar franja disponible
  await page.locator('.slot-button:not([disabled])').first().click();

  // Captcha
  const captchaLabel = await page.locator('label', { hasText: '¿Cuánto es' }).textContent();
  const match = captchaLabel?.match(/¿Cuánto es (\d+) \+ (\d+)\?/);
  if (match) {
    const answer = parseInt(match[1]) + parseInt(match[2]);
    await page.locator('label', { hasText: '¿Cuánto es' }).locator('input').fill(String(answer));
  }

  // Confirmar
  await page.getByRole('button', { name: 'Confirmar reserva' }).click();

  // Modal de confirmación
  await expect(page.locator('.modal-card')).toBeVisible();
  await expect(page.locator('.modal-card')).toContainText('Reserva confirmada');
  await expect(page.locator('.modal-card')).toContainText('Dr. Juan Pérez');
  await expect(page.locator('.modal-card')).toContainText('Medicina General');
});

test('muestra error si se intenta confirmar sin seleccionar franja horaria', async ({ page }) => {
  await page.goto('/reservar');

  await page.getByLabel('Número de cédula').first().fill('55512345678');
  await page.getByRole('button', { name: 'Verificar cédula' }).click();
  await expect(page.locator('.feedback-card.success')).toBeVisible();

  await page.getByLabel('Nombres').fill('Carlos');
  await page.getByLabel('Apellidos').fill('Muñoz');
  await page.getByLabel('Celular').fill('3001234567');
  await page.getByLabel('Género').selectOption('Male');
  await page.getByLabel('Fecha de nacimiento').fill('1990-05-15');
  await page.getByLabel('Profesional').selectOption(PROVIDER_ID);
  await page.getByLabel('Fecha').last().fill(tomorrowDate());

  await page.getByRole('button', { name: 'Confirmar reserva' }).click();

  await expect(page.locator('.feedback-card.error')).toBeVisible();
  await expect(page.locator('.feedback-card.error')).toContainText('franja');
});
