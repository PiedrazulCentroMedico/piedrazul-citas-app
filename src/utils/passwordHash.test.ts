import { describe, expect, it, vi } from 'vitest';
import { hashPassword, verifyPassword } from './passwordHash';

describe('generateSecureOtp (crypto.getRandomValues)', () => {
  function generateOtp(): string {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    return String(100000 + (buf[0] % 900000));
  }

  it('genera un código de exactamente 6 dígitos', () => {
    const code = generateOtp();
    expect(code).toMatch(/^\d{6}$/);
  });

  it('el código está en el rango [100000, 999999]', () => {
    const code = parseInt(generateOtp(), 10);
    expect(code).toBeGreaterThanOrEqual(100000);
    expect(code).toBeLessThanOrEqual(999999);
  });

  it('genera códigos distintos en llamadas sucesivas (probabilidad extremadamente alta)', () => {
    const codes = new Set(Array.from({ length: 20 }, generateOtp));
    expect(codes.size).toBeGreaterThan(1);
  });

  it('usa crypto.getRandomValues en lugar de Math.random', () => {
    const spy = vi.spyOn(crypto, 'getRandomValues');
    generateOtp();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe('hashPassword', () => {
  it('devuelve cadena con formato <saltHex>:<hashHex>', async () => {
    const hash = await hashPassword('MiContraseña123*');
    expect(hash).toMatch(/^[0-9a-f]{32}:[0-9a-f]{64}$/);
  });

  it('genera hashes distintos para la misma contraseña por la sal aleatoria', async () => {
    const hash1 = await hashPassword('mismaContraseña');
    const hash2 = await hashPassword('mismaContraseña');
    expect(hash1).not.toBe(hash2);
  });

  it('no almacena la contraseña en texto plano dentro del hash', async () => {
    const password = 'Admin123*';
    const hash = await hashPassword(password);
    expect(hash).not.toContain(password);
  });
});

describe('verifyPassword', () => {
  it('retorna true cuando la contraseña coincide con el hash almacenado', async () => {
    const password = 'Admin123*';
    const hash = await hashPassword(password);
    expect(await verifyPassword(password, hash)).toBe(true);
  });

  it('retorna false cuando la contraseña es incorrecta', async () => {
    const hash = await hashPassword('contraseñaOriginal');
    expect(await verifyPassword('contraseñaDistinta', hash)).toBe(false);
  });

  it('retorna false cuando el formato almacenado no es válido (sin dos partes)', async () => {
    expect(await verifyPassword('cualquiera', 'formatoSinDosPuntos')).toBe(false);
  });

  it('retorna false cuando el hash almacenado está vacío', async () => {
    expect(await verifyPassword('cualquiera', '')).toBe(false);
  });

  it('retorna false cuando solo hay sal sin hash', async () => {
    expect(await verifyPassword('cualquiera', 'aabbccdd:')).toBe(false);
  });

  it('distingue mayúsculas y minúsculas', async () => {
    const hash = await hashPassword('contraseña');
    expect(await verifyPassword('Contraseña', hash)).toBe(false);
  });

  it('distingue espacios al inicio y al final', async () => {
    const hash = await hashPassword('contraseña');
    expect(await verifyPassword(' contraseña ', hash)).toBe(false);
  });

  it('verifica correctamente las cuatro contraseñas demo de las cuentas semilla', async () => {
    const demoPasswords = ['Admin123*', 'Medico123*', 'Paciente123*', 'Agenda123*'];
    for (const pwd of demoPasswords) {
      const hash = await hashPassword(pwd);
      expect(await verifyPassword(pwd, hash)).toBe(true);
    }
  });

  it('el mismo hash no puede ser verificado con otra contraseña demo', async () => {
    const hashAdmin = await hashPassword('Admin123*');
    expect(await verifyPassword('Medico123*', hashAdmin)).toBe(false);
  });
});
