using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Data.Sqlite;

namespace Piedrazul.Integration.Tests;

public sealed class CustomWebApplicationFactory : WebApplicationFactory<Program>
{
    // A persistent connection keeps the shared-cache in-memory database alive for the factory lifetime.
    private readonly SqliteConnection _keepAlive = new("Data Source=piedrazul_integration;Mode=Memory;Cache=Shared");

    public CustomWebApplicationFactory()
    {
        // Environment variables are read by WebApplication.CreateBuilder before AddInfrastructure
        // runs, so they override appsettings.Development.json and are picked up at service-
        // registration time (unlike ConfigureAppConfiguration which runs too late for this).
        //
        // ConnectionStrings__Sqlite  → AddInfrastructure chooses UseSqlite instead of UseNpgsql.
        // Redis__ConnectionString    → empty string → NullCacheService (no Redis connection).
        // RabbitMq__ConnectionString → empty string → NoOpNotificationClient (no broker).
        Environment.SetEnvironmentVariable("ConnectionStrings__Sqlite",
            "Data Source=piedrazul_integration;Mode=Memory;Cache=Shared");
        Environment.SetEnvironmentVariable("Redis__ConnectionString", string.Empty);
        Environment.SetEnvironmentVariable("RabbitMq__ConnectionString", string.Empty);

        _keepAlive.Open();
    }

    protected override void ConfigureWebHost(IWebHostBuilder builder) =>
        builder.UseEnvironment("Development");

    protected override void Dispose(bool disposing)
    {
        if (disposing)
        {
            // Restore environment so other tests or processes are not affected.
            Environment.SetEnvironmentVariable("ConnectionStrings__Sqlite", null);
            Environment.SetEnvironmentVariable("Redis__ConnectionString", null);
            Environment.SetEnvironmentVariable("RabbitMq__ConnectionString", null);

            _keepAlive.Dispose();
        }
        base.Dispose(disposing);
    }
}
