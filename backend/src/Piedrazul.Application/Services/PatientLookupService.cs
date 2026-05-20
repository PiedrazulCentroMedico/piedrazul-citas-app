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
        return await MapPatientLookupResponsesAsync(profiles, cancellationToken);
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
        return new PatientLookupResponse(
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

    private async Task<IReadOnlyList<PatientLookupResponse>> MapPatientLookupResponsesAsync(IReadOnlyList<PatientProfile> profiles, CancellationToken cancellationToken)
    {
        if (profiles.Count == 0)
            return Array.Empty<PatientLookupResponse>();

        var counts = new Dictionary<Guid, int>();
        foreach (var profileId in profiles.Select(x => x.Id))
            counts[profileId] = await _appointments.CountScheduledAppointmentsByPatientIdAsync(profileId, cancellationToken);

        return profiles.Select(x => new PatientLookupResponse(
                x.Id, x.DocumentNumber, x.FirstName, x.LastName, x.FullName,
                x.Phone, x.Gender, x.BirthDate, x.Email,
                counts.GetValueOrDefault(x.Id, 0),
                !string.IsNullOrWhiteSpace(x.ExternalUserId)))
            .ToList();
    }
}
