using Piedrazul.Application.Abstractions.Infrastructure;
using Piedrazul.Application.Abstractions.Repositories;
using Piedrazul.Domain;

namespace Piedrazul.Application;

public sealed class AppointmentBookingService(
    IAppointmentRepository appointmentRepository,
    IPatientRepository patientRepository,
    ISystemSettingsRepository settingsRepository,
    IAvailabilityService availabilityService,
    ICacheService cacheService,
    IAuditLogger auditLogger,
    INotificationClient notificationClient) : IAppointmentBookingService
{
    private readonly IAppointmentRepository _appointments = appointmentRepository;
    private readonly IPatientRepository _patients = patientRepository;
    private readonly ISystemSettingsRepository _settings = settingsRepository;
    private readonly IAvailabilityService _availability = availabilityService;
    private readonly ICacheService _cache = cacheService;
    private readonly IAuditLogger _audit = auditLogger;
    private readonly INotificationClient _notifications = notificationClient;

    public async Task<OperationResult<AppointmentResponse>> CreatePublicAppointmentAsync(PublicAppointmentRequest request, string? externalUserId, string createdBy, CancellationToken cancellationToken = default)
    {
        var validationErrors = ValidatePublicRequest(request);
        if (validationErrors.Count > 0)
            return OperationResult<AppointmentResponse>.Validation(validationErrors.ToArray());

        var result = await CreateAppointmentCoreAsync(
            request.ProviderId, request.AppointmentDate, request.StartTime,
            request.DocumentNumber, request.FirstName, request.LastName,
            request.Phone, request.Gender, request.BirthDate, request.Email,
            request.BookAsGuest, AppointmentChannel.Web, null, externalUserId, createdBy, cancellationToken);

        if (result.Succeeded && result.Data is not null)
            await _cache.RemoveAsync($"availability:{request.ProviderId}:{request.AppointmentDate:yyyyMMdd}", cancellationToken);

        return result;
    }

    public async Task<OperationResult<AppointmentResponse>> CreateInternalAppointmentAsync(InternalCreateAppointmentRequest request, string createdBy, CancellationToken cancellationToken = default)
    {
        var validationErrors = ValidateInternalRequest(request);
        if (validationErrors.Count > 0)
            return OperationResult<AppointmentResponse>.Validation(validationErrors.ToArray());

        var channel = ParseChannel(request.Channel);

        var result = await CreateAppointmentCoreAsync(
            request.ProviderId, request.AppointmentDate, request.StartTime,
            request.DocumentNumber, request.FirstName, request.LastName,
            request.Phone, request.Gender, request.BirthDate, request.Email,
            false, channel, request.Notes, null, createdBy, cancellationToken);

        if (result.Succeeded && result.Data is not null)
            await _cache.RemoveAsync($"availability:{request.ProviderId}:{request.AppointmentDate:yyyyMMdd}", cancellationToken);

        return result;
    }

    private async Task<OperationResult<AppointmentResponse>> CreateAppointmentCoreAsync(
        Guid providerId, DateOnly appointmentDate, string startTime,
        string documentNumber, string firstName, string lastName,
        string phone, Gender gender, DateOnly? birthDate, string? email,
        bool isGuest, AppointmentChannel channel, string? notes,
        string? externalUserId, string createdBy, CancellationToken cancellationToken)
    {
        var provider = await _appointments.GetActiveProviderAsync(providerId, cancellationToken);
        if (provider is null)
            return OperationResult<AppointmentResponse>.NotFound("El médico o terapista seleccionado ya no se encuentra disponible.");

        var slotResult = await _availability.ResolveSlotAsync(providerId, appointmentDate, startTime, cancellationToken);
        if (!slotResult.Succeeded || slotResult.Data is null)
            return OperationResult<AppointmentResponse>.Validation(slotResult.Errors.ToArray());

        var normalizedDocument  = PatientInputValidator.Normalize(documentNumber);
        var normalizedFirstName = PatientInputValidator.Normalize(firstName);
        var normalizedLastName  = PatientInputValidator.Normalize(lastName);
        var normalizedPhone     = PatientInputValidator.Normalize(phone);
        var normalizedEmail     = PatientInputValidator.Normalize(email);
        var normalizedNotes     = NormalizeNotes(notes);

        var patient = !string.IsNullOrWhiteSpace(externalUserId)
            ? await _patients.GetByExternalUserIdAsync(externalUserId, cancellationToken)
            : null;

        patient ??= await _patients.GetByDocumentAsync(normalizedDocument, cancellationToken);

        if (isGuest && string.IsNullOrWhiteSpace(externalUserId) && patient is not null)
        {
            var guestReservationCount = await _appointments.CountScheduledAppointmentsByPatientIdAsync(patient.Id, cancellationToken);
            if (guestReservationCount >= 3 && string.IsNullOrWhiteSpace(patient.ExternalUserId))
                return OperationResult<AppointmentResponse>.Validation("Ya alcanzaste 3 reservas como invitado. Debes crear un usuario para continuar reservando.");
        }

        if (patient is null)
        {
            patient = new PatientProfile
            {
                DocumentNumber = normalizedDocument,
                FirstName      = normalizedFirstName,
                LastName       = normalizedLastName,
                Phone          = normalizedPhone,
                Gender         = gender,
                BirthDate      = birthDate,
                Email          = string.IsNullOrWhiteSpace(normalizedEmail) ? null : normalizedEmail,
                ExternalUserId = externalUserId,
                IsGuest        = isGuest || string.IsNullOrWhiteSpace(externalUserId)
            };
            await _patients.AddAsync(patient, cancellationToken);
        }
        else
        {
            patient.DocumentNumber = normalizedDocument;
            patient.FirstName      = normalizedFirstName;
            patient.LastName       = normalizedLastName;
            patient.Phone          = normalizedPhone;
            patient.Gender         = gender;
            patient.BirthDate      = birthDate;
            patient.Email          = string.IsNullOrWhiteSpace(normalizedEmail) ? patient.Email : normalizedEmail;
            if (!string.IsNullOrWhiteSpace(externalUserId))
            {
                patient.ExternalUserId = externalUserId;
                patient.IsGuest        = false;
            }
        }

        var appointment = new Appointment
        {
            PatientProfile  = patient,
            Provider        = provider,
            AppointmentDate = appointmentDate,
            StartTime       = slotResult.Data.StartTime,
            EndTime         = slotResult.Data.EndTime,
            Channel         = channel,
            Notes           = normalizedNotes,
            CreatedBy       = createdBy,
            Status          = AppointmentStatus.Scheduled
        };

        await _appointments.AddAppointmentAsync(appointment, cancellationToken);

        try
        {
            await _appointments.SaveChangesAsync(cancellationToken);
        }
        catch (UniqueConstraintException)
        {
            return OperationResult<AppointmentResponse>.Conflict("La franja seleccionada ya fue tomada por otro usuario. Por favor elige otra hora.");
        }

        await _audit.LogAsync("appointment.created", new { appointment.Id, appointment.AppointmentDate, appointment.StartTime, createdBy }, cancellationToken);
        await _notifications.NotifyAppointmentCreatedAsync(appointment, cancellationToken);

        return OperationResult<AppointmentResponse>.Success(AppointmentMapper.ToResponse(appointment));
    }

    private static IReadOnlyList<string> ValidatePublicRequest(PublicAppointmentRequest request)
    {
        var errors = PatientInputValidator.ValidateBasicPatientData(request.DocumentNumber, request.FirstName, request.LastName, request.Phone, request.Email).ToList();
        if (request.ProviderId == Guid.Empty) errors.Add("Debes seleccionar un médico o terapista.");
        if (request.AppointmentDate == default) errors.Add("Debes seleccionar una fecha válida.");
        if (string.IsNullOrWhiteSpace(request.StartTime)) errors.Add("Debes seleccionar una franja horaria.");
        return errors;
    }

    private static IReadOnlyList<string> ValidateInternalRequest(InternalCreateAppointmentRequest request)
    {
        var errors = PatientInputValidator.ValidateBasicPatientData(request.DocumentNumber, request.FirstName, request.LastName, request.Phone, request.Email).ToList();
        if (request.ProviderId == Guid.Empty) errors.Add("Debes seleccionar un médico o terapista.");
        if (request.AppointmentDate == default) errors.Add("Debes seleccionar una fecha válida.");
        if (string.IsNullOrWhiteSpace(request.StartTime)) errors.Add("Debes seleccionar una franja horaria.");
        if (!string.IsNullOrWhiteSpace(request.Notes) && request.Notes.Length > 500) errors.Add("Las observaciones no pueden superar los 500 caracteres.");
        return errors;
    }

    private static AppointmentChannel ParseChannel(string? channel) =>
        channel?.Trim().ToLowerInvariant() switch
        {
            "whatsapp" => AppointmentChannel.WhatsApp,
            "phone"    => AppointmentChannel.Phone,
            "internal" => AppointmentChannel.Internal,
            _          => AppointmentChannel.WhatsApp
        };

    private static string? NormalizeNotes(string? notes)
    {
        var normalized = PatientInputValidator.Normalize(notes);
        return string.IsNullOrWhiteSpace(normalized) ? null : normalized[..Math.Min(normalized.Length, 500)];
    }
}
