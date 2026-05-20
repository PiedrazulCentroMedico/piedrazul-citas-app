using Piedrazul.Application.Abstractions.Infrastructure;
using Piedrazul.Application.Abstractions.Repositories;
using Piedrazul.Domain;

namespace Piedrazul.Application;

public sealed class AppointmentLifecycleService(
    IAppointmentRepository appointmentRepository,
    ISystemSettingsRepository settingsRepository,
    IAvailabilityService availabilityService,
    ICacheService cacheService,
    IAuditLogger auditLogger,
    INotificationClient notificationClient) : IAppointmentLifecycleService
{
    private readonly IAppointmentRepository _appointments = appointmentRepository;
    private readonly ISystemSettingsRepository _settings = settingsRepository;
    private readonly IAvailabilityService _availability = availabilityService;
    private readonly ICacheService _cache = cacheService;
    private readonly IAuditLogger _audit = auditLogger;
    private readonly INotificationClient _notifications = notificationClient;

    // Las citas se almacenan en hora Colombia (UTC-5). Siempre comparar con UtcNow
    // convirtiendo la hora local de la cita a UTC antes de la comparación.
    private static readonly TimeZoneInfo ColombiaZone =
        TimeZoneInfo.FindSystemTimeZoneById("America/Bogota");

    private static DateTime ToAppointmentUtc(DateOnly date, TimeOnly time) =>
        TimeZoneInfo.ConvertTimeToUtc(date.ToDateTime(time), ColombiaZone);

    public async Task<OperationResult<AppointmentResponse>> CancelPatientAppointmentAsync(Guid appointmentId, string externalUserId, CancellationToken cancellationToken = default)
    {
        var appointment = await _appointments.GetAppointmentByIdAsync(appointmentId, cancellationToken);
        if (appointment is null)
            return OperationResult<AppointmentResponse>.NotFound("No se encontró la cita seleccionada.");

        if (!string.Equals(appointment.PatientProfile?.ExternalUserId, externalUserId, StringComparison.Ordinal))
            return OperationResult<AppointmentResponse>.Conflict("No tienes permisos para cancelar esta cita.");

        if (appointment.Status != AppointmentStatus.Scheduled)
            return OperationResult<AppointmentResponse>.Validation("Solo puedes cancelar citas que sigan programadas.");

        if (DateTime.UtcNow >= ToAppointmentUtc(appointment.AppointmentDate, appointment.StartTime))
            return OperationResult<AppointmentResponse>.Validation("Solo puedes cancelar citas antes de la hora de atención.");

        appointment.Status = AppointmentStatus.Cancelled;
        await _appointments.SaveChangesAsync(cancellationToken);

        await _audit.LogAsync("appointment.cancelled", new { appointment.Id, appointment.AppointmentDate, appointment.StartTime }, cancellationToken);
        await _notifications.NotifyAppointmentStatusChangedAsync(appointment, cancellationToken);
        await _cache.RemoveAsync($"availability:{appointment.ProviderId}:{appointment.AppointmentDate:yyyyMMdd}", cancellationToken);

        return OperationResult<AppointmentResponse>.Success(AppointmentMapper.ToResponse(appointment));
    }

    public async Task<OperationResult<AppointmentResponse>> RescheduleAppointmentAsync(RescheduleAppointmentRequest request, string changedBy, CancellationToken cancellationToken = default)
    {
        if (request.AppointmentId == Guid.Empty)
            return OperationResult<AppointmentResponse>.Validation("La cita seleccionada no es válida.");

        if (request.NewDate == default)
            return OperationResult<AppointmentResponse>.Validation("Debes seleccionar una fecha válida.");

        if (string.IsNullOrWhiteSpace(request.NewStartTime))
            return OperationResult<AppointmentResponse>.Validation("Debes seleccionar una franja horaria.");

        var appointment = await _appointments.GetAppointmentByIdAsync(request.AppointmentId, cancellationToken);
        if (appointment is null)
            return OperationResult<AppointmentResponse>.NotFound("No se encontró la cita seleccionada.");

        if (appointment.Status != AppointmentStatus.Scheduled)
            return OperationResult<AppointmentResponse>.Validation("Solo puedes reagendar citas que sigan programadas.");

        var settings = await GetSettingsAsync(cancellationToken);
        var today = DateOnly.FromDateTime(DateTime.Today);
        if (request.NewDate < today)
            return OperationResult<AppointmentResponse>.Validation("No es posible reagendar citas en fechas pasadas.");

        if (request.NewDate > today.AddDays(settings.WeeksAheadBooking * 7))
            return OperationResult<AppointmentResponse>.Validation($"Solo se pueden reservar citas dentro de las próximas {settings.WeeksAheadBooking} semanas.");

        var slotResult = await _availability.ResolveSlotAsync(appointment.ProviderId, request.NewDate, request.NewStartTime, cancellationToken);
        if (!slotResult.Succeeded || slotResult.Data is null)
            return OperationResult<AppointmentResponse>.Validation(slotResult.Errors.ToArray());

        var normalizedReason = PatientInputValidator.Normalize(request.Reason);
        if (!string.IsNullOrWhiteSpace(normalizedReason) && normalizedReason.Length > 500)
            return OperationResult<AppointmentResponse>.Validation("El motivo no puede superar los 500 caracteres.");

        normalizedReason = string.IsNullOrWhiteSpace(normalizedReason) ? null : normalizedReason;
        var normalizedChangedBy = PatientInputValidator.Normalize(changedBy);
        if (string.IsNullOrWhiteSpace(normalizedChangedBy)) normalizedChangedBy = "system";

        var previousDate = appointment.AppointmentDate;
        var history = new AppointmentHistory
        {
            AppointmentId     = appointment.Id,
            PreviousDate      = appointment.AppointmentDate,
            PreviousStartTime = appointment.StartTime,
            PreviousEndTime   = appointment.EndTime,
            NewDate           = request.NewDate,
            NewStartTime      = slotResult.Data.StartTime,
            NewEndTime        = slotResult.Data.EndTime,
            Reason            = normalizedReason,
            ChangedBy         = normalizedChangedBy,
            ChangedAtUtc      = DateTime.UtcNow
        };

        appointment.AppointmentDate = request.NewDate;
        appointment.StartTime = slotResult.Data.StartTime;
        appointment.EndTime   = slotResult.Data.EndTime;

        await _appointments.AddHistoryAsync(history, cancellationToken);

        try
        {
            await _appointments.SaveChangesAsync(cancellationToken);
        }
        catch (UniqueConstraintException)
        {
            return OperationResult<AppointmentResponse>.Conflict("La franja seleccionada ya fue tomada por otro usuario. Por favor elige otra hora.");
        }

        await _audit.LogAsync("appointment.rescheduled", new
        {
            appointment.Id,
            history.PreviousDate,
            history.PreviousStartTime,
            history.NewDate,
            history.NewStartTime,
            history.ChangedBy
        }, cancellationToken);

        await _cache.RemoveAsync($"availability:{appointment.ProviderId}:{previousDate:yyyyMMdd}", cancellationToken);
        await _cache.RemoveAsync($"availability:{appointment.ProviderId}:{appointment.AppointmentDate:yyyyMMdd}", cancellationToken);
        await _notifications.NotifyAppointmentStatusChangedAsync(appointment, cancellationToken);

        return OperationResult<AppointmentResponse>.Success(AppointmentMapper.ToResponse(appointment));
    }

    public async Task<OperationResult<AppointmentResponse>> UpdateAppointmentStatusAsync(Guid appointmentId, string status, CancellationToken cancellationToken = default)
    {
        var appointment = await _appointments.GetAppointmentByIdAsync(appointmentId, cancellationToken);
        if (appointment is null)
            return OperationResult<AppointmentResponse>.NotFound("No se encontró la cita seleccionada.");

        if (!TryParseStatus(status, out var parsedStatus))
            return OperationResult<AppointmentResponse>.Validation("El estado enviado no es válido.");

        if (parsedStatus != AppointmentStatus.Cancelled && DateTime.UtcNow < ToAppointmentUtc(appointment.AppointmentDate, appointment.StartTime))
            return OperationResult<AppointmentResponse>.Validation("Solo puedes marcar como completada o no asistió desde la hora de la cita en adelante.");

        if (appointment.Status != AppointmentStatus.Scheduled)
            return OperationResult<AppointmentResponse>.Validation("Solo puedes actualizar citas que sigan programadas.");

        appointment.Status = parsedStatus;
        await _appointments.SaveChangesAsync(cancellationToken);

        await _audit.LogAsync("appointment.status.updated", new { appointment.Id, appointment.Status }, cancellationToken);
        await _notifications.NotifyAppointmentStatusChangedAsync(appointment, cancellationToken);
        await _cache.RemoveAsync($"availability:{appointment.ProviderId}:{appointment.AppointmentDate:yyyyMMdd}", cancellationToken);

        return OperationResult<AppointmentResponse>.Success(AppointmentMapper.ToResponse(appointment));
    }

    private async Task<SystemSetting> GetSettingsAsync(CancellationToken cancellationToken) =>
        await _settings.GetAsync(cancellationToken) ?? new SystemSetting { WeeksAheadBooking = 6, TimeZoneId = "America/Bogota" };

    private static bool TryParseStatus(string? value, out AppointmentStatus status)
    {
        switch (value?.Trim().ToLowerInvariant())
        {
            case "programada": case "scheduled":   status = AppointmentStatus.Scheduled;  return true;
            case "cancelada":  case "cancelled":   status = AppointmentStatus.Cancelled;  return true;
            case "completada": case "completed":   status = AppointmentStatus.Completed;  return true;
            case "no-show": case "no show": case "no asistio": case "no asistió":
                                                   status = AppointmentStatus.NoShow;     return true;
            default:                               status = AppointmentStatus.Scheduled;  return false;
        }
    }
}
