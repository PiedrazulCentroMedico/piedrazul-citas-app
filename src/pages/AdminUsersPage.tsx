import { useEffect, useMemo, useState } from 'react';
import { apiRequest } from '../api/http';
import { useAuth } from '../auth/AuthContext';
import { PortalTabs } from '../components/PortalTabs';
import type { Gender, PatientLookup, ProviderSchedule } from '../types';
import { readInternalDirectory, saveInternalDirectory, type InternalDirectoryAccount } from '../utils/adminDirectory';
import { getLinkedProviderId } from '../utils/sessionStorage';
import { sanitizeNameInput } from '../utils/validators';


export function AdminUsersPage() {
  const { session, authMode } = useAuth();
  const [term, setTerm] = useState('');
  const [internalUsers, setInternalUsers] = useState<InternalDirectoryAccount[]>([]);
  const [patients, setPatients] = useState<PatientLookup[]>([]);
  const [, setProviders] = useState<ProviderSchedule[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [editingAccount, setEditingAccount] = useState<InternalDirectoryAccount | null>(null);
  const [editingPatient, setEditingPatient] = useState<PatientLookup | null>(null);
  const [accountForm, setAccountForm] = useState({ displayName: '', email: '', documentNumber: '' });
  const [patientForm, setPatientForm] = useState<{ documentNumber: string; firstName: string; lastName: string; phone: string; gender: Gender; birthDate: string; email: string }>({ documentNumber: '', firstName: '', lastName: '', phone: '', gender: 'Male', birthDate: '', email: '' });

  const tabs = useMemo(() => [
    { to: '/portal/interno/citas', label: 'Listado de citas' },
    { to: '/portal/interno/nueva-cita', label: 'Nueva cita' },
    { to: '/portal/interno/usuarios', label: 'Usuarios' },
    { to: '/portal/interno/configuracion', label: 'Configuración' },
  ], []);

  useEffect(() => {
    if (authMode === 'keycloak') {
      if (!session) return;
      apiRequest<{ id: string; username: string; email?: string; firstName?: string; lastName?: string; enabled: boolean }[]>('/api/admin/internal-users', session)
        .then((users) => setInternalUsers(users.map((u) => ({
          displayName: [u.firstName, u.lastName].filter(Boolean).join(' ') || u.username,
          email: u.email,
          subject: u.id,
          roles: [],
          password: '',
        }))))
        .catch(() => undefined);
    } else {
      setInternalUsers(readInternalDirectory());
    }
  }, [authMode, session]);

  useEffect(() => {
    if (!session) return;
    apiRequest<ProviderSchedule[]>('/api/admin/provider-schedules', session)
      .then(setProviders)
      .catch(() => undefined);
  }, [session]);

  const filteredInternalUsers = useMemo(() => {
    const q = term.trim().toLowerCase();
    if (!q) return internalUsers;
    return internalUsers.filter((item) =>
      item.displayName.toLowerCase().includes(q)
      || (item.email ?? '').toLowerCase().includes(q)
      || (item.documentNumber ?? '').includes(q)
      || item.roles.join(' ').toLowerCase().includes(q));
  }, [internalUsers, term]);

  const searchPatients = async () => {
    if (!session || !term.trim()) {
      setPatients([]);
      return;
    }
    try {
      const data = await apiRequest<PatientLookup[]>(`/api/admin/patients?term=${encodeURIComponent(term.trim())}`, session);
      setPatients(data);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No fue posible buscar pacientes.');
    }
  };

  useEffect(() => {
    void searchPatients();
  }, [term]);

  const beginAccountEdit = (account: InternalDirectoryAccount) => {
    setEditingAccount(account);
    setAccountForm({
      displayName: account.displayName,
      email: account.email ?? '',
      documentNumber: account.documentNumber ?? '',
    });
  };

  const saveAccount = () => {
    if (!editingAccount) return;
    const updatedAccounts = readInternalDirectory().map((item) => item.subject === editingAccount.subject ? {
      ...item,
      displayName: sanitizeNameInput(accountForm.displayName),
      email: accountForm.email.trim(),
      documentNumber: accountForm.documentNumber.trim(),
    } : item);
    saveInternalDirectory(updatedAccounts);
    setInternalUsers(updatedAccounts);
    setEditingAccount(null);
    setMessage('El usuario interno fue actualizado correctamente.');
  };

  const deleteDoctor = async (account: InternalDirectoryAccount) => {
    if (!session) return;
    const shouldDelete = window.confirm(`¿Deseas eliminar el perfil de ${account.displayName}?`);
    if (!shouldDelete) return;

    const providerId = getLinkedProviderId(account.email);
    try {
      if (authMode === 'keycloak') {
        await apiRequest(`/api/admin/internal-users/${account.subject}`, session, { method: 'DELETE' });
        setInternalUsers((current) => current.filter((item) => item.subject !== account.subject));
        setMessage('El profesional fue eliminado correctamente.');
        return;
      }
      if (providerId) {
        await apiRequest(`/api/admin/provider-schedules/${providerId}`, session, { method: 'DELETE' });
      }
      const updatedAccounts = readInternalDirectory().filter((item) => item.subject !== account.subject);
      saveInternalDirectory(updatedAccounts);
      setInternalUsers(updatedAccounts);
      setProviders((current) => current.filter((item) => item.providerId !== providerId));
      setMessage('El profesional fue eliminado correctamente.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No fue posible eliminar el profesional.');
    }
  };

  const beginPatientEdit = (patient: PatientLookup) => {
    setEditingPatient(patient);
    setPatientForm({
      documentNumber: patient.documentNumber,
      firstName: patient.firstName,
      lastName: patient.lastName,
      phone: patient.phone,
      gender: patient.gender,
      birthDate: patient.birthDate ?? '',
      email: patient.email ?? '',
    });
  };

  const savePatient = async () => {
    if (!session || !editingPatient) return;
    try {
      const updated = await apiRequest<PatientLookup>(`/api/admin/patients/${editingPatient.id}`, session, {
        method: 'PUT',
        body: patientForm,
      });
      setPatients((current) => current.map((item) => item.id === updated.id ? updated : item));
      setEditingPatient(null);
      setMessage('El paciente fue actualizado correctamente.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No fue posible actualizar el paciente.');
    }
  };

  return (
    <div className="stack-lg">
      <section className="section-card">
        <h1>Gestión de usuarios</h1>
        <p className="muted-text">Busca pacientes e internos por cédula o nombre. Como administrador puedes editar la cédula y eliminar médicos.</p>
      </section>
      <PortalTabs items={tabs} />
      <section className="section-card stack-md">
        <label>
          Buscar por nombre o cédula
          <input value={term} onChange={(event) => setTerm(event.target.value)} placeholder="Ej. 1002778528 o Laura Rivera" />
        </label>
        {message && <div className={`feedback-card ${message.includes('correctamente') ? 'success' : 'error'}`}>{message}</div>}
      </section>

      <section className="section-card stack-md">
        <h2>Usuarios internos</h2>
        <div className="table-wrapper">
          <table>
            <thead><tr><th>Nombre</th><th>Cédula</th><th>Correo</th><th>Rol</th><th>Acciones</th></tr></thead>
            <tbody>
              {filteredInternalUsers.map((account) => (
                <tr key={account.subject}>
                  <td>{account.displayName}</td>
                  <td>{account.documentNumber ?? '—'}</td>
                  <td>{account.email ?? '—'}</td>
                  <td>{account.roles.join(', ')}</td>
                  <td>
                    <div className="inline-actions wrap">
                      <button type="button" className="button button-secondary" onClick={() => beginAccountEdit(account)}>Editar</button>
                      {account.roles.includes('Doctor') && <button type="button" className="button button-ghost" onClick={() => void deleteDoctor(account)}>Eliminar médico</button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="section-card stack-md">
        <h2>Pacientes registrados por documento</h2>
        <div className="table-wrapper">
          <table>
            <thead><tr><th>Nombre</th><th>Cédula</th><th>Celular</th><th>Correo</th><th>Cuenta</th><th>Acciones</th></tr></thead>
            <tbody>
              {patients.map((patient) => (
                <tr key={patient.id}>
                  <td>{patient.fullName}</td>
                  <td>{patient.documentNumber}</td>
                  <td>{patient.phone}</td>
                  <td>{patient.email ?? '—'}</td>
                  <td>{patient.hasUserAccount ? 'Sí' : 'No'}</td>
                  <td><button type="button" className="button button-secondary" onClick={() => beginPatientEdit(patient)}>Editar</button></td>
                </tr>
              ))}
              {patients.length === 0 && <tr><td colSpan={6} className="muted-text">Sin resultados de pacientes para la búsqueda actual.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      {editingAccount && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-card stack-md">
            <h2>Editar usuario interno</h2>
            <div className="form-grid">
              <label>Nombre<input value={accountForm.displayName} onChange={(event) => setAccountForm((current) => ({ ...current, displayName: event.target.value }))} /></label>
              <label>Cédula<input value={accountForm.documentNumber} onChange={(event) => setAccountForm((current) => ({ ...current, documentNumber: event.target.value }))} /></label>
              <label className="span-two">Correo<input value={accountForm.email} onChange={(event) => setAccountForm((current) => ({ ...current, email: event.target.value }))} /></label>
            </div>
            <div className="inline-actions end wrap">
              <button type="button" className="button button-secondary" onClick={() => setEditingAccount(null)}>Cerrar</button>
              <button type="button" className="button" onClick={saveAccount}>Guardar cambios</button>
            </div>
          </div>
        </div>
      )}

      {editingPatient && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-card stack-md">
            <h2>Editar paciente</h2>
            <div className="form-grid">
              <label>Cédula<input value={patientForm.documentNumber} onChange={(event) => setPatientForm((current) => ({ ...current, documentNumber: event.target.value }))} /></label>
              <label>Celular<input value={patientForm.phone} onChange={(event) => setPatientForm((current) => ({ ...current, phone: event.target.value }))} /></label>
              <label>Nombres<input value={patientForm.firstName} onChange={(event) => setPatientForm((current) => ({ ...current, firstName: sanitizeNameInput(event.target.value) }))} /></label>
              <label>Apellidos<input value={patientForm.lastName} onChange={(event) => setPatientForm((current) => ({ ...current, lastName: sanitizeNameInput(event.target.value) }))} /></label>
              <label>Género<select value={patientForm.gender} onChange={(event) => setPatientForm((current) => ({ ...current, gender: event.target.value as Gender }))}><option value="Male">Hombre</option><option value="Female">Mujer</option><option value="Other">Otro</option></select></label>
              <label>Fecha de nacimiento<input type="date" value={patientForm.birthDate} onChange={(event) => setPatientForm((current) => ({ ...current, birthDate: event.target.value }))} /></label>
              <label className="span-two">Correo<input value={patientForm.email} onChange={(event) => setPatientForm((current) => ({ ...current, email: event.target.value }))} /></label>
            </div>
            <div className="inline-actions end wrap">
              <button type="button" className="button button-secondary" onClick={() => setEditingPatient(null)}>Cerrar</button>
              <button type="button" className="button" onClick={() => void savePatient()}>Guardar cambios</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
