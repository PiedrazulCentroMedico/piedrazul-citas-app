import Keycloak from 'keycloak-js';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { apiRequest } from '../api/http';
import { appConfig } from '../config';
import type { DemoRole, SessionUser } from '../types';
import { hashPassword, verifyPassword } from '../utils/passwordHash';

const PATIENT_SESSION_STORAGE_KEY = 'piedrazul-patient-session';
const INTERNAL_SESSION_STORAGE_KEY = 'piedrazul-internal-session';
const ACCOUNTS_STORAGE_KEY = 'piedrazul-accounts';
const ACCOUNTS_VERSION_KEY = 'piedrazul-accounts-v2';
const RESET_STORAGE_KEY = 'piedrazul-password-reset';

interface DemoAccount {
  email?: string;
  documentNumber?: string;
  password: string;
  displayName: string;
  subject: string;
  roles: string[];
}

interface ResetRequest {
  identifier: string;
  code: string;
  expiresAt: number;
}

interface RegisterPayload {
  documentNumber: string;
  firstName: string;
  lastName: string;
  password: string;
}

interface InternalAccountPayload {
  email: string;
  password: string;
  displayName: string;
  roles: string[];
}

interface AuthContextValue {
  ready: boolean;
  session: SessionUser | null;
  authMode: 'demo' | 'keycloak';
  login: (portal?: 'patient' | 'internal') => Promise<void>;
  register: () => Promise<void>;
  logout: () => Promise<void>;
  loginAsDemo: (role: DemoRole) => void;
  loginWithCredentials: (identifier: string, password: string, portal: 'patient' | 'internal') => Promise<SessionUser>;
  registerPatientAccount: (payload: RegisterPayload) => Promise<SessionUser>;
  createInternalDemoAccount: (payload: InternalAccountPayload) => Promise<void>;
  requestPasswordReset: (identifier: string) => Promise<string>;
  resetPassword: (identifier: string, code: string, newPassword: string) => Promise<void>;
}

const seededAccounts: DemoAccount[] = [
  {
    email: 'paciente@piedrazul.local',
    documentNumber: '1000000001',
    password: 'Paciente123*',
    displayName: 'Paciente Demo',
    subject: 'demo-patient',
    roles: ['Patient'],
  },
  {
    email: 'admin@piedrazul.local',
    password: 'Admin123*',
    displayName: 'Administrador Piedrazul',
    subject: 'staff-admin@piedrazul.local',
    roles: ['Admin'],
  },
  {
    email: 'agenda@piedrazul.local',
    password: 'Agenda123*',
    displayName: 'Agendador Piedrazul',
    subject: 'staff-agenda@piedrazul.local',
    roles: ['Scheduler'],
  },
  {
    email: 'medico@piedrazul.local',
    password: 'Medico123*',
    displayName: 'Profesional Piedrazul',
    subject: 'staff-medico@piedrazul.local',
    roles: ['Doctor'],
  },
];

const demoSessions: Record<DemoRole, SessionUser> = {
  patient: {
    subject: 'demo-patient',
    displayName: 'Paciente Demo',
    email: 'paciente.demo@piedrazul.test',
    roles: ['Patient'],
    mode: 'demo',
  },
  admin: {
    subject: 'staff-admin@piedrazul.local',
    displayName: 'Administrador Piedrazul',
    email: 'admin@piedrazul.local',
    roles: ['Admin'],
    mode: 'demo',
  },
  scheduler: {
    subject: 'staff-agenda@piedrazul.local',
    displayName: 'Agendador Piedrazul',
    email: 'agenda@piedrazul.local',
    roles: ['Scheduler'],
    mode: 'demo',
  },
  doctor: {
    subject: 'staff-medico@piedrazul.local',
    displayName: 'Profesional Piedrazul',
    email: 'medico@piedrazul.local',
    roles: ['Doctor'],
    mode: 'demo',
  },
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function mapKeycloakSession(instance: Keycloak): SessionUser {
  const token = instance.token;
  const parsed = instance.tokenParsed as Record<string, unknown> | undefined;
  const realmAccess = parsed?.realm_access as { roles?: string[] } | undefined;

  return {
    subject: String(parsed?.sub ?? 'authenticated-user'),
    displayName: String(parsed?.preferred_username ?? parsed?.name ?? 'Usuario autenticado'),
    email: parsed?.email ? String(parsed.email) : undefined,
    roles: realmAccess?.roles ?? [],
    mode: 'keycloak',
    token,
  };
}

async function initAccounts(): Promise<void> {
  if (localStorage.getItem(ACCOUNTS_VERSION_KEY)) return;
  localStorage.removeItem(ACCOUNTS_STORAGE_KEY);
  const hashed = await Promise.all(
    seededAccounts.map(async (a) => ({ ...a, password: await hashPassword(a.password) })),
  );
  localStorage.setItem(ACCOUNTS_STORAGE_KEY, JSON.stringify(hashed));
  localStorage.setItem(ACCOUNTS_VERSION_KEY, '1');
}

function readAccounts(): DemoAccount[] {
  const stored = localStorage.getItem(ACCOUNTS_STORAGE_KEY);
  if (!stored) return [];
  try {
    return JSON.parse(stored) as DemoAccount[];
  } catch {
    return [];
  }
}

function saveAccounts(accounts: DemoAccount[]) {
  localStorage.setItem(ACCOUNTS_STORAGE_KEY, JSON.stringify(accounts));
}

function createSession(account: DemoAccount): SessionUser {
  return {
    subject: account.subject,
    displayName: account.displayName,
    email: account.email,
    roles: account.roles,
    mode: 'demo',
  };
}

function readStoredSession(key: string): SessionUser | null {
  const stored = localStorage.getItem(key);
  if (!stored) return null;

  try {
    return JSON.parse(stored) as SessionUser;
  } catch {
    localStorage.removeItem(key);
    return null;
  }
}

function saveStoredSession(key: string, session: SessionUser | null) {
  if (!session) {
    localStorage.removeItem(key);
    return;
  }

  localStorage.setItem(key, JSON.stringify(session));
}

function readResetRequests(): ResetRequest[] {
  const stored = localStorage.getItem(RESET_STORAGE_KEY);
  if (!stored) {
    return [];
  }

  try {
    const parsed = JSON.parse(stored) as ResetRequest[];
    return parsed.filter((item) => item.expiresAt > Date.now());
  } catch {
    return [];
  }
}

function saveResetRequests(items: ResetRequest[]) {
  localStorage.setItem(RESET_STORAGE_KEY, JSON.stringify(items.filter((item) => item.expiresAt > Date.now())));
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const isInternalRoute = location.pathname.startsWith('/portal/interno');
  const [ready, setReady] = useState(false);
  const [patientSession, setPatientSession] = useState<SessionUser | null>(null);
  const [internalSession, setInternalSession] = useState<SessionUser | null>(null);
  const [keycloak, setKeycloak] = useState<Keycloak | null>(null);

  useEffect(() => {
    if (appConfig.authMode === 'keycloak') {
      const keycloakInstance = new Keycloak({
        url: appConfig.keycloakUrl,
        realm: appConfig.keycloakRealm,
        clientId: appConfig.keycloakClientId,
      });

      keycloakInstance
        .init({
          onLoad: 'check-sso',
          pkceMethod: 'S256',
          checkLoginIframe: false,
        })
        .then((authenticated) => {
          setKeycloak(keycloakInstance);
          if (authenticated) {
            const mapped = mapKeycloakSession(keycloakInstance);
            if (mapped.roles.includes('Patient')) setPatientSession(mapped);
            if (mapped.roles.some((role) => ['Admin', 'Scheduler', 'Doctor'].includes(role))) setInternalSession(mapped);
          }

          keycloakInstance.onTokenExpired = () => {
            keycloakInstance
              .updateToken(30)
              .then(() => {
                const mapped = mapKeycloakSession(keycloakInstance);
                setPatientSession(mapped.roles.includes('Patient') ? mapped : null);
                setInternalSession(mapped.roles.some((role) => ['Admin', 'Scheduler', 'Doctor'].includes(role)) ? mapped : null);
              })
              .catch(() => {
                setPatientSession(null);
                setInternalSession(null);
              });
          };

          setReady(true);
        })
        .catch(() => setReady(true));
      return;
    }

    initAccounts().then(() => {
      setPatientSession(readStoredSession(PATIENT_SESSION_STORAGE_KEY));
      setInternalSession(readStoredSession(INTERNAL_SESSION_STORAGE_KEY));
      setReady(true);
    });
  }, []);

  const session = isInternalRoute ? internalSession : patientSession;

  const value = useMemo<AuthContextValue>(() => ({
    ready,
    session,
    authMode: appConfig.authMode,
    async login(portal = 'patient') {
      if (appConfig.authMode === 'keycloak' && keycloak) {
        await keycloak.login({
          redirectUri: `${window.location.origin}${portal === 'internal' ? '/portal/interno/citas' : '/portal/paciente'}`,
        });
      }
    },
    async register() {
      if (appConfig.authMode === 'keycloak' && keycloak) {
        await keycloak.register({ redirectUri: `${window.location.origin}/portal/paciente/perfil` });
      }
    },
    async logout() {
      if (appConfig.authMode === 'keycloak' && keycloak) {
        await keycloak.logout({ redirectUri: window.location.origin });
        return;
      }

      if (isInternalRoute) {
        saveStoredSession(INTERNAL_SESSION_STORAGE_KEY, null);
        setInternalSession(null);
      } else {
        saveStoredSession(PATIENT_SESSION_STORAGE_KEY, null);
        setPatientSession(null);
      }
    },
    loginAsDemo(role) {
      const demoSession = demoSessions[role];
      if (role === 'patient') {
        saveStoredSession(PATIENT_SESSION_STORAGE_KEY, demoSession);
        setPatientSession(demoSession);
        return;
      }

      saveStoredSession(INTERNAL_SESSION_STORAGE_KEY, demoSession);
      setInternalSession(demoSession);
    },
    async loginWithCredentials(identifier, password, portal) {
      if (appConfig.authMode === 'keycloak') {
        if (keycloak) {
          await keycloak.login({
            redirectUri: `${window.location.origin}${portal === 'internal' ? '/portal/interno/citas' : '/portal/paciente'}`,
          });
        }
        throw new Error('Redirigiendo al sistema de autenticación...');
      }

      const normalizedIdentifier = identifier.trim().toLowerCase();
      const account = readAccounts().find((item) => {
        const isPatientAccount = item.roles.includes('Patient');
        if (portal === 'patient') {
          return isPatientAccount && item.documentNumber === normalizedIdentifier;
        }
        return !isPatientAccount && (item.email ?? '').toLowerCase() === normalizedIdentifier;
      });

      const passwordMatch = account ? await verifyPassword(password, account.password) : false;
      if (!account || !passwordMatch) {
        throw new Error(portal === 'patient'
          ? 'Cédula o contraseña incorrectas. Verifica tus datos e inténtalo de nuevo.'
          : 'Correo o contraseña incorrectos. Verifica tus credenciales e inténtalo de nuevo.');
      }

      const isPatientAccount = account.roles.includes('Patient');
      if (portal === 'patient' && !isPatientAccount) {
        throw new Error('Estas credenciales pertenecen al portal interno. Usa el acceso para personal autorizado.');
      }

      if (portal === 'internal' && isPatientAccount) {
        throw new Error('Estas credenciales pertenecen al portal de pacientes. Usa iniciar sesión desde el portal público.');
      }

      const newSession = createSession(account);
      if (isPatientAccount) {
        saveStoredSession(PATIENT_SESSION_STORAGE_KEY, newSession);
        setPatientSession(newSession);
      } else {
        saveStoredSession(INTERNAL_SESSION_STORAGE_KEY, newSession);
        setInternalSession(newSession);
      }

      return newSession;
    },
    async registerPatientAccount(payload) {
      if (appConfig.authMode === 'keycloak') {
        if (keycloak) {
          await keycloak.register({ redirectUri: `${window.location.origin}/portal/paciente/perfil` });
        }
        throw new Error('Redirigiendo al registro centralizado...');
      }

      const normalizedDocument = payload.documentNumber.trim();
      const accounts = readAccounts();
      if (accounts.some((item) => item.roles.includes('Patient') && item.documentNumber === normalizedDocument)) {
        throw new Error('Ya existe una cuenta con esa cédula. Inicia sesión para continuar.');
      }

      const displayName = `${payload.firstName.trim()} ${payload.lastName.trim()}`.trim();
      const account: DemoAccount = {
        documentNumber: normalizedDocument,
        password: await hashPassword(payload.password),
        displayName,
        subject: `patient-${normalizedDocument}`,
        roles: ['Patient'],
      };

      saveAccounts([...accounts, account]);
      const newSession = createSession(account);
      saveStoredSession(PATIENT_SESSION_STORAGE_KEY, newSession);
      setPatientSession(newSession);
      return newSession;
    },
    async createInternalDemoAccount(payload) {
      if (appConfig.authMode === 'keycloak') {
        const currentSession = internalSession;
        if (!currentSession) throw new Error('Sesión no disponible.');
        await apiRequest<{ id: string }>('/api/admin/internal-users', currentSession, {
          method: 'POST',
          body: {
            username: payload.email.trim().toLowerCase(),
            email: payload.email.trim().toLowerCase(),
            firstName: payload.displayName.split(' ')[0] ?? payload.displayName,
            lastName: payload.displayName.split(' ').slice(1).join(' ') || payload.displayName,
            password: payload.password,
            roles: payload.roles,
          },
        });
        return;
      }

      const normalizedEmail = payload.email.trim().toLowerCase();
      const accounts = readAccounts();
      if (accounts.some((item) => (item.email ?? '').toLowerCase() === normalizedEmail)) {
        throw new Error('Ya existe una cuenta interna con ese correo.');
      }

      const account: DemoAccount = {
        email: normalizedEmail,
        password: await hashPassword(payload.password),
        displayName: payload.displayName.trim(),
        subject: `staff-${normalizedEmail}`,
        roles: payload.roles,
      };

      saveAccounts([...accounts, account]);
    },
    async requestPasswordReset(identifier) {
      const normalizedIdentifier = identifier.trim().toLowerCase();
      const account = readAccounts().find((item) => {
        if (item.roles.includes('Patient')) {
          return item.documentNumber === normalizedIdentifier;
        }
        return (item.email ?? '').toLowerCase() === normalizedIdentifier;
      });

      if (!account) {
        throw new Error('No encontramos una cuenta asociada al dato ingresado.');
      }

      const buf = new Uint32Array(1);
      crypto.getRandomValues(buf);
      const code = String(100000 + (buf[0] % 900000));
      const requests = readResetRequests().filter((item) => item.identifier !== normalizedIdentifier);
      requests.push({ identifier: normalizedIdentifier, code, expiresAt: Date.now() + 15 * 60 * 1000 });
      saveResetRequests(requests);
      return code;
    },
    async resetPassword(identifier, code, newPassword) {
      const normalizedIdentifier = identifier.trim().toLowerCase();
      const requests = readResetRequests();
      const existing = requests.find((item) => item.identifier === normalizedIdentifier && item.code === code.trim());
      if (!existing) {
        throw new Error('El código de recuperación no es válido o ya expiró.');
      }

      const accounts = readAccounts();
      const accountIndex = accounts.findIndex((item) => item.roles.includes('Patient')
        ? item.documentNumber === normalizedIdentifier
        : (item.email ?? '').toLowerCase() === normalizedIdentifier);
      if (accountIndex === -1) {
        throw new Error('La cuenta asociada al restablecimiento ya no existe.');
      }

      accounts[accountIndex] = { ...accounts[accountIndex], password: await hashPassword(newPassword) };
      saveAccounts(accounts);
      saveResetRequests(requests.filter((item) => !(item.identifier === normalizedIdentifier && item.code === code.trim())));
    },
  }), [internalSession, isInternalRoute, keycloak, ready, session]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth debe usarse dentro de AuthProvider');
  }

  return context;
}
