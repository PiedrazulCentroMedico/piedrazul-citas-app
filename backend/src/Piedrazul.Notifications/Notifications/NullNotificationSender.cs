using Microsoft.Extensions.Logging;

namespace Piedrazul.Notifications.Notifications;

public sealed class NullNotificationSender(ILogger<NullNotificationSender> logger) : INotificationSender
{
    public Task SendAppointmentCreatedAsync(Guid appointmentId, DateOnly date, string startTime, Guid patientProfileId, Guid providerId, CancellationToken cancellationToken = default)
    {
        logger.LogInformation("[NULL-SENDER] Appointment created: {Id} on {Date} at {Time}", appointmentId, date, startTime);
        return Task.CompletedTask;
    }

    public Task SendAppointmentStatusChangedAsync(Guid appointmentId, string status, DateOnly date, string startTime, Guid patientProfileId, CancellationToken cancellationToken = default)
    {
        logger.LogInformation("[NULL-SENDER] Appointment status changed: {Id} → {Status}", appointmentId, status);
        return Task.CompletedTask;
    }
}
