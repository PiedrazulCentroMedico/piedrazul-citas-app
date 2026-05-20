using System.Text;
using Piedrazul.Application;
using Piedrazul.Application.Abstractions.Infrastructure;
using Piedrazul.Application.Abstractions.Repositories;
using Piedrazul.Domain;
using Xunit;

namespace Piedrazul.Domain.Tests;

/// <summary>
/// Tests de los servicios de citas usando implementaciones falsas (fake/stub) de los repositorios
/// e infraestructura, sin depender de base de datos ni servicios externos.
/// </summary>
public sealed class AppointmentServiceTests
{
    // ── Implementaciones falsas ───────────────────────────────────────────────

    private sealed class FakeAppointmentRepo : IAppointmentRepository
    {
        public Provider? ProviderToReturn { get; set; }
        public Appointment? AppointmentToReturn { get; set; }
        public IReadOnlyList<WeeklyAvailability> Availabilities { get; set; } = Array.Empty<WeeklyAvailability>();
        public IReadOnlyList<TimeOnly> BookedTimes { get; set; } = Array.Empty<TimeOnly>();

        public Task<IReadOnlyList<Provider>> GetActiveProvidersAsync(CancellationToken ct = default) =>
            Task.FromResult<IReadOnlyList<Provider>>(
                ProviderToReturn is null ? Array.Empty<Provider>() : new[] { ProviderToReturn });

        public Task<Provider?> GetActiveProviderAsync(Guid id, CancellationToken ct = default) =>
            Task.FromResult(ProviderToReturn);

        public Task<IReadOnlyList<WeeklyAvailability>> GetWeeklyAvailabilitiesAsync(Guid id, DayOfWeek dow, CancellationToken ct = default) =>
            Task.FromResult(Availabilities);

        public Task<IReadOnlyList<TimeOnly>> GetBookedTimesAsync(Guid id, DateOnly date, CancellationToken ct = default) =>
            Task.FromResult(BookedTimes);

        public Task<IReadOnlyList<Appointment>> GetAppointmentsByProviderAndDateAsync(Guid id, DateOnly date, CancellationToken ct = default) =>
            Task.FromResult<IReadOnlyList<Appointment>>(Array.Empty<Appointment>());

        public Task<Appointment?> GetAppointmentByIdAsync(Guid id, CancellationToken ct = default) =>
            Task.FromResult(AppointmentToReturn);

        public Task<IReadOnlyList<Appointment>> GetAppointmentsByDocumentAsync(string doc, CancellationToken ct = default) =>
            Task.FromResult<IReadOnlyList<Appointment>>(Array.Empty<Appointment>());

        public Task<IReadOnlyList<AppointmentHistory>> GetHistoryAsync(Guid id, CancellationToken ct = default) =>
            Task.FromResult<IReadOnlyList<AppointmentHistory>>(Array.Empty<AppointmentHistory>());

        public Task<int> CountScheduledAppointmentsByPatientIdAsync(Guid id, CancellationToken ct = default) =>
            Task.FromResult(0);

        public Task AddAppointmentAsync(Appointment appointment, CancellationToken ct = default) =>
            Task.CompletedTask;

        public Task AddHistoryAsync(AppointmentHistory history, CancellationToken ct = default) =>
            Task.CompletedTask;

        public Task SaveChangesAsync(CancellationToken ct = default) =>
            Task.CompletedTask;
    }

    private sealed class FakePatientRepo : IPatientRepository
    {
        public Task<PatientProfile?> GetByIdAsync(Guid id, CancellationToken ct = default) =>
            Task.FromResult<PatientProfile?>(null);

        public Task<PatientProfile?> GetByExternalUserIdAsync(string id, CancellationToken ct = default) =>
            Task.FromResult<PatientProfile?>(null);

        public Task<PatientProfile?> GetByDocumentAsync(string doc, CancellationToken ct = default) =>
            Task.FromResult<PatientProfile?>(null);

        public Task<IReadOnlyList<PatientProfile>> SearchByPrefixAsync(string term, int take, CancellationToken ct = default) =>
            Task.FromResult<IReadOnlyList<PatientProfile>>(Array.Empty<PatientProfile>());

        public Task<IReadOnlyList<PatientProfile>> SearchByTermAsync(string term, int take, CancellationToken ct = default) =>
            Task.FromResult<IReadOnlyList<PatientProfile>>(Array.Empty<PatientProfile>());

        public Task AddAsync(PatientProfile patient, CancellationToken ct = default) =>
            Task.CompletedTask;

        public Task SaveChangesAsync(CancellationToken ct = default) =>
            Task.CompletedTask;
    }

    private sealed class FakeSettingsRepo : ISystemSettingsRepository
    {
        public Task<SystemSetting?> GetAsync(CancellationToken ct = default) =>
            Task.FromResult<SystemSetting?>(new SystemSetting { WeeksAheadBooking = 8, TimeZoneId = "America/Bogota" });

        public Task AddAsync(SystemSetting s, CancellationToken ct = default) =>
            Task.CompletedTask;

        public Task SaveChangesAsync(CancellationToken ct = default) =>
            Task.CompletedTask;
    }

    /// ICacheService sin almacenamiento real: ejecuta directamente el factory.
    private sealed class PassThroughCache : ICacheService
    {
        public Task<T?> GetOrSetAsync<T>(string key, TimeSpan ttl, Func<Task<T>> factory, CancellationToken ct = default) =>
            factory()!;

        public Task RemoveAsync(string key, CancellationToken ct = default) =>
            Task.CompletedTask;
    }

    private sealed class NoOpAuditLogger : IAuditLogger
    {
        public Task LogAsync(string action, object data, CancellationToken ct = default) =>
            Task.CompletedTask;
    }

    private sealed class NoOpNotifications : INotificationClient
    {
        public Task NotifyAppointmentCreatedAsync(Appointment a, CancellationToken ct = default) =>
            Task.CompletedTask;

        public Task NotifyAppointmentStatusChangedAsync(Appointment a, CancellationToken ct = default) =>
            Task.CompletedTask;
    }

    private sealed class NoOpPdfExporter : IAppointmentPdfExporter
    {
        public byte[] Export(string c, string p, string s, DateOnly d, IReadOnlyList<AppointmentResponse> items) =>
            Array.Empty<byte>();
    }

    private sealed class NoOpExcelExporter : IAppointmentExcelExporter
    {
        public byte[] Export(string c, string p, string s, DateOnly d, IReadOnlyList<AppointmentResponse> items) =>
            Array.Empty<byte>();
    }

    /// <summary>
    /// Fake IAvailabilityService que devuelve un slot disponible a las 09:00.
    /// Usado por AppointmentBookingService y AppointmentLifecycleService en tests.
    /// </summary>
    private sealed class FakeAvailabilityService : IAvailabilityService
    {
        public Task<IReadOnlyList<ProviderSummaryResponse>> GetActiveProvidersAsync(CancellationToken ct = default) =>
            Task.FromResult<IReadOnlyList<ProviderSummaryResponse>>(Array.Empty<ProviderSummaryResponse>());

        public Task<OperationResult<IReadOnlyList<AvailabilitySlotResponse>>> GetAvailabilityAsync(Guid providerId, DateOnly date, CancellationToken ct = default) =>
            Task.FromResult(OperationResult<IReadOnlyList<AvailabilitySlotResponse>>.Success(
                (IReadOnlyList<AvailabilitySlotResponse>)new List<AvailabilitySlotResponse>
                {
                    new("09:00", "09:30", Available: true)
                }));
    }

    // ── Factory helpers ───────────────────────────────────────────────────────

    private static AppointmentBookingService BuildBookingService(
        FakeAppointmentRepo? appointmentRepo = null,
        FakePatientRepo? patientRepo = null)
    {
        return new AppointmentBookingService(
            appointmentRepo ?? new FakeAppointmentRepo(),
            patientRepo ?? new FakePatientRepo(),
            new FakeSettingsRepo(),
            new FakeAvailabilityService(),
            new PassThroughCache(),
            new NoOpAuditLogger(),
            new NoOpNotifications());
    }

    private static AvailabilityService BuildAvailabilityService(
        FakeAppointmentRepo? appointmentRepo = null)
    {
        return new AvailabilityService(
            appointmentRepo ?? new FakeAppointmentRepo(),
            new FakeSettingsRepo(),
            new PassThroughCache());
    }

    private static AppointmentQueryService BuildQueryService(
        FakeAppointmentRepo? appointmentRepo = null)
    {
        return new AppointmentQueryService(
            appointmentRepo ?? new FakeAppointmentRepo(),
            new NoOpPdfExporter(),
            new NoOpExcelExporter());
    }

    private static AppointmentLifecycleService BuildLifecycleService(
        FakeAppointmentRepo? appointmentRepo = null)
    {
        return new AppointmentLifecycleService(
            appointmentRepo ?? new FakeAppointmentRepo(),
            new FakeSettingsRepo(),
            new FakeAvailabilityService(),
            new PassThroughCache(),
            new NoOpAuditLogger(),
            new NoOpNotifications());
    }

    private static PatientLookupService BuildPatientLookupService(
        FakePatientRepo? patientRepo = null,
        FakeAppointmentRepo? appointmentRepo = null)
    {
        return new PatientLookupService(
            patientRepo ?? new FakePatientRepo(),
            appointmentRepo ?? new FakeAppointmentRepo());
    }

    // ── CreatePublicAppointment – validaciones de campos ─────────────────────

    [Fact]
    public async Task CreatePublicAppointment_ShouldReturnValidation_WhenProviderIdIsEmpty()
    {
        var service = BuildBookingService();
        var request = new PublicAppointmentRequest
        {
            ProviderId = Guid.Empty,                                          // ← inválido
            AppointmentDate = DateOnly.FromDateTime(DateTime.Today.AddDays(1)),
            StartTime = "08:00",
            DocumentNumber = "12345678",
            FirstName = "Ana",
            LastName = "Gomez",
            Phone = "3001234567"
        };

        var result = await service.CreatePublicAppointmentAsync(request, null, "test");

        Assert.False(result.Succeeded);
        Assert.Equal(OperationStatus.ValidationError, result.Status);
        Assert.Contains(result.Errors, e => e.Contains("médico", StringComparison.OrdinalIgnoreCase));
    }

    [Fact]
    public async Task CreatePublicAppointment_ShouldReturnValidation_WhenDateIsDefault()
    {
        var service = BuildBookingService();
        var request = new PublicAppointmentRequest
        {
            ProviderId = Guid.NewGuid(),
            AppointmentDate = default,              // ← inválido
            StartTime = "08:00",
            DocumentNumber = "12345678",
            FirstName = "Ana",
            LastName = "Gomez",
            Phone = "3001234567"
        };

        var result = await service.CreatePublicAppointmentAsync(request, null, "test");

        Assert.False(result.Succeeded);
        Assert.Equal(OperationStatus.ValidationError, result.Status);
        Assert.Contains(result.Errors, e => e.Contains("fecha", StringComparison.OrdinalIgnoreCase));
    }

    [Fact]
    public async Task CreatePublicAppointment_ShouldReturnValidation_WhenStartTimeIsEmpty()
    {
        var service = BuildBookingService();
        var request = new PublicAppointmentRequest
        {
            ProviderId = Guid.NewGuid(),
            AppointmentDate = DateOnly.FromDateTime(DateTime.Today.AddDays(1)),
            StartTime = "",                         // ← inválido
            DocumentNumber = "12345678",
            FirstName = "Ana",
            LastName = "Gomez",
            Phone = "3001234567"
        };

        var result = await service.CreatePublicAppointmentAsync(request, null, "test");

        Assert.False(result.Succeeded);
        Assert.Equal(OperationStatus.ValidationError, result.Status);
        Assert.Contains(result.Errors, e => e.Contains("franja", StringComparison.OrdinalIgnoreCase));
    }

    [Fact]
    public async Task CreatePublicAppointment_ShouldReturnValidation_WhenDocumentContainsLetters()
    {
        var service = BuildBookingService();
        var request = new PublicAppointmentRequest
        {
            ProviderId = Guid.NewGuid(),
            AppointmentDate = DateOnly.FromDateTime(DateTime.Today.AddDays(1)),
            StartTime = "08:00",
            DocumentNumber = "ABC123",              // ← inválido
            FirstName = "Ana",
            LastName = "Gomez",
            Phone = "3001234567"
        };

        var result = await service.CreatePublicAppointmentAsync(request, null, "test");

        Assert.False(result.Succeeded);
        Assert.Equal(OperationStatus.ValidationError, result.Status);
        Assert.Contains(result.Errors, e => e.Contains("documento", StringComparison.OrdinalIgnoreCase));
    }

    [Fact]
    public async Task CreatePublicAppointment_ShouldReturnMultipleErrors_WhenSeveralFieldsAreInvalid()
    {
        var service = BuildBookingService();
        var request = new PublicAppointmentRequest
        {
            ProviderId = Guid.Empty,               // ← inválido
            AppointmentDate = default,             // ← inválido
            StartTime = "",                        // ← inválido
            DocumentNumber = "XYZ",               // ← inválido
            FirstName = "A",                      // ← demasiado corto
            LastName = "B",                       // ← demasiado corto
            Phone = "123"                         // ← demasiado corto
        };

        var result = await service.CreatePublicAppointmentAsync(request, null, "test");

        Assert.False(result.Succeeded);
        Assert.True(result.Errors.Count >= 4, $"Se esperaban al menos 4 errores, se obtuvieron {result.Errors.Count}");
    }

    // ── CreatePublicAppointment – interacción con repositorio ─────────────────

    [Fact]
    public async Task CreatePublicAppointment_ShouldReturnNotFound_WhenProviderDoesNotExist()
    {
        var fakeRepo = new FakeAppointmentRepo { ProviderToReturn = null };  // ← proveedor inexistente
        var service = BuildBookingService(appointmentRepo: fakeRepo);
        var request = new PublicAppointmentRequest
        {
            ProviderId = Guid.NewGuid(),
            AppointmentDate = DateOnly.FromDateTime(DateTime.Today.AddDays(1)),
            StartTime = "08:00",
            DocumentNumber = "12345678",
            FirstName = "Ana",
            LastName = "Gomez",
            Phone = "3001234567"
        };

        var result = await service.CreatePublicAppointmentAsync(request, null, "test");

        Assert.False(result.Succeeded);
        Assert.Equal(OperationStatus.NotFound, result.Status);
    }

    // ── CreateInternalAppointment – validaciones ──────────────────────────────

    [Fact]
    public async Task CreateInternalAppointment_ShouldReturnValidation_WhenNotesExceedMaxLength()
    {
        var service = BuildBookingService();
        var request = new InternalCreateAppointmentRequest
        {
            ProviderId = Guid.NewGuid(),
            AppointmentDate = DateOnly.FromDateTime(DateTime.Today.AddDays(1)),
            StartTime = "08:00",
            DocumentNumber = "12345678",
            FirstName = "Ana",
            LastName = "Gomez",
            Phone = "3001234567",
            Notes = new string('A', 501)           // ← supera 500 caracteres
        };

        var result = await service.CreateInternalAppointmentAsync(request, "test");

        Assert.False(result.Succeeded);
        Assert.Equal(OperationStatus.ValidationError, result.Status);
        Assert.Contains(result.Errors, e => e.Contains("observaciones", StringComparison.OrdinalIgnoreCase));
    }

    // ── GetAvailability ───────────────────────────────────────────────────────

    [Fact]
    public async Task GetAvailability_ShouldReturnNotFound_WhenProviderDoesNotExist()
    {
        var fakeRepo = new FakeAppointmentRepo { ProviderToReturn = null };
        var service = BuildAvailabilityService(appointmentRepo: fakeRepo);

        var result = await service.GetAvailabilityAsync(Guid.NewGuid(), DateOnly.FromDateTime(DateTime.Today.AddDays(1)));

        Assert.False(result.Succeeded);
        Assert.Equal(OperationStatus.NotFound, result.Status);
    }

    [Fact]
    public async Task GetAvailability_ShouldReturnValidation_WhenDateIsInThePast()
    {
        var provider = new Provider { FirstName = "Dr", LastName = "Test", Specialty = "General" };
        var fakeRepo = new FakeAppointmentRepo { ProviderToReturn = provider };
        var service = BuildAvailabilityService(appointmentRepo: fakeRepo);

        var pastDate = DateOnly.FromDateTime(DateTime.Today.AddDays(-1));
        var result = await service.GetAvailabilityAsync(provider.Id, pastDate);

        Assert.False(result.Succeeded);
        Assert.Equal(OperationStatus.ValidationError, result.Status);
        Assert.Contains(result.Errors, e => e.Contains("pasadas", StringComparison.OrdinalIgnoreCase));
    }

    [Fact]
    public async Task GetAvailability_ShouldReturnEmptySlots_WhenProviderHasNoAvailability()
    {
        var provider = new Provider { FirstName = "Dr", LastName = "Test", Specialty = "General" };
        var fakeRepo = new FakeAppointmentRepo
        {
            ProviderToReturn = provider,
            Availabilities = Array.Empty<WeeklyAvailability>()  // ← sin horario configurado
        };
        var service = BuildAvailabilityService(appointmentRepo: fakeRepo);

        var result = await service.GetAvailabilityAsync(provider.Id, DateOnly.FromDateTime(DateTime.Today.AddDays(1)));

        Assert.True(result.Succeeded);
        Assert.Empty(result.Data!);
    }

    // ── GetAppointmentsByDocument ─────────────────────────────────────────────

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    public async Task GetAppointmentsByDocument_ShouldReturnEmpty_WhenDocumentIsBlankOrWhitespace(string doc)
    {
        var service = BuildQueryService();

        var result = await service.GetAppointmentsByDocumentAsync(doc);

        Assert.Empty(result);
    }

    // ── SearchPatients ────────────────────────────────────────────────────────

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    public async Task SearchPatients_ShouldReturnEmpty_WhenTermIsBlankOrWhitespace(string term)
    {
        var service = BuildPatientLookupService();

        var result = await service.SearchPatientsAsync(term);

        Assert.Empty(result);
    }

    // ── CancelPatientAppointment ──────────────────────────────────────────────

    [Fact]
    public async Task CancelPatientAppointment_ShouldReturnNotFound_WhenAppointmentDoesNotExist()
    {
        var fakeRepo = new FakeAppointmentRepo { AppointmentToReturn = null };
        var service = BuildLifecycleService(appointmentRepo: fakeRepo);

        var result = await service.CancelPatientAppointmentAsync(Guid.NewGuid(), "usuario-externo");

        Assert.False(result.Succeeded);
        Assert.Equal(OperationStatus.NotFound, result.Status);
    }

    [Fact]
    public async Task CancelPatientAppointment_ShouldReturnConflict_WhenUserIsNotOwner()
    {
        var appointment = new Appointment
        {
            Status = AppointmentStatus.Scheduled,
            AppointmentDate = DateOnly.FromDateTime(DateTime.Today.AddDays(1)),
            StartTime = new TimeOnly(10, 0),
            PatientProfile = new PatientProfile { ExternalUserId = "dueno-123" },
            Provider = new Provider { FirstName = "Dr", LastName = "Test", Specialty = "General" }
        };
        var fakeRepo = new FakeAppointmentRepo { AppointmentToReturn = appointment };
        var service = BuildLifecycleService(appointmentRepo: fakeRepo);

        var result = await service.CancelPatientAppointmentAsync(appointment.Id, "otro-usuario");

        Assert.False(result.Succeeded);
        Assert.Equal(OperationStatus.Conflict, result.Status);
    }

    [Fact]
    public async Task CancelPatientAppointment_ShouldReturnValidation_WhenAppointmentIsAlreadyCompleted()
    {
        var appointment = new Appointment
        {
            Status = AppointmentStatus.Completed,  // ← ya no está programada
            AppointmentDate = DateOnly.FromDateTime(DateTime.Today.AddDays(1)),
            StartTime = new TimeOnly(10, 0),
            PatientProfile = new PatientProfile { ExternalUserId = "usuario-123" },
            Provider = new Provider { FirstName = "Dr", LastName = "Test", Specialty = "General" }
        };
        var fakeRepo = new FakeAppointmentRepo { AppointmentToReturn = appointment };
        var service = BuildLifecycleService(appointmentRepo: fakeRepo);

        var result = await service.CancelPatientAppointmentAsync(appointment.Id, "usuario-123");

        Assert.False(result.Succeeded);
        Assert.Equal(OperationStatus.ValidationError, result.Status);
    }

    // ── ExportAppointmentsCsv – formato ──────────────────────────────────────

    [Fact]
    public async Task ExportCsv_ShouldContainRequiredHeaders_WhenProviderHasNoAppointments()
    {
        var provider = new Provider
        {
            FirstName = "Ana", LastName = "Gomez",
            Specialty = "Fisioterapia", DefaultSlotIntervalMinutes = 30
        };
        var fakeRepo = new FakeAppointmentRepo { ProviderToReturn = provider };
        var service = BuildQueryService(appointmentRepo: fakeRepo);

        var bytes = await service.ExportAppointmentsCsvAsync(provider.Id, DateOnly.FromDateTime(DateTime.Today));
        var csv = Encoding.UTF8.GetString(bytes);

        Assert.Contains("Hora", csv);
        Assert.Contains("Paciente", csv);
        Assert.Contains("Documento", csv);
        Assert.Contains("Canal", csv);
        Assert.Contains("Estado", csv);
        Assert.Contains("Observaciones", csv);
    }

    [Fact]
    public async Task ExportCsv_ShouldReturnEmptyBytes_WhenProviderDoesNotExist()
    {
        var fakeRepo = new FakeAppointmentRepo { ProviderToReturn = null };
        var service = BuildQueryService(appointmentRepo: fakeRepo);

        var bytes = await service.ExportAppointmentsCsvAsync(Guid.NewGuid(), DateOnly.FromDateTime(DateTime.Today));

        Assert.Empty(bytes);
    }

    // ── RescheduleAppointment – validaciones ──────────────────────────────────

    [Fact]
    public async Task RescheduleAppointment_ShouldReturnValidation_WhenAppointmentIdIsEmpty()
    {
        var service = BuildLifecycleService();
        var request = new RescheduleAppointmentRequest
        {
            AppointmentId = Guid.Empty,            // ← inválido
            NewDate = DateOnly.FromDateTime(DateTime.Today.AddDays(1)),
            NewStartTime = "09:00"
        };

        var result = await service.RescheduleAppointmentAsync(request, "test");

        Assert.False(result.Succeeded);
        Assert.Equal(OperationStatus.ValidationError, result.Status);
    }

    [Fact]
    public async Task RescheduleAppointment_ShouldReturnValidation_WhenNewDateIsDefault()
    {
        var service = BuildLifecycleService();
        var request = new RescheduleAppointmentRequest
        {
            AppointmentId = Guid.NewGuid(),
            NewDate = default,                     // ← inválido
            NewStartTime = "09:00"
        };

        var result = await service.RescheduleAppointmentAsync(request, "test");

        Assert.False(result.Succeeded);
        Assert.Equal(OperationStatus.ValidationError, result.Status);
    }
}
