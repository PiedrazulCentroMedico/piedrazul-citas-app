using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Piedrazul.Application;
using Piedrazul.Infrastructure.Persistence;
using Xunit;

namespace Piedrazul.Integration.Tests;

// IClassFixture shares one factory (and its SQLite database) across all tests in this class.
public sealed class AppointmentsIntegrationTests(CustomWebApplicationFactory factory)
    : IClassFixture<CustomWebApplicationFactory>
{
    // The API serializes enum values as strings; configure the client-side deserializer to match.
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        Converters = { new JsonStringEnumConverter() },
        PropertyNameCaseInsensitive = true
    };

    [Fact]
    public async Task PostPublicAppointment_ValidData_Returns200AndPersistsInDb()
    {
        // Arrange – resolve seeded provider and pick an available slot.
        Guid providerId;
        DateOnly date;
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var provider = await db.Providers.FirstAsync(p => p.Code == "MED001");
            providerId = provider.Id;
            date = NextMonday(); // Ana Gómez works Mondays 08:00–12:00
        }

        // The seeder already occupies 08:00; use the next 30-minute slot.
        var requestBody = new
        {
            ProviderId = providerId,
            AppointmentDate = date,
            StartTime = "08:30",
            DocumentNumber = "5000000099",
            FirstName = "Test",
            LastName = "Integracion",
            Phone = "3009876543",
            Gender = "Male",
            BookAsGuest = true
        };

        var client = factory.CreateClient();

        // Act
        var response = await client.PostAsJsonAsync("/api/public/appointments", requestBody);

        // Assert HTTP 200
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var result = await response.Content.ReadFromJsonAsync<AppointmentResponse>(JsonOptions);
        Assert.NotNull(result);
        Assert.Equal("Programada", result.Status);
        Assert.Equal(date, result.AppointmentDate);
        Assert.Equal("08:30", result.StartTime);

        // Assert the appointment was actually written to the database.
        using var verifyScope = factory.Services.CreateScope();
        var verifyDb = verifyScope.ServiceProvider.GetRequiredService<AppDbContext>();
        var persisted = await verifyDb.Appointments.FindAsync(result.Id);
        Assert.NotNull(persisted);
        Assert.Equal(date, persisted.AppointmentDate);
    }

    [Fact]
    public async Task GetInternalAppointments_ByProviderAndDate_ReturnsCorrectList()
    {
        // Arrange – locate the seeded appointment to drive the query parameters.
        Guid providerId;
        DateOnly date;
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var seeded = await db.Appointments
                .Include(a => a.Provider)
                .FirstAsync(a => a.Provider!.Code == "MED001");

            providerId = seeded.ProviderId;
            date = seeded.AppointmentDate;
        }

        // Act – the internal endpoint requires InternalStaff role; pass it via the
        // DevelopmentAuthHandler's debug header (only active in Development environment).
        using var request = new HttpRequestMessage(
            HttpMethod.Get,
            $"/api/internal/appointments?providerId={providerId}&date={date:yyyy-MM-dd}");
        request.Headers.Add("X-Debug-Roles", "Admin");

        var client = factory.CreateClient();
        var response = await client.SendAsync(request);

        // Assert HTTP 200
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var result = await response.Content.ReadFromJsonAsync<AppointmentListResponse>(JsonOptions);
        Assert.NotNull(result);
        Assert.True(result.Total >= 1, $"Expected at least 1 appointment for provider on {date}, got {result.Total}");
        Assert.Equal(date, result.AppointmentDate);
        // The seeder creates exactly one appointment at 08:00 for MED001.
        Assert.Contains(result.Items ?? [], a => a.StartTime == "08:00");
    }

    // Returns today if today is Monday, otherwise the next Monday — mirroring the DataSeeder logic.
    private static DateOnly NextMonday()
    {
        var d = DateTime.Today;
        while (d.DayOfWeek != DayOfWeek.Monday)
            d = d.AddDays(1);
        return DateOnly.FromDateTime(d);
    }
}
