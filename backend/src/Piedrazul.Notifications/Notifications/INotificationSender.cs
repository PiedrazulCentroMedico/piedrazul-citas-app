namespace Piedrazul.Notifications.Notifications;

public interface INotificationSender
{
    Task SendAppointmentCreatedAsync(Guid appointmentId, DateOnly date, string startTime, Guid patientProfileId, Guid providerId, CancellationToken cancellationToken = default);
    Task SendAppointmentStatusChangedAsync(Guid appointmentId, string status, DateOnly date, string startTime, Guid patientProfileId, CancellationToken cancellationToken = default);
}
