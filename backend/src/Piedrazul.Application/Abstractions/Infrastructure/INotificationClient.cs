using Piedrazul.Domain;

namespace Piedrazul.Application.Abstractions.Infrastructure;

public interface INotificationClient
{
    Task NotifyAppointmentCreatedAsync(Appointment appointment, CancellationToken cancellationToken = default);
    Task NotifyAppointmentStatusChangedAsync(Appointment appointment, CancellationToken cancellationToken = default);
}
