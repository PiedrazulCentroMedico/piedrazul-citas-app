using Piedrazul.Application.Abstractions.Repositories;
using Piedrazul.Domain;

namespace Piedrazul.Application;

public sealed class PatientLookupService(
    IPatientRepository patientRepository,
    IAppointmentRepository appointmentRepository) : IPatientLookupService
{
    private readonly IPatientRepository _patients = patientRepository;
    private readonly IAppointmentRepository _appointments = appointmentRepository;

    public async Task<IReadOnlyList<PatientLookupResponse>> SearchPatientsAsync(string documentTerm, CancellationToken cancellationToken = default)
    {
        var normalized = PatientInputValidator.Normalize(documentTerm);
        if (string.IsNullOrWhiteSpace(normalized))
            return Array.Empty<PatientLookupResponse>();

        var profiles = await _patients.SearchByPrefixAsync(normalized, 10, cancellationToken);
        return await MapToLookupResponsesAsync(profiles, cancellationToken);
    }

    public async Task<PatientLookupResponse?> GetPatientByDocumentAsync(string documentNumber, CancellationToken cancellationToken = default)
    {
        var normalized = PatientInputValidator.Normalize(documentNumber);
        if (string.IsNullOrWhiteSpace(normalized))
            return null;

        var profile = await _patients.GetByDocumentAsync(normalized, cancellationToken);
        if (profile is null)
            return null;

        var scheduledCount = await _appointments.CountScheduledAppointmentsByPatientIdAsync(profile.Id, cancellationToken);
        return ToLookupResponse(profile, scheduledCount);
    }

    public async Task<PatientPublicLookupResponse> GetPublicPatientLookupAsync(string documentNumber, CancellationToken cancellationToken = default)
    {
        var normalized = PatientInputValidator.Normalize(documentNumber);
        if (string.IsNullOrWhiteSpace(normalized))
            return new PatientPublicLookupResponse(false, null, null, null, null, null, null, null, false, null, null);

        var profile = await _patients.GetByDocumentAsync(normalized, cancellationToken);
        if (profile is null)
            return new PatientPublicLookupResponse(false, null, null, null, null, null, null, null, false, null, null);

        var appointments = await _appointments.GetAppointmentsByDocumentAsync(normalized, cancellationToken);

var lastGuestAppointment = appointments
    .Where(x => x.PatientProfile != null && x.PatientProfile.IsGuest)
    .OrderByDescending(x => x.AppointmentDate)
    .ThenByDescending(x => x.StartTime)
    .FirstOrDefault();

var mustRegister = string.IsNullOrWhiteSpace(profile.ExternalUserId) && lastGuestAppointment is not null;

return new PatientPublicLookupResponse(
    Exists: true,
    Id: profile.Id,
    FirstName: profile.FirstName,
    LastName: profile.LastName,
    Gender: profile.Gender,
    MaskedPhone: PiiMasking.MaskPhone(profile.Phone),
    MaskedEmail: PiiMasking.MaskEmail(profile.Email),
    BirthYear: profile.BirthDate?.Year,
    MustRegister: mustRegister,
    LastGuestAppointmentDate: lastGuestAppointment?.AppointmentDate,
    LastGuestAppointmentType: lastGuestAppointment?.Provider.Specialty);
    }

    private async Task<IReadOnlyList<PatientLookupResponse>> MapToLookupResponsesAsync(
        IReadOnlyList<PatientProfile> profiles,
        CancellationToken cancellationToken)
    {
        if (profiles.Count == 0)
            return Array.Empty<PatientLookupResponse>();

        var profileIds = profiles.Select(x => x.Id).ToList();
        var countMap = await _appointments.CountScheduledByPatientIdsAsync(profileIds, cancellationToken);

        return profiles
            .Select(x => ToLookupResponse(x, countMap.GetValueOrDefault(x.Id, 0)))
            .ToList();
    }

    private static PatientLookupResponse ToLookupResponse(PatientProfile profile, int scheduledCount) =>
        new(
            profile.Id,
            profile.DocumentNumber,
            profile.FirstName,
            profile.LastName,
            profile.FullName,
            profile.Phone,
            profile.Gender,
            profile.BirthDate,
            profile.Email,
            scheduledCount,
            !string.IsNullOrWhiteSpace(profile.ExternalUserId));
}
