using Microsoft.Extensions.Logging.Abstractions;
using Piedrazul.Application;
using Piedrazul.Application.Abstractions.Infrastructure;
using Piedrazul.Application.Abstractions.Repositories;
using Piedrazul.Domain;
using Piedrazul.Infrastructure.Keycloak;
using Piedrazul.Infrastructure.Services;
using Xunit;

namespace Piedrazul.Domain.Tests;

// ── Excel Export ─────────────────────────────────────────────────────────────

public sealed class ExcelExporterTests
{
    private static readonly DateOnly TestDate = new(2026, 5, 16);

    [Fact]
    public void Export_DebeRetornarBytesNoVacios_CuandoHayCitas()
    {
        var exporter = new AppointmentExcelExporter();
        var citas = new List<AppointmentResponse>
        {
            new(Guid.NewGuid(), "Dr. Juan Pérez", "Medicina General",
                "Carlos Muñoz", "1234567890", "3001234567",
                TestDate, "09:00", "09:30", "Scheduled", "InPerson", null),
        };

        var bytes = exporter.Export("Piedrazul", "Dr. Juan Pérez", "Medicina General", TestDate, citas);

        Assert.NotEmpty(bytes);
    }

    [Fact]
    public void Export_DebeRetornarBytesNoVacios_CuandoListaEstaVacia()
    {
        var exporter = new AppointmentExcelExporter();

        var bytes = exporter.Export("Piedrazul", "Dr. Juan Pérez", "Medicina General",
            TestDate, Array.Empty<AppointmentResponse>());

        Assert.NotEmpty(bytes);
    }

    [Fact]
    public async Task QueryService_ExportXlsx_DebeRetornarVacio_CuandoProveedorNoExiste()
    {
        var service = new AppointmentQueryService(
            new FakeRepoSinProveedor(),
            new NoOpPdf(),
            new NoOpExcel());

        var bytes = await service.ExportAppointmentsXlsxAsync(Guid.NewGuid(), TestDate);

        Assert.Empty(bytes);
    }

    // ── Fakes locales ─────────────────────────────────────────────────────────

    private sealed class NoOpPdf : IAppointmentPdfExporter
    {
        public byte[] Export(string c, string p, string s, DateOnly d, IReadOnlyList<AppointmentResponse> items) =>
            Array.Empty<byte>();
    }

    private sealed class NoOpExcel : IAppointmentExcelExporter
    {
        public byte[] Export(string c, string p, string s, DateOnly d, IReadOnlyList<AppointmentResponse> items) =>
            Array.Empty<byte>();
    }

    private sealed class FakeRepoSinProveedor : IAppointmentRepository
    {
        public Task<Provider?> GetActiveProviderAsync(Guid id, CancellationToken ct = default) =>
            Task.FromResult<Provider?>(null);

        public Task<IReadOnlyList<Provider>> GetActiveProvidersAsync(CancellationToken ct = default) =>
            Task.FromResult<IReadOnlyList<Provider>>(Array.Empty<Provider>());

        public Task<IReadOnlyList<WeeklyAvailability>> GetWeeklyAvailabilitiesAsync(Guid id, DayOfWeek dow, CancellationToken ct = default) =>
            Task.FromResult<IReadOnlyList<WeeklyAvailability>>(Array.Empty<WeeklyAvailability>());

        public Task<IReadOnlyList<TimeOnly>> GetBookedTimesAsync(Guid id, DateOnly date, CancellationToken ct = default) =>
            Task.FromResult<IReadOnlyList<TimeOnly>>(Array.Empty<TimeOnly>());

        public Task<IReadOnlyList<Appointment>> GetAppointmentsByProviderAndDateAsync(Guid id, DateOnly date, CancellationToken ct = default) =>
            Task.FromResult<IReadOnlyList<Appointment>>(Array.Empty<Appointment>());

        public Task<Appointment?> GetAppointmentByIdAsync(Guid id, CancellationToken ct = default) =>
            Task.FromResult<Appointment?>(null);

        public Task<IReadOnlyList<Appointment>> GetAppointmentsByDocumentAsync(string doc, CancellationToken ct = default) =>
            Task.FromResult<IReadOnlyList<Appointment>>(Array.Empty<Appointment>());

        public Task<IReadOnlyList<AppointmentHistory>> GetHistoryAsync(Guid id, CancellationToken ct = default) =>
            Task.FromResult<IReadOnlyList<AppointmentHistory>>(Array.Empty<AppointmentHistory>());

        public Task<int> CountScheduledAppointmentsByPatientIdAsync(Guid id, CancellationToken ct = default) =>
            Task.FromResult(0);

        public Task AddAppointmentAsync(Appointment a, CancellationToken ct = default) => Task.CompletedTask;
        public Task AddHistoryAsync(AppointmentHistory h, CancellationToken ct = default) => Task.CompletedTask;
        public Task SaveChangesAsync(CancellationToken ct = default) => Task.CompletedTask;
    }
}

// ── Keycloak Admin NoOp ───────────────────────────────────────────────────────

public sealed class NoOpKeycloakAdminClientTests
{
    private readonly NoOpKeycloakAdminClient _client =
        new(NullLogger<NoOpKeycloakAdminClient>.Instance);

    [Fact]
    public async Task GetUsers_DebeRetornarListaVacia_CuandoNoHayConfiguracion()
    {
        var users = await _client.GetUsersAsync();

        Assert.Empty(users);
    }

    [Fact]
    public async Task CreateUser_DebeRetornarIdValidoSinLanzarExcepcion()
    {
        var request = new CreateKeycloakUserRequest(
            "test@example.com", "test@example.com",
            "Test", "User", "Password123*", Array.Empty<string>());

        var id = await _client.CreateUserAsync(request);

        Assert.False(string.IsNullOrWhiteSpace(id));
        Assert.True(Guid.TryParse(id, out _));
    }

    [Fact]
    public async Task DeleteUser_NoDebeLanzarExcepcion_CuandoNoHayConfiguracion()
    {
        var exception = await Record.ExceptionAsync(
            () => _client.DeleteUserAsync("cualquier-id"));

        Assert.Null(exception);
    }
}
