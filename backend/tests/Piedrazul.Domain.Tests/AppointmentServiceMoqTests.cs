using Moq;
using Piedrazul.Application;
using Piedrazul.Application.Abstractions.Infrastructure;
using Piedrazul.Application.Abstractions.Repositories;
using Piedrazul.Domain;
using Xunit;

namespace Piedrazul.Domain.Tests;

/// <summary>
/// Pruebas de los servicios de citas usando Moq para los repositorios.
/// No se usa base de datos real; todos los colaboradores son mocks o stubs en memoria.
/// </summary>
public sealed class AppointmentServiceMoqTests
{
    // ── Builders de entidades de dominio ──────────────────────────────────────

    private static Provider MakeProvider() => new()
    {
        Code = "DOC001",
        FirstName = "Ana",
        LastName = "Gómez",
        Specialty = "Medicina general",
        DefaultSlotIntervalMinutes = 30,
        IsActive = true
    };

    /// Cita programada con fecha futura y propietario explícito.
    private static Appointment MakeScheduledAppointment(string ownerUserId = "user-123") => new()
    {
        Status          = AppointmentStatus.Scheduled,
        AppointmentDate = DateOnly.FromDateTime(DateTime.Today.AddDays(2)), // 2 días adelante
        StartTime       = new TimeOnly(10, 0),
        EndTime         = new TimeOnly(10, 30),
        PatientProfile  = new PatientProfile { ExternalUserId = ownerUserId },
        Provider        = MakeProvider(),
        CreatedBy       = "test"
    };

    // ── Builders de mocks ─────────────────────────────────────────────────────

    /// Mock de IAppointmentRepository con stubs neutros para operaciones de escritura.
    private static Mock<IAppointmentRepository> AppointmentRepoMock()
    {
        var m = new Mock<IAppointmentRepository>();
        m.Setup(r => r.AddAppointmentAsync(It.IsAny<Appointment>(), It.IsAny<CancellationToken>()))
            .Returns(Task.CompletedTask);
        m.Setup(r => r.AddHistoryAsync(It.IsAny<AppointmentHistory>(), It.IsAny<CancellationToken>()))
            .Returns(Task.CompletedTask);
        m.Setup(r => r.SaveChangesAsync(It.IsAny<CancellationToken>()))
            .Returns(Task.CompletedTask);
        m.Setup(r => r.GetBookedTimesAsync(It.IsAny<Guid>(), It.IsAny<DateOnly>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((IReadOnlyList<TimeOnly>)Array.Empty<TimeOnly>());
        m.Setup(r => r.CountScheduledAppointmentsByPatientIdAsync(It.IsAny<Guid>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(0);
        return m;
    }

    /// Mock de IPatientRepository: por defecto no existe paciente previo.
    private static Mock<IPatientRepository> PatientRepoMock()
    {
        var m = new Mock<IPatientRepository>();
        m.Setup(r => r.GetByDocumentAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((PatientProfile?)null);
        m.Setup(r => r.GetByExternalUserIdAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((PatientProfile?)null);
        m.Setup(r => r.AddAsync(It.IsAny<PatientProfile>(), It.IsAny<CancellationToken>()))
            .Returns(Task.CompletedTask);
        return m;
    }

    /// Mock de IAvailabilityService que expone un único slot disponible a las 09:00.
    private static Mock<IAvailabilityService> AvailabilityMockWithSlot(string startTime = "09:00", string endTime = "09:30")
    {
        var m = new Mock<IAvailabilityService>();
        m.Setup(a => a.GetAvailabilityAsync(It.IsAny<Guid>(), It.IsAny<DateOnly>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(OperationResult<IReadOnlyList<AvailabilitySlotResponse>>.Success(
                new List<AvailabilitySlotResponse> { new(startTime, endTime, Available: true) }));
        return m;
    }

    private static Mock<ISystemSettingsRepository> SettingsMock()
    {
        var m = new Mock<ISystemSettingsRepository>();
        m.Setup(s => s.GetAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(new SystemSetting { WeeksAheadBooking = 6, TimeZoneId = "America/Bogota" });
        return m;
    }

    // ── Factories de servicios ────────────────────────────────────────────────

    private static AppointmentBookingService BuildBookingService(
        Mock<IAppointmentRepository> appointmentRepo,
        Mock<IPatientRepository>     patientRepo,
        Mock<IAvailabilityService>?  availabilityMock = null)
    {
        var cache = new Mock<ICacheService>();
        cache.Setup(c => c.RemoveAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .Returns(Task.CompletedTask);

        return new AppointmentBookingService(
            appointmentRepo.Object,
            patientRepo.Object,
            SettingsMock().Object,
            (availabilityMock ?? AvailabilityMockWithSlot()).Object,
            cache.Object,
            Mock.Of<IAuditLogger>(),
            Mock.Of<INotificationClient>());
    }

    private static AppointmentLifecycleService BuildLifecycleService(
        Mock<IAppointmentRepository> appointmentRepo)
    {
        var cache = new Mock<ICacheService>();
        cache.Setup(c => c.RemoveAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .Returns(Task.CompletedTask);

        return new AppointmentLifecycleService(
            appointmentRepo.Object,
            SettingsMock().Object,
            Mock.Of<IAvailabilityService>(),
            cache.Object,
            Mock.Of<IAuditLogger>(),
            Mock.Of<INotificationClient>());
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 1. Crear cita con datos válidos → OperationResult.Success
    // ─────────────────────────────────────────────────────────────────────────

    [Fact]
    public async Task CreatePublicAppointment_ConDatosValidos_RetornaSuccess()
    {
        var provider = MakeProvider();

        var appointmentRepo = AppointmentRepoMock();
        appointmentRepo
            .Setup(r => r.GetActiveProviderAsync(provider.Id, It.IsAny<CancellationToken>()))
            .ReturnsAsync(provider);

        var patientRepo    = PatientRepoMock();
        var availability   = AvailabilityMockWithSlot("09:00", "09:30");
        var service        = BuildBookingService(appointmentRepo, patientRepo, availability);

        var request = new PublicAppointmentRequest
        {
            ProviderId      = provider.Id,
            AppointmentDate = DateOnly.FromDateTime(DateTime.Today.AddDays(1)),
            StartTime       = "09:00",
            DocumentNumber  = "12345678",
            FirstName       = "Ana",
            LastName        = "Gomez",
            Phone           = "3001234567",
            BookAsGuest     = true
        };

        var result = await service.CreatePublicAppointmentAsync(request, null, "test");

        Assert.True(result.Succeeded);
        Assert.Equal(OperationStatus.Success, result.Status);
        Assert.NotNull(result.Data);
        Assert.Equal("09:00", result.Data.StartTime);
        Assert.Equal("09:30", result.Data.EndTime);

        // Verificar que el repositorio recibió la llamada para persistir la cita
        appointmentRepo.Verify(
            r => r.AddAppointmentAsync(It.IsAny<Appointment>(), It.IsAny<CancellationToken>()),
            Times.Once);
        appointmentRepo.Verify(
            r => r.SaveChangesAsync(It.IsAny<CancellationToken>()),
            Times.Once);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 2. Crear cita con médico inexistente → OperationStatus.NotFound
    // ─────────────────────────────────────────────────────────────────────────

    [Fact]
    public async Task CreatePublicAppointment_MedicoInexistente_RetornaNotFound()
    {
        var appointmentRepo = AppointmentRepoMock();
        appointmentRepo
            .Setup(r => r.GetActiveProviderAsync(It.IsAny<Guid>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((Provider?)null); // repositorio devuelve null → médico no existe

        var service = BuildBookingService(appointmentRepo, PatientRepoMock());

        var request = new PublicAppointmentRequest
        {
            ProviderId      = Guid.NewGuid(),
            AppointmentDate = DateOnly.FromDateTime(DateTime.Today.AddDays(1)),
            StartTime       = "09:00",
            DocumentNumber  = "12345678",
            FirstName       = "Ana",
            LastName        = "Gomez",
            Phone           = "3001234567"
        };

        var result = await service.CreatePublicAppointmentAsync(request, null, "test");

        Assert.False(result.Succeeded);
        Assert.Equal(OperationStatus.NotFound, result.Status);

        // La cita nunca debe persistirse cuando el médico no existe
        appointmentRepo.Verify(
            r => r.AddAppointmentAsync(It.IsAny<Appointment>(), It.IsAny<CancellationToken>()),
            Times.Never);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 3. Reagendar cita ya cancelada → OperationStatus.ValidationError
    // ─────────────────────────────────────────────────────────────────────────

    [Fact]
    public async Task RescheduleAppointment_CitaYaCancelada_RetornaValidationError()
    {
        var cancelledAppointment = new Appointment
        {
            Status          = AppointmentStatus.Cancelled,  // estado terminal
            AppointmentDate = DateOnly.FromDateTime(DateTime.Today.AddDays(1)),
            StartTime       = new TimeOnly(9, 0),
            PatientProfile  = new PatientProfile { ExternalUserId = "user-123" },
            Provider        = MakeProvider(),
            CreatedBy       = "test"
        };

        var appointmentRepo = AppointmentRepoMock();
        appointmentRepo
            .Setup(r => r.GetAppointmentByIdAsync(cancelledAppointment.Id, It.IsAny<CancellationToken>()))
            .ReturnsAsync(cancelledAppointment);

        var service = BuildLifecycleService(appointmentRepo);

        var request = new RescheduleAppointmentRequest
        {
            AppointmentId = cancelledAppointment.Id,
            NewDate       = DateOnly.FromDateTime(DateTime.Today.AddDays(3)),
            NewStartTime  = "09:00"
        };

        var result = await service.RescheduleAppointmentAsync(request, "test");

        Assert.False(result.Succeeded);
        Assert.Equal(OperationStatus.ValidationError, result.Status);
        Assert.Contains(result.Errors, e => e.Contains("programadas", StringComparison.OrdinalIgnoreCase));

        // Al rechazarse, no debe guardarse ningún cambio
        appointmentRepo.Verify(
            r => r.SaveChangesAsync(It.IsAny<CancellationToken>()),
            Times.Never);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 4. Cancelar cita programada → estado cambia a Cancelled
    // ─────────────────────────────────────────────────────────────────────────

    [Fact]
    public async Task CancelPatientAppointment_CitaProgramada_CambiaEstadoACancelled()
    {
        const string userId  = "user-abc";
        var appointment      = MakeScheduledAppointment(ownerUserId: userId);

        var appointmentRepo = AppointmentRepoMock();
        appointmentRepo
            .Setup(r => r.GetAppointmentByIdAsync(appointment.Id, It.IsAny<CancellationToken>()))
            .ReturnsAsync(appointment);

        var service = BuildLifecycleService(appointmentRepo);

        var result = await service.CancelPatientAppointmentAsync(appointment.Id, userId);

        // La operación debe ser exitosa
        Assert.True(result.Succeeded);
        Assert.Equal(OperationStatus.Success, result.Status);

        // El estado de la entidad debe haberse mutado a Cancelled
        Assert.Equal(AppointmentStatus.Cancelled, appointment.Status);

        // La respuesta mapeada debe reflejar la traducción española del estado
        Assert.Equal("Cancelada", result.Data!.Status);

        // El repositorio debe haber persistido el cambio exactamente una vez
        appointmentRepo.Verify(
            r => r.SaveChangesAsync(It.IsAny<CancellationToken>()),
            Times.Once);
    }
}
