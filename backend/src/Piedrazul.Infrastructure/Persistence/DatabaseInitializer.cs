using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Piedrazul.Infrastructure.Seeding;

namespace Piedrazul.Infrastructure.Persistence;

/// <summary>
/// Aplica migraciones pendientes y ejecuta el seeder inicial al arrancar la aplicación.
/// Centralizado en Infrastructure para que Program.cs (Api) no dependa de EF Core directamente.
/// </summary>
public static class DatabaseInitializer
{
    public static async Task MigrateAndSeedAsync(IServiceProvider services, CancellationToken cancellationToken = default)
    {
        using var scope = services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        await dbContext.Database.MigrateAsync(cancellationToken);
        await EnsureScheduledSlotIndexAsync(dbContext, cancellationToken);
        await DataSeeder.SeedAsync(dbContext, cancellationToken);
    }

    private static async Task EnsureScheduledSlotIndexAsync(AppDbContext dbContext, CancellationToken cancellationToken)
    {
        // Protege bases locales que fueron creadas antes de permitir reutilizar franjas canceladas.
        // El índice único anterior bloqueaba cualquier cita en la misma hora, aunque estuviera cancelada.
        await dbContext.Database.ExecuteSqlRawAsync(
            """
            DROP INDEX IF EXISTS "IX_appointments_ProviderId_AppointmentDate_StartTime";
            CREATE UNIQUE INDEX IF NOT EXISTS "IX_appointments_ProviderId_AppointmentDate_StartTime"
            ON appointments ("ProviderId", "AppointmentDate", "StartTime")
            WHERE "Status" = 'Scheduled';
            """,
            cancellationToken);
    }

}
