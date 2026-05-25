using Piedrazul.Domain;

namespace Piedrazul.Application.Abstractions.Repositories;

public interface IAppointmentRepository
{
    Task<IReadOnlyList<Provider>> GetActiveProvidersAsync(CancellationToken cancellationToken = default);
    Task<Provider?> GetActiveProviderAsync(Guid providerId, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<WeeklyAvailability>> GetWeeklyAvailabilitiesAsync(Guid providerId, DayOfWeek dayOfWeek, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<TimeOnly>> GetBookedTimesAsync(Guid providerId, DateOnly date, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<Appointment>> GetAppointmentsByProviderAndDateAsync(Guid providerId, DateOnly date, CancellationToken cancellationToken = default);
    Task<Appointment?> GetAppointmentByIdAsync(Guid appointmentId, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<Appointment>> GetAppointmentsByDocumentAsync(string documentNumber, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<AppointmentHistory>> GetHistoryAsync(Guid appointmentId, CancellationToken cancellationToken = default);
    Task<int> CountScheduledAppointmentsByPatientIdAsync(Guid patientId, CancellationToken cancellationToken = default);
    Task<Dictionary<Guid, int>> CountScheduledByPatientIdsAsync(IReadOnlyList<Guid> patientIds, CancellationToken cancellationToken = default);
    Task AddAppointmentAsync(Appointment appointment, CancellationToken cancellationToken = default);
    Task AddHistoryAsync(AppointmentHistory history, CancellationToken cancellationToken = default);
    Task SaveChangesAsync(CancellationToken cancellationToken = default);
}
