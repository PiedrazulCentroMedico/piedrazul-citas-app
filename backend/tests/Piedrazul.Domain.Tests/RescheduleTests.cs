using Piedrazul.Application;
using Piedrazul.Application.Abstractions.Infrastructure;
using Piedrazul.Application.Abstractions.Repositories;
using Piedrazul.Domain;
using Xunit;

namespace Piedrazul.Domain.Tests;

public sealed class RescheduleTests
{
    // ── Fakes ─────────────────────────────────────────────────────────────────

    private sealed class StubAppointmentRepo : IAppointmentRepository
    {
        public Appointment? AppointmentToReturn { get; set; }
        public AppointmentHistory? CapturedHistory { get; private set; }

        public Task<Appointment?> GetAppointmentByIdAsync(Guid id, CancellationToken ct = default) =>
            Task.FromResult(AppointmentToReturn);

        public Task AddHistoryAsync(AppointmentHistory history, CancellationToken ct = default)
        {
            CapturedHistory = history;
            return Task.CompletedTask;
        }

        public Task SaveChangesAsync(CancellationToken ct = default) => Task.CompletedTask;

        public Task<IReadOnlyList<Provider>> GetActiveProvidersAsync(CancellationToken ct = default) =>
            Task.FromResult<IReadOnlyList<Provider>>(Array.Empty<Provider>());

        public Task<Provider?> GetActiveProviderAsync(Guid id, CancellationToken ct = default) =>
            Task.FromResult<Provider?>(null);

        public Task<IReadOnlyList<WeeklyAvailability>> GetWeeklyAvailabilitiesAsync(Guid id, DayOfWeek dow, CancellationToken ct = default) =>
            Task.FromResult<IReadOnlyList<WeeklyAvailability>>(Array.Empty<WeeklyAvailability>());

        public Task<IReadOnlyList<TimeOnly>> GetBookedTimesAsync(Guid id, DateOnly date, CancellationToken ct = default) =>
            Task.FromResult<IReadOnlyList<TimeOnly>>(Array.Empty<TimeOnly>());

        public Task<IReadOnlyList<Appointment>> GetAppointmentsByProviderAndDateAsync(Guid id, DateOnly date, CancellationToken ct = default) =>
            Task.FromResult<IReadOnlyList<Appointment>>(Array.Empty<Appointment>());

        public Task<IReadOnlyList<Appointment>> GetAppointmentsByDocumentAsync(string doc, CancellationToken ct = default) =>
            Task.FromResult<IReadOnlyList<Appointment>>(Array.Empty<Appointment>());

        public Task<IReadOnlyList<AppointmentHistory>> GetHistoryAsync(Guid id, CancellationToken ct = default) =>
            Task.FromResult<IReadOnlyList<AppointmentHistory>>(Array.Empty<AppointmentHistory>());

        public Task<int> CountScheduledAppointmentsByPatientIdAsync(Guid id, CancellationToken ct = default) =>
            Task.FromResult(0);

        public Task<Dictionary<Guid, int>> CountScheduledByPatientIdsAsync(IReadOnlyList<Guid> patientIds, CancellationToken ct = default) =>
            Task.FromResult(new Dictionary<Guid, int>());

        public Task AddAppointmentAsync(Appointment appointment, CancellationToken ct = default) =>
            Task.CompletedTask;
    }

    private sealed class StubSettingsRepo : ISystemSettingsRepository
    {
        public Task<SystemSetting?> GetAsync(CancellationToken ct = default) =>
            Task.FromResult<SystemSetting?>(new SystemSetting { WeeksAheadBooking = 8, TimeZoneId = "America/Bogota" });

        public Task AddAsync(SystemSetting s, CancellationToken ct = default) => Task.CompletedTask;
        public Task SaveChangesAsync(CancellationToken ct = default) => Task.CompletedTask;
    }

    /// Devuelve un slot disponible a las 09:00–09:30.
    private sealed class StubAvailabilityService : IAvailabilityService
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

    private sealed class NoOpCache : ICacheService
    {
        public Task<T?> GetOrSetAsync<T>(string key, TimeSpan ttl, Func<Task<T>> factory, CancellationToken ct = default) =>
            factory()!;

        public Task RemoveAsync(string key, CancellationToken ct = default) => Task.CompletedTask;
    }

    private sealed class NoOpAudit : IAuditLogger
    {
        public Task LogAsync(string action, object data, CancellationToken ct = default) => Task.CompletedTask;
    }

    private sealed class NoOpNotifications : INotificationClient
    {
        public Task NotifyAppointmentCreatedAsync(Appointment a, CancellationToken ct = default) => Task.CompletedTask;
        public Task NotifyAppointmentStatusChangedAsync(Appointment a, CancellationToken ct = default) => Task.CompletedTask;
    }

    // ── Factory ───────────────────────────────────────────────────────────────

    private static AppointmentLifecycleService BuildService(StubAppointmentRepo repo) =>
        new(repo, new StubSettingsRepo(), new StubAvailabilityService(), new NoOpCache(), new NoOpAudit(), new NoOpNotifications());

    private static Appointment BuildScheduledAppointment() => new()
    {
        ProviderId      = Guid.NewGuid(),
        AppointmentDate = DateOnly.FromDateTime(DateTime.Today.AddDays(1)),
        StartTime       = new TimeOnly(8, 0),
        EndTime         = new TimeOnly(8, 30),
        Status          = AppointmentStatus.Scheduled,
    };

    // ── Tests ─────────────────────────────────────────────────────────────────

    [Fact]
    public async Task Reschedule_ShouldSucceed_AndCreateHistoryEntry_WhenAppointmentIsScheduledAndDataIsValid()
    {
        var appointment = BuildScheduledAppointment();
        var repo        = new StubAppointmentRepo { AppointmentToReturn = appointment };
        var service     = BuildService(repo);

        var previousDate  = appointment.AppointmentDate;
        var previousStart = appointment.StartTime;
        var previousEnd   = appointment.EndTime;
        var newDate       = DateOnly.FromDateTime(DateTime.Today.AddDays(3));

        var request = new RescheduleAppointmentRequest
        {
            AppointmentId = appointment.Id,
            NewDate       = newDate,
            NewStartTime  = "09:00",
            Reason        = "Reagendamiento de prueba"
        };

        var result = await service.RescheduleAppointmentAsync(request, "admin@piedrazul.local");

        Assert.True(result.Succeeded);
        Assert.NotNull(repo.CapturedHistory);
        Assert.Equal(previousDate,  repo.CapturedHistory.PreviousDate);
        Assert.Equal(previousStart, repo.CapturedHistory.PreviousStartTime);
        Assert.Equal(previousEnd,   repo.CapturedHistory.PreviousEndTime);
        Assert.Equal(newDate,       repo.CapturedHistory.NewDate);
        Assert.Equal(new TimeOnly(9, 0),  repo.CapturedHistory.NewStartTime);
        Assert.Equal(new TimeOnly(9, 30), repo.CapturedHistory.NewEndTime);
        Assert.Equal("admin@piedrazul.local", repo.CapturedHistory.ChangedBy);
    }

    [Fact]
    public async Task Reschedule_ShouldReturnValidationError_WhenAppointmentIsCancelled()
    {
        var appointment = BuildScheduledAppointment();
        appointment.Status = AppointmentStatus.Cancelled;

        var repo    = new StubAppointmentRepo { AppointmentToReturn = appointment };
        var service = BuildService(repo);

        var request = new RescheduleAppointmentRequest
        {
            AppointmentId = appointment.Id,
            NewDate       = DateOnly.FromDateTime(DateTime.Today.AddDays(2)),
            NewStartTime  = "09:00",
        };

        var result = await service.RescheduleAppointmentAsync(request, "admin@piedrazul.local");

        Assert.False(result.Succeeded);
        Assert.Equal(OperationStatus.ValidationError, result.Status);
    }

    [Fact]
    public async Task Reschedule_ShouldReturnValidationError_WhenNewDateIsInThePast()
    {
        var appointment = BuildScheduledAppointment();
        var repo        = new StubAppointmentRepo { AppointmentToReturn = appointment };
        var service     = BuildService(repo);

        var request = new RescheduleAppointmentRequest
        {
            AppointmentId = appointment.Id,
            NewDate       = DateOnly.FromDateTime(DateTime.Today.AddDays(-1)),
            NewStartTime  = "09:00",
        };

        var result = await service.RescheduleAppointmentAsync(request, "admin@piedrazul.local");

        Assert.False(result.Succeeded);
        Assert.Equal(OperationStatus.ValidationError, result.Status);
        Assert.Contains(result.Errors, e => e.Contains("pasada", StringComparison.OrdinalIgnoreCase));
    }

    [Fact]
    public async Task Reschedule_ShouldReturnValidationError_WhenReasonExceeds500Characters()
    {
        var appointment = BuildScheduledAppointment();
        var repo        = new StubAppointmentRepo { AppointmentToReturn = appointment };
        var service     = BuildService(repo);

        var request = new RescheduleAppointmentRequest
        {
            AppointmentId = appointment.Id,
            NewDate       = DateOnly.FromDateTime(DateTime.Today.AddDays(2)),
            NewStartTime  = "09:00",
            Reason        = new string('A', 501),
        };

        var result = await service.RescheduleAppointmentAsync(request, "admin@piedrazul.local");

        Assert.False(result.Succeeded);
        Assert.Equal(OperationStatus.ValidationError, result.Status);
        Assert.Contains(result.Errors, e => e.Contains("500", StringComparison.OrdinalIgnoreCase));
    }
}
