using Microsoft.EntityFrameworkCore;
using Piedrazul.Application.Abstractions.Repositories;
using Piedrazul.Domain;

namespace Piedrazul.Infrastructure.Persistence.Repositories;

public sealed class AppointmentRepository(AppDbContext dbContext) : IAppointmentRepository
{
    private readonly AppDbContext _dbContext = dbContext;

    public async Task<IReadOnlyList<Provider>> GetActiveProvidersAsync(CancellationToken cancellationToken = default)
    {
        return await _dbContext.Providers
            .AsNoTracking()
            .Where(x => x.IsActive)
            .ToListAsync(cancellationToken);
    }

    public async Task<Provider?> GetActiveProviderAsync(Guid providerId, CancellationToken cancellationToken = default)
    {
        return await _dbContext.Providers
            .FirstOrDefaultAsync(x => x.Id == providerId && x.IsActive, cancellationToken);
    }

    public async Task<IReadOnlyList<WeeklyAvailability>> GetWeeklyAvailabilitiesAsync(Guid providerId, DayOfWeek dayOfWeek, CancellationToken cancellationToken = default)
    {
        return await _dbContext.WeeklyAvailabilities
            .AsNoTracking()
            .Where(x => x.ProviderId == providerId && x.IsActive && x.DayOfWeek == dayOfWeek)
            .OrderBy(x => x.StartTime)
            .ToListAsync(cancellationToken);
    }

    public async Task<IReadOnlyList<TimeOnly>> GetBookedTimesAsync(Guid providerId, DateOnly date, CancellationToken cancellationToken = default)
    {
        return await _dbContext.Appointments
            .AsNoTracking()
            .Where(x => x.ProviderId == providerId && x.AppointmentDate == date && x.Status == AppointmentStatus.Scheduled)
            .Select(x => x.StartTime)
            .ToListAsync(cancellationToken);
    }

    public async Task<IReadOnlyList<Appointment>> GetAppointmentsByProviderAndDateAsync(Guid providerId, DateOnly date, CancellationToken cancellationToken = default)
    {
        return await _dbContext.Appointments
            .AsNoTracking()
            .Include(x => x.PatientProfile)
            .Include(x => x.Provider)
            .Where(x => x.ProviderId == providerId && x.AppointmentDate == date)
            .OrderBy(x => x.StartTime)
            .ToListAsync(cancellationToken);
    }

    public async Task<Appointment?> GetAppointmentByIdAsync(Guid appointmentId, CancellationToken cancellationToken = default)
    {
        return await _dbContext.Appointments
            .Include(x => x.PatientProfile)
            .Include(x => x.Provider)
            .FirstOrDefaultAsync(x => x.Id == appointmentId, cancellationToken);
    }

    public async Task<IReadOnlyList<Appointment>> GetAppointmentsByDocumentAsync(string documentNumber, CancellationToken cancellationToken = default)
    {
        return await _dbContext.Appointments
            .AsNoTracking()
            .Include(x => x.Provider)
            .Include(x => x.PatientProfile)
            .Where(x => x.PatientProfile != null && x.PatientProfile.DocumentNumber == documentNumber)
            .OrderByDescending(x => x.AppointmentDate)
            .ThenBy(x => x.StartTime)
            .ToListAsync(cancellationToken);
    }

    public async Task<IReadOnlyList<AppointmentHistory>> GetHistoryAsync(Guid appointmentId, CancellationToken cancellationToken = default)
    {
        return await _dbContext.AppointmentHistories
            .AsNoTracking()
            .Where(x => x.AppointmentId == appointmentId)
            .OrderBy(x => x.ChangedAtUtc)
            .ToListAsync(cancellationToken);
    }

    public async Task<int> CountScheduledAppointmentsByPatientIdAsync(Guid patientId, CancellationToken cancellationToken = default)
    {
        return await _dbContext.Appointments
            .AsNoTracking()
            .CountAsync(x => x.PatientProfileId == patientId && x.Status == AppointmentStatus.Scheduled, cancellationToken);
    }

    public async Task<Dictionary<Guid, int>> CountScheduledByPatientIdsAsync(IReadOnlyList<Guid> patientIds, CancellationToken cancellationToken = default)
    {
        if (patientIds.Count == 0) return new Dictionary<Guid, int>();

        return await _dbContext.Appointments
            .AsNoTracking()
            .Where(x => patientIds.Contains(x.PatientProfileId) && x.Status == AppointmentStatus.Scheduled)
            .GroupBy(x => x.PatientProfileId)
            .Select(g => new { Id = g.Key, Count = g.Count() })
            .ToDictionaryAsync(x => x.Id, x => x.Count, cancellationToken);
    }

    public async Task AddAppointmentAsync(Appointment appointment, CancellationToken cancellationToken = default)
    {
        await _dbContext.Appointments.AddAsync(appointment, cancellationToken);
    }

    public async Task AddHistoryAsync(AppointmentHistory history, CancellationToken cancellationToken = default)
    {
        await _dbContext.AppointmentHistories.AddAsync(history, cancellationToken);
    }

    public Task SaveChangesAsync(CancellationToken cancellationToken = default)
    {
        return _dbContext.SaveChangesAsync(cancellationToken);
    }
}
