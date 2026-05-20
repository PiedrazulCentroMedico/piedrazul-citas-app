using Piedrazul.Application.Abstractions.Repositories;
using Piedrazul.Domain;

namespace Piedrazul.Application;

public sealed class AdministrationService(IProviderRepository providerRepository, ISystemSettingsRepository settingsRepository, IPatientRepository patientRepository, IAppointmentRepository appointmentRepository) : IAdministrationService
{
    private readonly IProviderRepository _providers = providerRepository;
    private readonly ISystemSettingsRepository _settings = settingsRepository;
    private readonly IPatientRepository _patients = patientRepository;
    private readonly IAppointmentRepository _appointments = appointmentRepository;

    public async Task<SystemSettingsResponse> GetSystemSettingsAsync(CancellationToken cancellationToken = default)
    {
        var settings = await _settings.GetAsync(cancellationToken)
                       ?? new SystemSetting { WeeksAheadBooking = 6, TimeZoneId = "America/Bogota" };

        return new SystemSettingsResponse(settings.WeeksAheadBooking, settings.TimeZoneId);
    }

    public async Task<OperationResult<SystemSettingsResponse>> UpdateSystemSettingsAsync(SystemSettingsRequest request, CancellationToken cancellationToken = default)
    {
        if (request.WeeksAheadBooking is < 1 or > 24)
        {
            return OperationResult<SystemSettingsResponse>.Validation("La ventana de tiempo para agendar citas debe estar entre 1 y 24 semanas.");
        }

        var settings = await _settings.GetAsync(cancellationToken);
        if (settings is null)
        {
            settings = new SystemSetting();
            await _settings.AddAsync(settings, cancellationToken);
        }

        settings.WeeksAheadBooking = request.WeeksAheadBooking;
        settings.TimeZoneId = string.IsNullOrWhiteSpace(request.TimeZoneId) ? "America/Bogota" : request.TimeZoneId.Trim();

        await _settings.SaveChangesAsync(cancellationToken);
        return OperationResult<SystemSettingsResponse>.Success(new SystemSettingsResponse(settings.WeeksAheadBooking, settings.TimeZoneId));
    }

    public async Task<IReadOnlyList<ProviderScheduleResponse>> GetProviderSchedulesAsync(CancellationToken cancellationToken = default)
    {
        var providers = await _providers.GetWithAvailabilitiesAsync(cancellationToken);
        return providers.Select(ToResponse).ToList();
    }

    public async Task<OperationResult<ProviderScheduleResponse>> CreateProviderScheduleAsync(ProviderScheduleRequest request, CancellationToken cancellationToken = default)
    {
        var errors = new List<string>();
        errors.AddRange(ScheduleValidator.ValidateInterval(request.DefaultSlotIntervalMinutes));
        errors.AddRange(PatientInputValidator.ValidateBasicPatientData("12345", request.FirstName, request.LastName, "3001234567", null)
            .Where(x => !x.Contains("documento", StringComparison.OrdinalIgnoreCase) && !x.Contains("celular", StringComparison.OrdinalIgnoreCase)));

        if (string.IsNullOrWhiteSpace(PatientInputValidator.Normalize(request.Specialty)) || request.Specialty.Length > 80)
        {
            errors.Add("La especialidad es obligatoria y no puede superar 80 caracteres.");
        }

        if (request.WeeklyAvailabilities.Count == 0)
        {
            errors.Add("Debes configurar al menos una franja de disponibilidad.");
        }

        var availabilitiesToSave = new List<WeeklyAvailability>();
        foreach (var item in request.WeeklyAvailabilities)
        {
            errors.AddRange(ScheduleValidator.ValidateInterval(item.SlotIntervalMinutes));
            if (!TimeOnly.TryParse(item.StartTime, out var startTime) || !TimeOnly.TryParse(item.EndTime, out var endTime) || startTime >= endTime)
            {
                errors.Add($"La franja del día {item.DayOfWeek} no es válida.");
                continue;
            }

            availabilitiesToSave.Add(new WeeklyAvailability
            {
                DayOfWeek = item.DayOfWeek,
                StartTime = startTime,
                EndTime = endTime,
                SlotIntervalMinutes = item.SlotIntervalMinutes,
                IsActive = item.IsActive,
            });
        }

        if (errors.Count > 0)
        {
            return OperationResult<ProviderScheduleResponse>.Validation(errors.Distinct().ToArray());
        }

        var codeBase = string.Concat(PatientInputValidator.Normalize(request.FirstName).Take(3)).ToUpperInvariant();
        var provider = new Provider
        {
            Code = $"{codeBase}{Guid.NewGuid().ToString("N")[..8].ToUpperInvariant()}",
            FirstName = PatientInputValidator.Normalize(request.FirstName),
            LastName = PatientInputValidator.Normalize(request.LastName),
            Specialty = PatientInputValidator.Normalize(request.Specialty),
            DefaultSlotIntervalMinutes = request.DefaultSlotIntervalMinutes,
            IsActive = true,
            WeeklyAvailabilities = availabilitiesToSave,
        };

        await _providers.AddAsync(provider, cancellationToken);
        await _providers.SaveChangesAsync(cancellationToken);

        var refreshedProvider = await _providers.GetByIdAsync(provider.Id, cancellationToken);
        return refreshedProvider is null
            ? OperationResult<ProviderScheduleResponse>.NotFound("No se encontró el profesional recién creado.")
            : OperationResult<ProviderScheduleResponse>.Success(ToResponse(refreshedProvider));
    }

    public async Task<OperationResult<ProviderScheduleResponse>> UpdateProviderScheduleAsync(Guid providerId, ProviderScheduleRequest request, CancellationToken cancellationToken = default)
    {
        var provider = await _providers.GetByIdAsync(providerId, cancellationToken);
        if (provider is null)
        {
            return OperationResult<ProviderScheduleResponse>.NotFound("No se encontró el profesional que deseas actualizar.");
        }

        var errors = new List<string>();
        errors.AddRange(ScheduleValidator.ValidateInterval(request.DefaultSlotIntervalMinutes));
        errors.AddRange(PatientInputValidator.ValidateBasicPatientData("12345", request.FirstName, request.LastName, "3001234567", null)
            .Where(x => !x.Contains("documento", StringComparison.OrdinalIgnoreCase) && !x.Contains("celular", StringComparison.OrdinalIgnoreCase)));

        if (string.IsNullOrWhiteSpace(PatientInputValidator.Normalize(request.Specialty)) || request.Specialty.Length > 80)
        {
            errors.Add("La especialidad es obligatoria y no puede superar 80 caracteres.");
        }

        if (request.WeeklyAvailabilities.Count == 0)
        {
            errors.Add("Debes configurar al menos una franja de disponibilidad.");
        }

        var availabilitiesToSave = new List<WeeklyAvailability>();
        foreach (var item in request.WeeklyAvailabilities)
        {
            errors.AddRange(ScheduleValidator.ValidateInterval(item.SlotIntervalMinutes));
            if (!TimeOnly.TryParse(item.StartTime, out var startTime) || !TimeOnly.TryParse(item.EndTime, out var endTime) || startTime >= endTime)
            {
                errors.Add($"La franja del día {item.DayOfWeek} no es válida.");
                continue;
            }

            availabilitiesToSave.Add(new WeeklyAvailability
            {
                ProviderId = provider.Id,
                DayOfWeek = item.DayOfWeek,
                StartTime = startTime,
                EndTime = endTime,
                SlotIntervalMinutes = item.SlotIntervalMinutes,
                IsActive = item.IsActive,
            });
        }

        if (errors.Count > 0)
        {
            return OperationResult<ProviderScheduleResponse>.Validation(errors.Distinct().ToArray());
        }

        provider.FirstName = PatientInputValidator.Normalize(request.FirstName);
        provider.LastName = PatientInputValidator.Normalize(request.LastName);
        provider.Specialty = PatientInputValidator.Normalize(request.Specialty);
        provider.DefaultSlotIntervalMinutes = request.DefaultSlotIntervalMinutes;

        try
        {
            await _providers.RemoveAvailabilitiesAsync(provider.Id, cancellationToken);
            await _providers.AddAvailabilitiesAsync(availabilitiesToSave, cancellationToken);
            await _providers.SaveChangesAsync(cancellationToken);
        }
        catch (UniqueConstraintException)
        {
            return OperationResult<ProviderScheduleResponse>.Conflict("No pudimos guardar la disponibilidad. Revisa que las franjas no se solapen y vuelve a intentarlo.");
        }

        var refreshedProvider = await _providers.GetByIdAsync(provider.Id, cancellationToken);
        return refreshedProvider is null
            ? OperationResult<ProviderScheduleResponse>.NotFound("No se encontró el profesional actualizado.")
            : OperationResult<ProviderScheduleResponse>.Success(ToResponse(refreshedProvider));
    }

    public async Task<OperationResult<bool>> DeleteProviderScheduleAsync(Guid providerId, CancellationToken cancellationToken = default)
    {
        var provider = await _providers.GetByIdAsync(providerId, cancellationToken);
        if (provider is null)
        {
            return OperationResult<bool>.NotFound("No se encontró el profesional que deseas eliminar.");
        }

        provider.IsActive = false;
        await _providers.RemoveAvailabilitiesAsync(providerId, cancellationToken);
        await _providers.SaveChangesAsync(cancellationToken);
        return OperationResult<bool>.Success(true);
    }

    public async Task<IReadOnlyList<PatientLookupResponse>> SearchPatientsForAdminAsync(string term, CancellationToken cancellationToken = default)
    {
        var normalized = PatientInputValidator.Normalize(term);
        if (string.IsNullOrWhiteSpace(normalized)) return Array.Empty<PatientLookupResponse>();

        var profiles = await _patients.SearchByTermAsync(normalized, 25, cancellationToken);
        var profileIds = profiles.Select(x => x.Id).ToArray();
        var countMap = new Dictionary<Guid, int>();
        foreach (var profileId in profileIds)
        {
            countMap[profileId] = await _appointments.CountScheduledAppointmentsByPatientIdAsync(profileId, cancellationToken);
        }

        return profiles.Select(profile => new PatientLookupResponse(
            profile.Id,
            profile.DocumentNumber,
            profile.FirstName,
            profile.LastName,
            profile.FullName,
            profile.Phone,
            profile.Gender,
            profile.BirthDate,
            profile.Email,
            countMap.GetValueOrDefault(profile.Id, 0),
            !string.IsNullOrWhiteSpace(profile.ExternalUserId))).ToList();
    }

    public async Task<OperationResult<PatientLookupResponse>> UpdatePatientAsync(Guid patientId, PatientProfileUpsertRequest request, CancellationToken cancellationToken = default)
    {
        var errors = PatientInputValidator.ValidateBasicPatientData(request.DocumentNumber, request.FirstName, request.LastName, request.Phone, request.Email).ToList();
        if (errors.Count > 0)
        {
            return OperationResult<PatientLookupResponse>.Validation(errors.ToArray());
        }

        var patient = await _patients.GetByIdAsync(patientId, cancellationToken);
        if (patient is null)
        {
            return OperationResult<PatientLookupResponse>.NotFound("No se encontró el paciente que deseas editar.");
        }

        patient.DocumentNumber = PatientInputValidator.Normalize(request.DocumentNumber);
        patient.FirstName = PatientInputValidator.Normalize(request.FirstName);
        patient.LastName = PatientInputValidator.Normalize(request.LastName);
        patient.Phone = PatientInputValidator.Normalize(request.Phone);
        patient.Gender = request.Gender;
        patient.BirthDate = request.BirthDate;
        patient.Email = string.IsNullOrWhiteSpace(request.Email) ? null : PatientInputValidator.Normalize(request.Email);

        try
        {
            await _patients.SaveChangesAsync(cancellationToken);
        }
        catch (UniqueConstraintException)
        {
            return OperationResult<PatientLookupResponse>.Conflict("Ya existe otro paciente con esa cédula.");
        }

        var scheduledCount = await _appointments.CountScheduledAppointmentsByPatientIdAsync(patient.Id, cancellationToken);
        return OperationResult<PatientLookupResponse>.Success(new PatientLookupResponse(patient.Id, patient.DocumentNumber, patient.FirstName, patient.LastName, patient.FullName, patient.Phone, patient.Gender, patient.BirthDate, patient.Email, scheduledCount, !string.IsNullOrWhiteSpace(patient.ExternalUserId)));
    }

    private static ProviderScheduleResponse ToResponse(Provider provider)
    {
        return new ProviderScheduleResponse(
            provider.Id,
            provider.DisplayName,
            provider.Specialty,
            provider.DefaultSlotIntervalMinutes,
            provider.WeeklyAvailabilities
                .OrderBy(x => x.DayOfWeek)
                .ThenBy(x => x.StartTime)
                .Select(x => new WeeklyAvailabilityDto(x.Id, x.DayOfWeek, x.StartTime.ToString("HH:mm"), x.EndTime.ToString("HH:mm"), x.SlotIntervalMinutes, x.IsActive))
                .ToList());
    }
}
