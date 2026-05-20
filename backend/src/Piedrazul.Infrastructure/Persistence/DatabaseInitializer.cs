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
        await DataSeeder.SeedAsync(dbContext, cancellationToken);
    }
}
