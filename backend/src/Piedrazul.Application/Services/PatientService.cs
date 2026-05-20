using Piedrazul.Application.Abstractions.Repositories;
using Piedrazul.Domain;

namespace Piedrazul.Application;

public sealed class PatientService(IPatientRepository patientRepository, IAppointmentRepository appointmentRepository) : IPatientService
{
    private readonly IPatientRepository _patients = patientRepository;
    private readonly IAppointmentRepository _appointments = appointmentRepository;

    public async Task<OperationResult<PatientProfileResponse>> GetMyProfileAsync(string externalUserId, CancellationToken cancellationToken = default)
    {
        var patient = await _patients.GetByExternalUserIdAsync(externalUserId, cancellationToken);
        if (patient is null)
        {
            return OperationResult<PatientProfileResponse>.NotFound("Aún no has completado tu perfil. Guarda tus datos básicos para continuar.");
        }

        return OperationResult<PatientProfileResponse>.Success(ToResponse(patient));
    }

    public async Task<OperationResult<PatientProfileResponse>> UpsertMyProfileAsync(string externalUserId, string? email, PatientProfileUpsertRequest request, CancellationToken cancellationToken = default)
    {
        var errors = PatientInputValidator.ValidateBasicPatientData(request.DocumentNumber, request.FirstName, request.LastName, request.Phone, request.Email ?? email).ToList();
        if (errors.Count > 0)
        {
            return OperationResult<PatientProfileResponse>.Validation(errors.ToArray());
        }

        var normalizedDocument = PatientInputValidator.Normalize(request.DocumentNumber);
        var normalizedEmail = PatientInputValidator.Normalize(request.Email ?? email);

        var patient = await _patients.GetByExternalUserIdAsync(externalUserId, cancellationToken)
                     ?? await _patients.GetByDocumentAsync(normalizedDocument, cancellationToken);

        if (patient is null)
        {
            patient = new PatientProfile();
            await _patients.AddAsync(patient, cancellationToken);
        }

        patient.ExternalUserId = externalUserId;
        patient.DocumentNumber = normalizedDocument;
        patient.FirstName = PatientInputValidator.Normalize(request.FirstName);
        patient.LastName = PatientInputValidator.Normalize(request.LastName);
        patient.Phone = PatientInputValidator.Normalize(request.Phone);
        patient.Gender = request.Gender;
        patient.BirthDate = request.BirthDate;
        patient.Email = string.IsNullOrWhiteSpace(normalizedEmail) ? null : normalizedEmail;
        patient.IsGuest = false;

        try
        {
            await _patients.SaveChangesAsync(cancellationToken);
        }
        catch (UniqueConstraintException)
        {
            return OperationResult<PatientProfileResponse>.Conflict("Ya existe otro paciente con ese documento o usuario vinculado.");
        }

        return OperationResult<PatientProfileResponse>.Success(ToResponse(patient));
    }

    public async Task<OperationResult<IReadOnlyList<AppointmentResponse>>> GetMyAppointmentsAsync(string externalUserId, CancellationToken cancellationToken = default)
    {
        var patient = await _patients.GetByExternalUserIdAsync(externalUserId, cancellationToken);
        if (patient is null)
        {
            return OperationResult<IReadOnlyList<AppointmentResponse>>.NotFound("Aún no tienes un perfil vinculado al usuario autenticado.");
        }

        var appointmentEntities = await _appointments.GetAppointmentsByDocumentAsync(patient.DocumentNumber, cancellationToken);
        var appointments = appointmentEntities
            .OrderByDescending(x => x.AppointmentDate)
            .ThenBy(x => x.StartTime)
            .Select(x => new AppointmentResponse(
                x.Id,
                x.Provider?.DisplayName ?? string.Empty,
                x.Provider?.Specialty ?? string.Empty,
                x.PatientProfile?.FullName ?? string.Empty,
                x.PatientProfile?.DocumentNumber ?? string.Empty,
                x.PatientProfile?.Phone ?? string.Empty,
                x.AppointmentDate,
                x.StartTime.ToString("HH:mm"),
                x.EndTime.ToString("HH:mm"),
                x.Status switch { AppointmentStatus.Scheduled => "Programada", AppointmentStatus.Cancelled => "Cancelada", AppointmentStatus.Completed => "Completada", AppointmentStatus.NoShow => "No asistió", _ => "Programada" },
                x.Channel switch { AppointmentChannel.Web => "Web", AppointmentChannel.WhatsApp => "WhatsApp", AppointmentChannel.Phone => "Llamada", AppointmentChannel.Internal => "Portal interno", _ => "Web" },
                x.Notes))
            .ToList();

        return OperationResult<IReadOnlyList<AppointmentResponse>>.Success(appointments);
    }

    private static PatientProfileResponse ToResponse(PatientProfile patient)
    {
        return new PatientProfileResponse(
            patient.Id,
            patient.DocumentNumber,
            patient.FirstName,
            patient.LastName,
            patient.Phone,
            patient.Gender,
            patient.BirthDate,
            patient.Email,
            patient.IsGuest);
    }
}
