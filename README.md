# Piedrazul — Sistema web de reserva de citas médicas


Sistema web para la gestión y reserva de citas médicas del Centro Médico Piedrazul. Permite a los pacientes reservar citas en línea y al personal interno administrar la agenda de los médicos y terapistas.

---

## Funcionalidades principales

- Reserva de citas como invitado o con cuenta registrada
- Portal del paciente para ver historial y reagendar citas
- Portal interno para administradores, agendadores y médicos
- Configuración de disponibilidad y horarios por profesional
- Exportación del listado de citas a PDF y CSV
- Autenticación con JWT + Keycloak (modo demo disponible para desarrollo)
- Notificaciones asíncronas vía RabbitMQ

---

## Tecnologías

| Capa | Tecnología |
|---|---|
| Frontend | React 19 + TypeScript + Vite |
| Backend | ASP.NET Core 10 (Clean Architecture) |
| Base de datos | PostgreSQL 16 |
| Caché | Redis |
| Autenticación | Keycloak (JWT) |
| Mensajería | RabbitMQ |
| Contenedores | Docker + Docker Compose |
| CI/CD | GitHub Actions |
| Despliegue | Railway (backend) · Vercel (frontend) · Neon (base de datos) |

---

## Equipo

| Integrante | GitHub |
|---|---|
| Juan Felipe Ramírez | [@JUANRAM0101](https://github.com/JUANRAM0101) |
| José Nicolás Bambagüe | [@nicolas28B](https://github.com/nicolas28B) |
| Juan Camilo Meneses | [@Juanca08834](https://github.com/Juanca08834) |
| Juan Alejandro Cárdenas | [@AlejoCardenas](https://github.com/AlejoCardenas) |

---

## Requisitos previos

Antes de ejecutar el proyecto localmente asegurate de tener instalado:

- [Node.js 20 o superior](https://nodejs.org/)
- [pnpm](https://pnpm.io/) — `npm install -g pnpm`
- [.NET 10 SDK](https://dotnet.microsoft.com/download/dotnet/10.0)
- [Docker Desktop](https://www.docker.com/products/docker-desktop/)

---

## Instalación y ejecución local

### Paso 1 — Clonar el repositorio

git clone https://github.com/PiedrazulCentroMedico/piedrazul-citas-app.git
cd piedrazul-citas-app


### Paso 2 — Configurar las variables de entorno

Copiá el archivo de ejemplo y completá los valores:


cp .env.example .env


El archivo `.env` es usado por Docker Compose para levantar PostgreSQL, Keycloak y RabbitMQ. **Nunca lo commitees al repositorio.**

Para el frontend, creá un archivo `.env.local` en la raíz del proyecto:


VITE_API_URL=http://localhost:5184
VITE_AUTH_MODE=demo
VITE_KEYCLOAK_URL=http://localhost:8080
VITE_KEYCLOAK_REALM=piedrazul
VITE_KEYCLOAK_CLIENT_ID=piedrazul-web


### Paso 3 — Levantar los servicios con Docker


docker compose up -d


Esto levanta:

| Servicio | URL local |
|---|---|
| PostgreSQL | `localhost:5432` |
| Keycloak | `http://localhost:8080` |
| RabbitMQ | `http://localhost:15672` (admin / piedrazul) |
| Redis | `localhost:6379` |

### Paso 4 — Ejecutar el backend


dotnet run --project backend/src/Piedrazul.Api/Piedrazul.Api.csproj


La API queda disponible en:

- API: `http://localhost:5184`
- Swagger: `http://localhost:5184/swagger`

### Paso 5 — Instalar dependencias del frontend


pnpm install


### Paso 6 — Ejecutar el frontend


pnpm dev


La aplicación queda disponible en `http://localhost:5173`

---

## Usuarios de prueba (modo demo)

### Portal del paciente

En modo demo, el botón **"Iniciar sesión"** entra directamente como paciente demo.

### Portal interno

Abrí `http://localhost:5173/portal/interno/login` y seleccioná el rol:

| Rol | Usuario | Contraseña |
|---|---|---|
| Administrador | `admin.demo` | `Admin123*` |
| Agendador | `agenda.demo` | `Agenda123*` |
| Médico | `medico.demo` | `Medico123*` |

---

## Variables de entorno

### Frontend (`.env.local`)

| Variable | Descripción | Valor por defecto |
|---|---|---|
| `VITE_API_URL` | URL del backend | `http://localhost:5184` |
| `VITE_AUTH_MODE` | Modo de autenticación (`demo` o `keycloak`) | `demo` |
| `VITE_KEYCLOAK_URL` | URL de Keycloak | `http://localhost:8080` |
| `VITE_KEYCLOAK_REALM` | Realm de Keycloak | `piedrazul` |
| `VITE_KEYCLOAK_CLIENT_ID` | Client ID de Keycloak | `piedrazul-web` |

### Docker Compose (`.env`)

| Variable | Descripción |
|---|---|
| `POSTGRES_USER` | Usuario de PostgreSQL |
| `POSTGRES_PASSWORD` | Contraseña de PostgreSQL |
| `POSTGRES_DB` | Nombre de la base de datos |
| `KEYCLOAK_ADMIN` | Usuario administrador de Keycloak |
| `KEYCLOAK_ADMIN_PASSWORD` | Contraseña del administrador de Keycloak |
| `RABBITMQ_USER` | Usuario de RabbitMQ |
| `RABBITMQ_PASS` | Contraseña de RabbitMQ |

Ver el archivo [`.env.example`](.env.example) para los valores de referencia.

---

## Correr los tests

dotnet test backend/Piedrazul.sln

Para ver el reporte de cobertura:

dotnet test backend/Piedrazul.sln --collect:"XPlat Code Coverage"

---

## Sistema desplegado en producción

| Servicio | URL |
|---|---|
|  Frontend | https://piedrazul-citas-app.vercel.app |
|  Backend | https://piedrazul-citas-app-production.up.railway.app |
|  Health check | https://piedrazul-citas-app-production.up.railway.app/api/health |
|  Repositorio | https://github.com/PiedrazulCentroMedico/piedrazul-citas-app |

---

## Estructura del proyecto

```
piedrazul-citas-app/
├─ .github/
│  └─ workflows/
│     ├─ ci.yml          # Pipeline de integración continua
│     └─ cd.yml          # Pipeline de despliegue continuo
├─ backend/
│  ├─ src/
│  │  ├─ Piedrazul.Api/           # Controladores y configuración del servidor
│  │  ├─ Piedrazul.Application/   # Lógica de negocio e interfaces
│  │  ├─ Piedrazul.Domain/        # Entidades y modelos del dominio
│  │  └─ Piedrazul.Infrastructure/ # Repositorios, BD, caché, seguridad
│  └─ tests/
│     └─ Piedrazul.Domain.Tests/  # Pruebas unitarias
├─ src/                           # Frontend React
│  ├─ api/                        # Cliente HTTP
│  ├─ auth/                       # Contexto de autenticación
│  ├─ components/                 # Componentes reutilizables
│  └─ pages/                      # Páginas de la aplicación
├─ backend/Dockerfile             # Imagen Docker del backend
├─ docker-compose.yml             # Servicios locales
├─ vercel.json                    # Configuración de Vercel
└─ .env.example                   # Variables de entorno de referencia
```

---

## Licencia

Proyecto académico — Universidad del Cauca, Ingeniería de Software III, 2026-1.
