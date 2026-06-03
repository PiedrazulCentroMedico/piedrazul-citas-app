using Microsoft.EntityFrameworkCore;
using Piedrazul.Domain;
using Piedrazul.Infrastructure.Persistence;

namespace Piedrazul.Infrastructure.Seeding;

public static class DataSeeder
{
    public static async Task SeedAsync(AppDbContext dbContext, CancellationToken cancellationToken = default)
    {
        await RemoveRetiredDemoProvidersAsync(dbContext, cancellationToken);
        await RemoveRetiredDemoPatientsAsync(dbContext, cancellationToken);

        if (!await dbContext.SystemSettings.AnyAsync(cancellationToken))
        {
            dbContext.SystemSettings.Add(new SystemSetting
            {
                WeeksAheadBooking = 6,
                TimeZoneId = "America/Bogota"
            });
        }

        if (await dbContext.Providers.AnyAsync(cancellationToken))
        {
            await dbContext.SaveChangesAsync(cancellationToken);
            return;
        }

        var providerOne = new Provider
        {
            Code = "PSI001",
            FirstName = "Laura",
            LastName = "Rivera",
            Specialty = "Psicología",
            DefaultSlotIntervalMinutes = 60,
            IsActive = true
        };

        var providerTwo = new Provider
        {
            Code = "MED002",
            FirstName = "Andres",
            LastName = "Vega",
            Specialty = "Medicina General",
            DefaultSlotIntervalMinutes = 60,
            IsActive = true
        };

        dbContext.Providers.AddRange(providerOne, providerTwo);

        dbContext.WeeklyAvailabilities.AddRange(
            new WeeklyAvailability { Provider = providerOne, DayOfWeek = DayOfWeek.Friday, StartTime = new TimeOnly(9, 0), EndTime = new TimeOnly(17, 0), SlotIntervalMinutes = 60, IsActive = true },
            new WeeklyAvailability { Provider = providerOne, DayOfWeek = DayOfWeek.Tuesday, StartTime = new TimeOnly(9, 0), EndTime = new TimeOnly(12, 0), SlotIntervalMinutes = 60, IsActive = true },
            new WeeklyAvailability { Provider = providerTwo, DayOfWeek = DayOfWeek.Wednesday, StartTime = new TimeOnly(9, 0), EndTime = new TimeOnly(12, 0), SlotIntervalMinutes = 60, IsActive = true },
            new WeeklyAvailability { Provider = providerTwo, DayOfWeek = DayOfWeek.Saturday, StartTime = new TimeOnly(8, 0), EndTime = new TimeOnly(11, 0), SlotIntervalMinutes = 60, IsActive = true });

        await dbContext.SaveChangesAsync(cancellationToken);
    }

    private static async Task RemoveRetiredDemoProvidersAsync(AppDbContext dbContext, CancellationToken cancellationToken)
    {
        var retiredCodes = new[] { "MED001", "TER001", "MED003" };
        var retiredProviders = await dbContext.Providers
            .Where(provider => retiredCodes.Contains(provider.Code))
            .ToListAsync(cancellationToken);

        if (retiredProviders.Count == 0)
        {
            return;
        }

        var retiredProviderIds = retiredProviders.Select(provider => provider.Id).ToList();
        var retiredAppointments = await dbContext.Appointments
            .Where(appointment => retiredProviderIds.Contains(appointment.ProviderId))
            .ToListAsync(cancellationToken);
        var retiredAppointmentIds = retiredAppointments.Select(appointment => appointment.Id).ToList();

        if (retiredAppointmentIds.Count > 0)
        {
            var retiredHistories = await dbContext.AppointmentHistories
                .Where(history => retiredAppointmentIds.Contains(history.AppointmentId))
                .ToListAsync(cancellationToken);
            dbContext.AppointmentHistories.RemoveRange(retiredHistories);
        }

        var retiredAvailabilities = await dbContext.WeeklyAvailabilities
            .Where(availability => retiredProviderIds.Contains(availability.ProviderId))
            .ToListAsync(cancellationToken);

        dbContext.WeeklyAvailabilities.RemoveRange(retiredAvailabilities);
        dbContext.Appointments.RemoveRange(retiredAppointments);
        dbContext.Providers.RemoveRange(retiredProviders);
        await dbContext.SaveChangesAsync(cancellationToken);
    }

    private static async Task RemoveRetiredDemoPatientsAsync(AppDbContext dbContext, CancellationToken cancellationToken)
    {
        var retiredDocuments = new[] { "1000000001" };
        var retiredPatients = await dbContext.PatientProfiles
            .Where(patient => retiredDocuments.Contains(patient.DocumentNumber) || patient.ExternalUserId == "demo-patient")
            .ToListAsync(cancellationToken);

        if (retiredPatients.Count == 0)
        {
            return;
        }

        var retiredPatientIds = retiredPatients.Select(patient => patient.Id).ToList();
        var retiredAppointments = await dbContext.Appointments
            .Where(appointment => retiredPatientIds.Contains(appointment.PatientProfileId))
            .ToListAsync(cancellationToken);
        var retiredAppointmentIds = retiredAppointments.Select(appointment => appointment.Id).ToList();

        if (retiredAppointmentIds.Count > 0)
        {
            var retiredHistories = await dbContext.AppointmentHistories
                .Where(history => retiredAppointmentIds.Contains(history.AppointmentId))
                .ToListAsync(cancellationToken);
            dbContext.AppointmentHistories.RemoveRange(retiredHistories);
        }

        dbContext.Appointments.RemoveRange(retiredAppointments);
        dbContext.PatientProfiles.RemoveRange(retiredPatients);
        await dbContext.SaveChangesAsync(cancellationToken);
    }

    private static DateTime GetNextDate(DayOfWeek dayOfWeek)
    {
        var date = DateTime.Today;
        while (date.DayOfWeek != dayOfWeek)
        {
            date = date.AddDays(1);
        }

        return date;
    }
}
