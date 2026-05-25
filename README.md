# Piedrazul - Sistema web de reserva de citas

Aplicación SPA desarrollada con **React + Vite** en el frontend y una solución **ASP.NET Core Web API** con **PostgreSQL** en el backend.

## Lo que incluye esta entrega

- Portal público para pacientes.
- Reserva de cita como invitado.
- Reserva de cita con cuenta para acceder a funciones adicionales.
- Portal interno para administrador, agendador y médico/terapista.
- Listado de citas por profesional y fecha.
- Creación de citas para llamadas o WhatsApp.
- Configuración de agenda y disponibilidad por profesional.
- Exportación del listado de citas a **PDF**.
- Validaciones de formulario en frontend y backend.
- Integración preparada para **JWT + Keycloak**.
- Modo **demo** para avanzar y probar sin bloquearte por autenticación externa.
- Pruebas unitarias base para la lógica de validación y generación de franjas.

## Estructura del proyecto

```text
piedrazul-citas-app/
├─ backend/
│  ├─ Piedrazul.sln
│  ├─ keycloak/
│  ├─ postgres/
│  ├─ src/
│  │  ├─ Piedrazul.Api/
│  │  ├─ Piedrazul.Application/
│  │  ├─ Piedrazul.Domain/
│  │  └─ Piedrazul.Infrastructure/
│  └─ tests/
├─ src/
├─ docker-compose.yml
├─ .env.example
└─ README.md
```

## Requisitos recomendados

- Visual Studio 2022 o superior con carga de trabajo **ASP.NET y desarrollo web**.
- .NET 8 SDK.
- Node.js 20 o superior.
- Docker Desktop.
- PostgreSQL solo si no vas a usar Docker para la base de datos.

---

# 1) Levantar la aplicación rápido en modo demo

Este modo es el más fácil para empezar. No depende de Keycloak para que el equipo pueda avanzar desde ya.

## Paso 1. Levanta PostgreSQL con Docker

En la carpeta raíz del proyecto ejecuta:

```bash
docker compose up -d postgres
```

Eso deja disponible PostgreSQL en:

- Host: `localhost`
- Puerto: `5432`
- Base de datos: `piedrazul`
- Usuario: `postgres`
- Clave: `postgres`

## Paso 2. Abre el backend en Visual Studio

1. Abre `backend/Piedrazul.sln`.
2. Marca `Piedrazul.Api` como proyecto de inicio.
3. Verifica que el archivo `backend/src/Piedrazul.Api/appsettings.Development.json` tenga:

```json
"Authentication": {
  "Mode": "Development"
}
```

4. Ejecuta el proyecto.

La API quedará en:

```text
http://localhost:5184
```

Swagger:

```text
http://localhost:5184/swagger
```


o
```text
cd backend
dotnet restore
dotnet run --project src/Piedrazul.Api/Piedrazul.Api.csproj
```


## Paso 3. Configura el frontend


En la raíz del proyecto crea un archivo `.env.local` con este contenido:

```env
VITE_API_URL=http://localhost:5184
VITE_AUTH_MODE=demo
VITE_KEYCLOAK_URL=http://localhost:8080
VITE_KEYCLOAK_REALM=piedrazul
VITE_KEYCLOAK_CLIENT_ID=piedrazul-web
```

## Paso 4. Instala dependencias del frontend

En la raíz del proyecto ejecuta:

```bash
npm install
```

## Paso 5. Ejecuta el frontend

```bash
npm run dev
```

La app quedará en:

```text
http://localhost:5173
```

---

# 2) Cómo usar la aplicación en modo demo

## Paciente

- En la página principal puedes:
  - reservar como invitado,
  - iniciar sesión,
  - registrarte.
- En modo demo, el botón **Iniciar sesión** entra como paciente demo.
- Luego puedes abrir:
  - `http://localhost:5173/portal/paciente`
  - `http://localhost:5173/portal/paciente/perfil`

## Portal interno

Abre:

```text
http://localhost:5173/portal/interno/login
```

En modo demo tendrás tres botones:

- Administrador demo
- Agendador demo
- Médico demo

Con eso puedes probar:

- listado de citas,
- nueva cita,
- configuración de disponibilidad,
- exportación a PDF.

---

# 3) Levantar la aplicación con Keycloak

Cuando quieras usar autenticación JWT real, sigue estos pasos.

## Paso 1. Levanta PostgreSQL y Keycloak

Desde la raíz del proyecto ejecuta:

```bash
docker compose up -d
```

Esto levanta:

- PostgreSQL en `localhost:5432`
- Keycloak en `http://localhost:8080`

## Paso 2. Verifica la importación del realm

Se importa automáticamente el archivo:

```text
backend/keycloak/piedrazul-realm.json
```

Realm esperado:

```text
piedrazul
```

## Paso 3. Cambia el backend a modo Keycloak

En `backend/src/Piedrazul.Api/appsettings.Development.json` deja:

```json
{
  "Authentication": {
    "Mode": "Keycloak",
    "Authority": "http://localhost:8080/realms/piedrazul",
    "Audience": "piedrazul-api",
    "RequireHttpsMetadata": false
  }
}
```

## Paso 4. Cambia el frontend a Keycloak

En `.env.local` deja:

```env
VITE_API_URL=http://localhost:5184
VITE_AUTH_MODE=keycloak
VITE_KEYCLOAK_URL=http://localhost:8080
VITE_KEYCLOAK_REALM=piedrazul
VITE_KEYCLOAK_CLIENT_ID=piedrazul-web
```

Luego reinicia el frontend:

```bash
npm run dev
```

## Usuarios internos de prueba

Si el realm fue importado correctamente, puedes entrar con estos usuarios:

- Administrador
  - usuario: `admin.demo`
  - clave: `Admin123*`
- Agendador
  - usuario: `agenda.demo`
  - clave: `Agenda123*`
- Médico
  - usuario: `medico.demo`
  - clave: `Medico123*`

Los pacientes pueden registrarse desde la pantalla de Keycloak porque el realm tiene registro habilitado.

---

# 4) Qué hace cada área

## Portal público / paciente

- Inicio con información del centro médico.
- Botones en el encabezado para iniciar sesión o registrarse.
- Reserva como invitado con datos básicos.
- Reserva con cuenta para acceder a funciones adicionales.
- Portal del paciente para ver citas y actualizar perfil.

## Portal interno

- Inicio de sesión por rol.
- Listado de citas por médico/terapista y fecha.
- Creación de citas para llamadas o WhatsApp.
- Búsqueda/autocompletado básico por documento.
- Configuración de semanas habilitadas y franjas por profesional.
- Exportación del listado de citas a PDF.

---

# 5) Validaciones implementadas

## Frontend y backend

- Documento: solo números, 5 a 20 dígitos.
- Celular: solo números, 7 a 15 dígitos.
- Nombres y apellidos: letras, espacios, apóstrofe o guion, 2 a 80 caracteres.
- Correo: opcional, máximo 150 caracteres y formato válido.
- Observaciones: máximo 500 caracteres.
- Intervalo entre citas: 10 a 120 minutos.
- Reserva solo dentro de la ventana de semanas habilitada.
- La franja debe existir y estar libre al momento de reservar.

---

# 6) Endpoints principales

## Públicos

- `GET /api/public/info`
- `GET /api/public/providers`
- `GET /api/public/providers/{providerId}/availability?date=YYYY-MM-DD`
- `POST /api/public/appointments`

## Paciente autenticado

- `GET /api/patient/profile`
- `PUT /api/patient/profile`
- `GET /api/patient/appointments`
- `POST /api/patient/appointments`

## Portal interno

- `GET /api/internal/patients/search?document=...`
- `GET /api/internal/appointments?providerId=...&date=YYYY-MM-DD`
- `POST /api/internal/appointments`
- `GET /api/internal/appointments/export/pdf?providerId=...&date=YYYY-MM-DD`

## Configuración

- `GET /api/admin/settings`
- `PUT /api/admin/settings`
- `GET /api/admin/provider-schedules`
- `PUT /api/admin/provider-schedules/{providerId}`

---

# 7) Pruebas del frontend

Para compilar el frontend en producción:

```bash
npm run build
```

Para previsualizar la compilación:

```bash
npm run preview
```

---

# 8) Notas de desarrollo

- El backend usa `EnsureCreated()` para dejar la base lista rápidamente en ambiente de desarrollo.
- Si luego quieres profesionalizar más el proyecto, el siguiente paso es agregar migraciones de Entity Framework.
- La exportación quedó en PDF porque fue tu preferencia. Si el curso exige CSV además, se puede agregar un exportador paralelo sin cambiar la arquitectura general.
- La arquitectura está separada por capas para facilitar mantenibilidad y crecimiento del proyecto.

---

# 9) Qué te recomiendo hacer después

1. Agregar migraciones EF Core.
2. Vincular médicos internos reales con su disponibilidad propia.
3. Añadir cancelación y reprogramación de citas.
4. Incorporar pruebas unitarias adicionales del dominio y servicios.
5. Ejecutar ZAP sobre frontend y backend para cumplir el requisito no funcional de seguridad.
