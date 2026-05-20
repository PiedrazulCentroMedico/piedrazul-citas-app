using Piedrazul.Domain;

namespace Piedrazul.Application;

public enum OperationStatus
{
    Success,
    ValidationError,
    NotFound,
    Conflict
}

public sealed class OperationResult<T>
{
    private OperationResult(OperationStatus status, T? data, IReadOnlyList<string> errors)
    {
        Status = status;
        Data = data;
        Errors = errors;
    }

    public OperationStatus Status { get; }
    public T? Data { get; }
    public IReadOnlyList<string> Errors { get; }
    public bool Succeeded => Status == OperationStatus.Success;

    public static OperationResult<T> Success(T data) => new(OperationStatus.Success, data, Array.Empty<string>());
    public static OperationResult<T> Validation(params string[] errors) => new(OperationStatus.ValidationError, default, errors);
    public static OperationResult<T> NotFound(params string[] errors) => new(OperationStatus.NotFound, default, errors);
    public static OperationResult<T> Conflict(params string[] errors) => new(OperationStatus.Conflict, default, errors);
}

public sealed record CenterInfoResponse(
    string Name,
    string Tagline,
    string Address,
    string Phone,
    string AttentionHours,
    string About);

public sealed record ProviderSummaryResponse(
    Guid Id,
    string FullName,
    string Specialty,
    int DefaultSlotIntervalMinutes);

public sealed record AvailabilitySlotResponse(
    string StartTime,
    string EndTime,
    bool Available);

public sealed record PublicAppointmentRequest
{
    public Guid ProviderId { get; init; }
    public DateOnly AppointmentDate { get; init; }
    public string StartTime { get; init; } = string.Empty;
    public string DocumentNumber { get; init; } = string.Empty;
    public string FirstName { get; init; } = string.Empty;
    public string LastName { get; init; } = string.Empty;
    public string Phone { get; init; } = string.Empty;
    public Gender Gender { get; init; }
    public DateOnly? BirthDate { get; init; }
    public string? Email { get; init; }
    public bool BookAsGuest { get; init; } = true;
}

public sealed record InternalCreateAppointmentRequest
{
    public Guid ProviderId { get; init; }
    public DateOnly AppointmentDate { get; init; }
    public string StartTime { get; init; } = string.Empty;
    public string DocumentNumber { get; init; } = string.Empty;
    public string FirstName { get; init; } = string.Empty;
    public string LastName { get; init; } = string.Empty;
    public string Phone { get; init; } = string.Empty;
    public Gender Gender { get; init; }
    public DateOnly? BirthDate { get; init; }
    public string? Email { get; init; }
    public string? Notes { get; init; }
    public string Channel { get; init; } = "WhatsApp";
}

public sealed record PatientProfileResponse(
    Guid Id,
    string DocumentNumber,
    string FirstName,
    string LastName,
    string Phone,
    Gender Gender,
    DateOnly? BirthDate,
    string? Email,
    bool IsGuest);

public sealed record PatientProfileUpsertRequest
{
    public string DocumentNumber { get; init; } = string.Empty;
    public string FirstName { get; init; } = string.Empty;
    public string LastName { get; init; } = string.Empty;
    public string Phone { get; init; } = string.Empty;
    public Gender Gender { get; init; }
    public DateOnly? BirthDate { get; init; }
    public string? Email { get; init; }
}

public sealed record AppointmentResponse(
    Guid Id,
    string ProviderName,
    string Specialty,
    string PatientFullName,
    string DocumentNumber,
    string Phone,
    DateOnly AppointmentDate,
    string StartTime,
    string EndTime,
    string Status,
    string Channel,
    string? Notes);

public sealed record AppointmentHistoryResponse(
    Guid AppointmentId,
    DateOnly PreviousDate,
    string PreviousStartTime,
    string PreviousEndTime,
    DateOnly NewDate,
    string NewStartTime,
    string NewEndTime,
    string? Reason,
    string ChangedBy,
    DateTime ChangedAtUtc);

public sealed record AppointmentListResponse(
    string ProviderName,
    string Specialty,
    DateOnly AppointmentDate,
    int Total,
    IReadOnlyList<AppointmentResponse> Items);

public sealed record RescheduleAppointmentRequest
{
    public Guid AppointmentId { get; init; }
    public DateOnly NewDate { get; init; }
    public string NewStartTime { get; init; } = string.Empty;
    public string? Reason { get; init; }
}

public sealed record SystemSettingsResponse(int WeeksAheadBooking, string TimeZoneId);

public sealed record SystemSettingsRequest
{
    public int WeeksAheadBooking { get; init; }
    public string TimeZoneId { get; init; } = "America/Bogota";
}

public sealed record WeeklyAvailabilityDto(
    Guid Id,
    DayOfWeek DayOfWeek,
    string StartTime,
    string EndTime,
    int SlotIntervalMinutes,
    bool IsActive);

public sealed record ProviderScheduleResponse(
    Guid ProviderId,
    string ProviderName,
    string Specialty,
    int DefaultSlotIntervalMinutes,
    IReadOnlyList<WeeklyAvailabilityDto> WeeklyAvailabilities);

public sealed record ProviderScheduleRequest
{
    public string FirstName { get; init; } = string.Empty;
    public string LastName { get; init; } = string.Empty;
    public string Specialty { get; init; } = string.Empty;
    public int DefaultSlotIntervalMinutes { get; init; }
    public IReadOnlyList<WeeklyAvailabilityRequest> WeeklyAvailabilities { get; init; } = Array.Empty<WeeklyAvailabilityRequest>();
}

public sealed record WeeklyAvailabilityRequest
{
    public DayOfWeek DayOfWeek { get; init; }
    public string StartTime { get; init; } = string.Empty;
    public string EndTime { get; init; } = string.Empty;
    public int SlotIntervalMinutes { get; init; }
    public bool IsActive { get; init; } = true;
}

public sealed record PatientLookupResponse(
    Guid Id,
    string DocumentNumber,
    string FirstName,
    string LastName,
    string FullName,
    string Phone,
    Gender Gender,
    DateOnly? BirthDate,
    string? Email,
    int ScheduledAppointmentsCount,
    bool HasUserAccount);

public sealed record PatientPublicLookupResponse(
    bool Exists,
    Guid? Id,
    string? FirstName,
    string? LastName,
    Gender? Gender,
    string? MaskedPhone,
    string? MaskedEmail,
    int? BirthYear);

public interface IAvailabilityService
{
    Task<IReadOnlyList<ProviderSummaryResponse>> GetActiveProvidersAsync(CancellationToken cancellationToken = default);
    Task<OperationResult<IReadOnlyList<AvailabilitySlotResponse>>> GetAvailabilityAsync(Guid providerId, DateOnly date, CancellationToken cancellationToken = default);
}

public interface IAppointmentBookingService
{
    Task<OperationResult<AppointmentResponse>> CreatePublicAppointmentAsync(PublicAppointmentRequest request, string? externalUserId, string createdBy, CancellationToken cancellationToken = default);
    Task<OperationResult<AppointmentResponse>> CreateInternalAppointmentAsync(InternalCreateAppointmentRequest request, string createdBy, CancellationToken cancellationToken = default);
}

public interface IAppointmentQueryService
{
    Task<OperationResult<AppointmentListResponse>> GetAppointmentsByProviderAndDateAsync(Guid providerId, DateOnly date, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<AppointmentHistoryResponse>> GetAppointmentHistoryAsync(Guid appointmentId, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<AppointmentResponse>> GetAppointmentsByDocumentAsync(string documentNumber, CancellationToken cancellationToken = default);
    Task<byte[]> ExportAppointmentsPdfAsync(Guid providerId, DateOnly date, CancellationToken cancellationToken = default);
    Task<byte[]> ExportAppointmentsCsvAsync(Guid providerId, DateOnly date, CancellationToken cancellationToken = default);
    Task<byte[]> ExportAppointmentsXlsxAsync(Guid providerId, DateOnly date, CancellationToken cancellationToken = default);
}

public interface IAppointmentLifecycleService
{
    Task<OperationResult<AppointmentResponse>> UpdateAppointmentStatusAsync(Guid appointmentId, string status, CancellationToken cancellationToken = default);
    Task<OperationResult<AppointmentResponse>> CancelPatientAppointmentAsync(Guid appointmentId, string externalUserId, CancellationToken cancellationToken = default);
    Task<OperationResult<AppointmentResponse>> RescheduleAppointmentAsync(RescheduleAppointmentRequest request, string changedBy, CancellationToken cancellationToken = default);
}

public interface IPatientLookupService
{
    Task<IReadOnlyList<PatientLookupResponse>> SearchPatientsAsync(string documentTerm, CancellationToken cancellationToken = default);
    Task<PatientLookupResponse?> GetPatientByDocumentAsync(string documentNumber, CancellationToken cancellationToken = default);
}

public interface IPatientService
{
    Task<OperationResult<PatientProfileResponse>> GetMyProfileAsync(string externalUserId, CancellationToken cancellationToken = default);
    Task<OperationResult<PatientProfileResponse>> UpsertMyProfileAsync(string externalUserId, string? email, PatientProfileUpsertRequest request, CancellationToken cancellationToken = default);
    Task<OperationResult<IReadOnlyList<AppointmentResponse>>> GetMyAppointmentsAsync(string externalUserId, CancellationToken cancellationToken = default);
}

public interface IAdministrationService
{
    Task<SystemSettingsResponse> GetSystemSettingsAsync(CancellationToken cancellationToken = default);
    Task<OperationResult<SystemSettingsResponse>> UpdateSystemSettingsAsync(SystemSettingsRequest request, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<ProviderScheduleResponse>> GetProviderSchedulesAsync(CancellationToken cancellationToken = default);
    Task<OperationResult<ProviderScheduleResponse>> CreateProviderScheduleAsync(ProviderScheduleRequest request, CancellationToken cancellationToken = default);
    Task<OperationResult<ProviderScheduleResponse>> UpdateProviderScheduleAsync(Guid providerId, ProviderScheduleRequest request, CancellationToken cancellationToken = default);
    Task<OperationResult<bool>> DeleteProviderScheduleAsync(Guid providerId, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<PatientLookupResponse>> SearchPatientsForAdminAsync(string term, CancellationToken cancellationToken = default);
    Task<OperationResult<PatientLookupResponse>> UpdatePatientAsync(Guid patientId, PatientProfileUpsertRequest request, CancellationToken cancellationToken = default);
}

public sealed record AppointmentStatusUpdateRequest
{
    public string Status { get; init; } = string.Empty;
}
