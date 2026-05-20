using Microsoft.EntityFrameworkCore;
using Piedrazul.Application;
using Piedrazul.Domain;

namespace Piedrazul.Infrastructure.Persistence;

public sealed class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
    public DbSet<PatientProfile> PatientProfiles => Set<PatientProfile>();
    public DbSet<Provider> Providers => Set<Provider>();
    public DbSet<WeeklyAvailability> WeeklyAvailabilities => Set<WeeklyAvailability>();
    public DbSet<Appointment> Appointments => Set<Appointment>();
    public DbSet<AppointmentHistory> AppointmentHistories => Set<AppointmentHistory>();
    public DbSet<SystemSetting> SystemSettings => Set<SystemSetting>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<PatientProfile>(entity =>
        {
            entity.ToTable("patient_profiles");
            entity.HasKey(x => x.Id);
            entity.Property(x => x.DocumentNumber).HasMaxLength(20).IsRequired();
            entity.Property(x => x.FirstName).HasMaxLength(80).IsRequired();
            entity.Property(x => x.LastName).HasMaxLength(80).IsRequired();
            entity.Property(x => x.Phone).HasMaxLength(15).IsRequired();
            entity.Property(x => x.Email).HasMaxLength(150);
            entity.Property(x => x.ExternalUserId).HasMaxLength(100);
            entity.Property(x => x.Gender).HasConversion<string>().HasMaxLength(20);
            entity.HasIndex(x => x.DocumentNumber).IsUnique();
            entity.HasIndex(x => x.ExternalUserId).IsUnique();
        });

        modelBuilder.Entity<Provider>(entity =>
        {
            entity.ToTable("providers");
            entity.HasKey(x => x.Id);
            entity.Property(x => x.Code).HasMaxLength(20).IsRequired();
            entity.Property(x => x.FirstName).HasMaxLength(80).IsRequired();
            entity.Property(x => x.LastName).HasMaxLength(80).IsRequired();
            entity.Property(x => x.Specialty).HasMaxLength(80).IsRequired();
            entity.HasIndex(x => x.Code).IsUnique();
        });

        modelBuilder.Entity<WeeklyAvailability>(entity =>
        {
            entity.ToTable("weekly_availabilities");
            entity.HasKey(x => x.Id);
            entity.HasOne(x => x.Provider)
                .WithMany(x => x.WeeklyAvailabilities)
                .HasForeignKey(x => x.ProviderId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<SystemSetting>(entity =>
        {
            entity.ToTable("system_settings");
            entity.HasKey(x => x.Id);
            entity.Property(x => x.TimeZoneId).HasMaxLength(60).IsRequired();
        });

        modelBuilder.Entity<Appointment>(entity =>
        {
            entity.ToTable("appointments");
            entity.HasKey(x => x.Id);
            entity.Property(x => x.Status).HasConversion<string>().HasMaxLength(20).IsRequired();
            entity.Property(x => x.Channel).HasConversion<string>().HasMaxLength(20).IsRequired();
            entity.Property(x => x.Notes).HasMaxLength(500);
            entity.Property(x => x.CreatedBy).HasMaxLength(120).IsRequired();
            entity.HasIndex(x => new { x.ProviderId, x.AppointmentDate, x.StartTime }).IsUnique();
            entity.HasOne(x => x.Provider)
                .WithMany(x => x.Appointments)
                .HasForeignKey(x => x.ProviderId)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(x => x.PatientProfile)
                .WithMany(x => x.Appointments)
                .HasForeignKey(x => x.PatientProfileId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<AppointmentHistory>(entity =>
        {
            entity.ToTable("appointment_histories");
            entity.HasKey(x => x.Id);
            entity.Property(x => x.Reason).HasMaxLength(500);
            entity.Property(x => x.ChangedBy).HasMaxLength(120).IsRequired();
            entity.HasIndex(x => x.AppointmentId);
            entity.HasOne(x => x.Appointment)
                .WithMany(x => x.History)
                .HasForeignKey(x => x.AppointmentId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        base.OnModelCreating(modelBuilder);
    }

    public override async Task<int> SaveChangesAsync(CancellationToken cancellationToken = default)
    {
        var changedEntries = ChangeTracker
            .Entries<AuditableEntity>()
            .Where(x => x.State is EntityState.Added or EntityState.Modified);

        foreach (var entry in changedEntries)
        {
            if (entry.State == EntityState.Added)
                entry.Entity.CreatedAtUtc = DateTime.UtcNow;

            entry.Entity.UpdatedAtUtc = DateTime.UtcNow;
        }

        try
        {
            return await base.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException ex)
            when (ex.InnerException is Npgsql.PostgresException pg && pg.SqlState == "23505")
        {
            // Código SQLSTATE 23505 = unique_violation en PostgreSQL.
            // Se relanza como excepción de dominio para que Application no dependa de EF Core ni Npgsql.
            throw new UniqueConstraintException();
        }
    }
}
