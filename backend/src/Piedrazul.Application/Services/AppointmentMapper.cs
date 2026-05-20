using Piedrazul.Domain;

namespace Piedrazul.Application;

internal static class AppointmentMapper
{
    internal static AppointmentResponse ToResponse(Appointment appointment) =>
        new(
            appointment.Id,
            appointment.Provider?.DisplayName ?? string.Empty,
            appointment.Provider?.Specialty ?? string.Empty,
            appointment.PatientProfile?.FullName ?? string.Empty,
            appointment.PatientProfile?.DocumentNumber ?? string.Empty,
            appointment.PatientProfile?.Phone ?? string.Empty,
            appointment.AppointmentDate,
            appointment.StartTime.ToString("HH:mm"),
            appointment.EndTime.ToString("HH:mm"),
            TranslateStatus(appointment.Status),
            TranslateChannel(appointment.Channel),
            appointment.Notes);

    internal static string TranslateStatus(AppointmentStatus status) => status switch
    {
        AppointmentStatus.Scheduled => "Programada",
        AppointmentStatus.Cancelled => "Cancelada",
        AppointmentStatus.Completed => "Completada",
        AppointmentStatus.NoShow    => "No asistió",
        _                           => "Programada"
    };

    internal static string TranslateChannel(AppointmentChannel channel) => channel switch
    {
        AppointmentChannel.Web      => "Web",
        AppointmentChannel.WhatsApp => "WhatsApp",
        AppointmentChannel.Phone    => "Llamada",
        AppointmentChannel.Internal => "Portal interno",
        _                           => "Web"
    };
}
