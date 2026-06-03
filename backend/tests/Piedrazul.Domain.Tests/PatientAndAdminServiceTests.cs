using Moq;
using Piedrazul.Application;
using Piedrazul.Application.Abstractions.Repositories;
using Piedrazul.Domain;
using Xunit;

namespace Piedrazul.Domain.Tests;

// ─────────────────────────────────────────────────────────────────────────────
// PatientService
// ─────────────────────────────────────────────────────────────────────────────

public sealed class PatientServiceTests
{
    private static PatientProfile MakePatient(string userId = "user-1") => new()
    {
        DocumentNumber = "12345678",
        FirstName      = "Ana",
        LastName       = "Gómez",
        Phone          = "3001234567",
        Gender         = Gender.Female,
        ExternalUserId = userId,
        IsGuest        = false
    };

    private static Mock<IPatientRepository> PatientRepoMock()
    {
        var m = new Mock<IPatientRepository>();
        m.Setup(r => r.AddAsync(It.IsAny<PatientProfile>(), It.IsAny<CancellationToken>()))
            .Returns(Task.CompletedTask);
        m.Setup(r => r.SaveChangesAsync(It.IsAny<CancellationToken>()))
            .Returns(Task.CompletedTask);
        return m;
    }

    private static Mock<IAppointmentRepository> AppointmentRepoMock()
    {
        var m = new Mock<IAppointmentRepository>();
        m.Setup(r => r.GetAppointmentsByDocumentAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((IReadOnlyList<Appointment>)Array.Empty<Appointment>());
        return m;
    }

    // ── GetMyProfile ──────────────────────────────────────────────────────────

    [Fact]
    public async Task GetMyProfile_PerfilNoExiste_RetornaNotFound()
    {
        var patientRepo = PatientRepoMock();
        patientRepo.Setup(r => r.GetByExternalUserIdAsync("user-x", It.IsAny<CancellationToken>()))
            .ReturnsAsync((PatientProfile?)null);

        var service = new PatientService(patientRepo.Object, AppointmentRepoMock().Object);

        var result = await service.GetMyProfileAsync("user-x");

        Assert.False(result.Succeeded);
        Assert.Equal(OperationStatus.NotFound, result.Status);
    }

    [Fact]
    public async Task GetMyProfile_PerfilExiste_RetornaSuccessConDatosCorrectos()
    {
        var patient     = MakePatient("user-2");
        var patientRepo = PatientRepoMock();
        patientRepo.Setup(r => r.GetByExternalUserIdAsync("user-2", It.IsAny<CancellationToken>()))
            .ReturnsAsync(patient);

        var service = new PatientService(patientRepo.Object, AppointmentRepoMock().Object);

        var result = await service.GetMyProfileAsync("user-2");

        Assert.True(result.Succeeded);
        Assert.Equal(OperationStatus.Success, result.Status);
        Assert.Equal("12345678", result.Data!.DocumentNumber);
        Assert.Equal("Ana",      result.Data.FirstName);
        Assert.Equal("Gómez",   result.Data.LastName);
    }

    // ── UpsertMyProfile ───────────────────────────────────────────────────────

    [Fact]
    public async Task UpsertMyProfile_DatosInvalidos_RetornaValidationError()
    {
        var service = new PatientService(PatientRepoMock().Object, AppointmentRepoMock().Object);

        var request = new PatientProfileUpsertRequest
        {
            DocumentNumber = "ABC",      // inválido — letras
            FirstName      = "X",        // inválido — muy corto
            LastName       = "Y",        // inválido — muy corto
            Phone          = "123"       // inválido — muy corto
        };

        var result = await service.UpsertMyProfileAsync("user-3", null, request);

        Assert.False(result.Succeeded);
        Assert.Equal(OperationStatus.ValidationError, result.Status);
        Assert.True(result.Errors.Count >= 2);
    }

    [Fact]
    public async Task UpsertMyProfile_PacienteNuevo_PersistePerfil()
    {
        var patientRepo = PatientRepoMock();
        patientRepo.Setup(r => r.GetByExternalUserIdAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((PatientProfile?)null);
        patientRepo.Setup(r => r.GetByDocumentAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((PatientProfile?)null);

        var service = new PatientService(patientRepo.Object, AppointmentRepoMock().Object);

        var request = new PatientProfileUpsertRequest
        {
            DocumentNumber = "12345678",
            FirstName      = "Carlos",
            LastName       = "López",
            Phone          = "3009876543",
            Gender         = Gender.Male
        };

        var result = await service.UpsertMyProfileAsync("user-nuevo", null, request);

        Assert.True(result.Succeeded);
        Assert.Equal(OperationStatus.Success, result.Status);
        Assert.Equal("Carlos", result.Data!.FirstName);
        Assert.False(result.Data.IsGuest);

        patientRepo.Verify(r => r.AddAsync(It.IsAny<PatientProfile>(), It.IsAny<CancellationToken>()), Times.Once);
        patientRepo.Verify(r => r.SaveChangesAsync(It.IsAny<CancellationToken>()),                     Times.Once);
    }

    // ── GetMyAppointments ─────────────────────────────────────────────────────

    [Fact]
    public async Task GetMyAppointments_PerfilNoExiste_RetornaNotFound()
    {
        var patientRepo = PatientRepoMock();
        patientRepo.Setup(r => r.GetByExternalUserIdAsync("user-sin-perfil", It.IsAny<CancellationToken>()))
            .ReturnsAsync((PatientProfile?)null);

        var service = new PatientService(patientRepo.Object, AppointmentRepoMock().Object);

        var result = await service.GetMyAppointmentsAsync("user-sin-perfil");

        Assert.False(result.Succeeded);
        Assert.Equal(OperationStatus.NotFound, result.Status);
    }

    [Fact]
    public async Task GetMyAppointments_PerfilExisteSinCitas_RetornaListaVacia()
    {
        var patient     = MakePatient("user-vacio");
        var patientRepo = PatientRepoMock();
        patientRepo.Setup(r => r.GetByExternalUserIdAsync("user-vacio", It.IsAny<CancellationToken>()))
            .ReturnsAsync(patient);

        var appointmentRepo = AppointmentRepoMock(); // devuelve [] por defecto

        var service = new PatientService(patientRepo.Object, appointmentRepo.Object);

        var result = await service.GetMyAppointmentsAsync("user-vacio");

        Assert.True(result.Succeeded);
        Assert.Empty(result.Data!);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// AdministrationService
// ─────────────────────────────────────────────────────────────────────────────

public sealed class AdministrationServiceTests
{
    private static Mock<IProviderRepository> ProviderRepoMock()
    {
        var m = new Mock<IProviderRepository>();
        m.Setup(r => r.AddAsync(It.IsAny<Provider>(), It.IsAny<CancellationToken>()))
            .Returns(Task.CompletedTask);
        m.Setup(r => r.SaveChangesAsync(It.IsAny<CancellationToken>()))
            .Returns(Task.CompletedTask);
        m.Setup(r => r.RemoveAvailabilitiesAsync(It.IsAny<Guid>(), It.IsAny<CancellationToken>()))
            .Returns(Task.CompletedTask);
        m.Setup(r => r.AddAvailabilitiesAsync(It.IsAny<IReadOnlyList<WeeklyAvailability>>(), It.IsAny<CancellationToken>()))
            .Returns(Task.CompletedTask);
        m.Setup(r => r.GetWithAvailabilitiesAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync((IReadOnlyList<Provider>)Array.Empty<Provider>());
        return m;
    }

    private static Mock<ISystemSettingsRepository> SettingsMock(SystemSetting? setting = null)
    {
        var m = new Mock<ISystemSettingsRepository>();
        m.Setup(s => s.GetAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(setting);
        m.Setup(s => s.AddAsync(It.IsAny<SystemSetting>(), It.IsAny<CancellationToken>()))
            .Returns(Task.CompletedTask);
        m.Setup(s => s.SaveChangesAsync(It.IsAny<CancellationToken>()))
            .Returns(Task.CompletedTask);
        return m;
    }

    private static Mock<IPatientRepository> PatientRepoMock()
    {
        var m = new Mock<IPatientRepository>();
        m.Setup(r => r.SaveChangesAsync(It.IsAny<CancellationToken>())).Returns(Task.CompletedTask);
        return m;
    }

    private static Mock<IAppointmentRepository> AppointmentRepoMock()
    {
        var m = new Mock<IAppointmentRepository>();
        m.Setup(r => r.CountScheduledAppointmentsByPatientIdAsync(It.IsAny<Guid>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(0);
        m.Setup(r => r.CountScheduledByPatientIdsAsync(It.IsAny<IReadOnlyList<Guid>>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new Dictionary<Guid, int>());
        return m;
    }

    private AdministrationService Build(
        Mock<IProviderRepository>?      providerRepo   = null,
        Mock<ISystemSettingsRepository>? settingsRepo  = null,
        Mock<IPatientRepository>?        patientRepo   = null,
        Mock<IAppointmentRepository>?    appointmentRepo = null) =>
        new(
            (providerRepo    ?? ProviderRepoMock()).Object,
            (settingsRepo    ?? SettingsMock(new SystemSetting { WeeksAheadBooking = 6, TimeZoneId = "America/Bogota" })).Object,
            (patientRepo     ?? PatientRepoMock()).Object,
            (appointmentRepo ?? AppointmentRepoMock()).Object);

    // ── GetSystemSettings ─────────────────────────────────────────────────────

    [Fact]
    public async Task GetSystemSettings_SinConfiguracion_RetornaValoresPorDefecto()
    {
        var service = Build(settingsRepo: SettingsMock(setting: null)); // repo devuelve null

        var result = await service.GetSystemSettingsAsync();

        Assert.Equal(6,               result.WeeksAheadBooking);
        Assert.Equal("America/Bogota", result.TimeZoneId);
    }

    [Fact]
    public async Task GetSystemSettings_ConConfiguracion_RetornaValoresGuardados()
    {
        var saved   = new SystemSetting { WeeksAheadBooking = 4, TimeZoneId = "America/Bogota" };
        var service = Build(settingsRepo: SettingsMock(saved));

        var result = await service.GetSystemSettingsAsync();

        Assert.Equal(4, result.WeeksAheadBooking);
    }

    // ── UpdateSystemSettings ──────────────────────────────────────────────────

    [Theory]
    [InlineData(0)]
    [InlineData(25)]
    [InlineData(-1)]
    public async Task UpdateSystemSettings_SemanasInvalidas_RetornaValidationError(int weeks)
    {
        var service = Build();
        var request = new SystemSettingsRequest { WeeksAheadBooking = weeks, TimeZoneId = "America/Bogota" };

        var result = await service.UpdateSystemSettingsAsync(request);

        Assert.False(result.Succeeded);
        Assert.Equal(OperationStatus.ValidationError, result.Status);
    }

    [Fact]
    public async Task UpdateSystemSettings_DatosValidos_PersisteCambiosYRetornaSuccess()
    {
        var existing     = new SystemSetting { WeeksAheadBooking = 6, TimeZoneId = "America/Bogota" };
        var settingsMock = SettingsMock(existing);
        var service      = Build(settingsRepo: settingsMock);

        var request = new SystemSettingsRequest { WeeksAheadBooking = 3, TimeZoneId = "America/Bogota" };

        var result = await service.UpdateSystemSettingsAsync(request);

        Assert.True(result.Succeeded);
        Assert.Equal(3, result.Data!.WeeksAheadBooking);
        settingsMock.Verify(s => s.SaveChangesAsync(It.IsAny<CancellationToken>()), Times.Once);
    }

    // ── DeleteProviderSchedule ────────────────────────────────────────────────

    [Fact]
    public async Task DeleteProviderSchedule_ProveedorNoExiste_RetornaNotFound()
    {
        var providerRepo = ProviderRepoMock();
        providerRepo.Setup(r => r.GetByIdAsync(It.IsAny<Guid>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((Provider?)null);

        var service = Build(providerRepo: providerRepo);

        var result = await service.DeleteProviderScheduleAsync(Guid.NewGuid());

        Assert.False(result.Succeeded);
        Assert.Equal(OperationStatus.NotFound, result.Status);
        providerRepo.Verify(r => r.SaveChangesAsync(It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task DeleteProviderSchedule_ProveedorExiste_DesactivaYRetornaSuccess()
    {
        var provider = new Provider
        {
            Code = "DOC001", FirstName = "Ana", LastName = "Gómez",
            Specialty = "General", IsActive = true
        };
        var providerRepo = ProviderRepoMock();
        providerRepo.Setup(r => r.GetByIdAsync(provider.Id, It.IsAny<CancellationToken>()))
            .ReturnsAsync(provider);

        var service = Build(providerRepo: providerRepo);

        var result = await service.DeleteProviderScheduleAsync(provider.Id);

        Assert.True(result.Succeeded);
        Assert.False(provider.IsActive);                                          // mutación directa
        providerRepo.Verify(r => r.SaveChangesAsync(It.IsAny<CancellationToken>()), Times.Once);
    }

    // ── SearchPatientsForAdmin ────────────────────────────────────────────────

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    public async Task SearchPatientsForAdmin_TerminoVacio_RetornaListaVaciaSinConsultarRepo(string term)
    {
        var patientRepo = PatientRepoMock();
        var service     = Build(patientRepo: patientRepo);

        var result = await service.SearchPatientsForAdminAsync(term);

        Assert.Empty(result);
        patientRepo.Verify(
            r => r.SearchByTermAsync(It.IsAny<string>(), It.IsAny<int>(), It.IsAny<CancellationToken>()),
            Times.Never);
    }

    // ── UpdatePatient ─────────────────────────────────────────────────────────

    [Fact]
    public async Task UpdatePatient_PacienteNoExiste_RetornaNotFound()
    {
        var patientRepo = PatientRepoMock();
        patientRepo.Setup(r => r.GetByIdAsync(It.IsAny<Guid>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((PatientProfile?)null);

        var service = Build(patientRepo: patientRepo);

        var request = new PatientProfileUpsertRequest
        {
            DocumentNumber = "12345678", FirstName = "Ana",
            LastName = "Gomez", Phone = "3001234567"
        };

        var result = await service.UpdatePatientAsync(Guid.NewGuid(), request);

        Assert.False(result.Succeeded);
        Assert.Equal(OperationStatus.NotFound, result.Status);
        patientRepo.Verify(r => r.SaveChangesAsync(It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task UpdatePatient_DatosValidos_ActualizaPerfil()
    {
        var existing = new PatientProfile
        {
            DocumentNumber = "00000001", FirstName = "Viejo", LastName = "Nombre",
            Phone = "3000000000", Gender = Gender.Male
        };

        var patientRepo     = PatientRepoMock();
        var appointmentRepo = AppointmentRepoMock();
        patientRepo.Setup(r => r.GetByIdAsync(existing.Id, It.IsAny<CancellationToken>()))
            .ReturnsAsync(existing);

        var service = Build(patientRepo: patientRepo, appointmentRepo: appointmentRepo);

        var request = new PatientProfileUpsertRequest
        {
            DocumentNumber = "12345678",
            FirstName      = "Carlos",
            LastName       = "López",
            Phone          = "3009876543",
            Gender         = Gender.Male
        };

        var result = await service.UpdatePatientAsync(existing.Id, request);

        Assert.True(result.Succeeded);
        Assert.Equal("Carlos", result.Data!.FirstName);
        Assert.Equal("López",  result.Data.LastName);
        patientRepo.Verify(r => r.SaveChangesAsync(It.IsAny<CancellationToken>()), Times.Once);
    }

    // ── CreateProviderSchedule — solapamiento de horario → Conflict ───────────

    [Fact]
    public async Task CreateProviderSchedule_HorarioSolapado_RetornaConflict()
    {
        // El repositorio lanza UniqueConstraintException al guardar, simulando un
        // solapamiento de franja detectado por la base de datos.
        var providerRepo = ProviderRepoMock();
        providerRepo
            .Setup(r => r.SaveChangesAsync(It.IsAny<CancellationToken>()))
            .ThrowsAsync(new UniqueConstraintException());

        var service = Build(providerRepo: providerRepo);

        var request = new ProviderScheduleRequest
        {
            FirstName                = "Laura",
            LastName                 = "Rivera",
            Specialty                = "Psicología",
            DefaultSlotIntervalMinutes = 60,
            WeeklyAvailabilities     = new[]
            {
                new WeeklyAvailabilityRequest
                {
                    DayOfWeek           = DayOfWeek.Monday,
                    StartTime           = "08:00",
                    EndTime             = "12:00",
                    SlotIntervalMinutes = 60,
                    IsActive            = true
                }
            }
        };

        var result = await service.CreateProviderScheduleAsync(request);

        Assert.False(result.Succeeded);
        Assert.Equal(OperationStatus.Conflict, result.Status);
    }

    // ── UpdateSystemSettings — weeksAheadBooking = 0 → ValidationError ────────

    [Fact]
    public async Task UpdateSystemSettings_WeeksMenorAUno_RetornaValidationError()
    {
        var service = Build();
        var request = new SystemSettingsRequest { WeeksAheadBooking = 0, TimeZoneId = "America/Bogota" };

        var result = await service.UpdateSystemSettingsAsync(request);

        Assert.False(result.Succeeded);
        Assert.Equal(OperationStatus.ValidationError, result.Status);
        Assert.Contains(result.Errors, e => e.Contains("semanas", StringComparison.OrdinalIgnoreCase));
    }
}
