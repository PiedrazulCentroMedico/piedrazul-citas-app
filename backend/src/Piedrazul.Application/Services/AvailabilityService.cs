using Piedrazul.Application.Abstractions.Infrastructure;
using Piedrazul.Application.Abstractions.Repositories;
using Piedrazul.Domain;

namespace Piedrazul.Application;

public sealed class AvailabilityService(
    IAppointmentRepository appointmentRepository,
    ISystemSettingsRepository settingsRepository,
    ICacheService cacheService) : IAvailabilityService
{
    private readonly IAppointmentRepository _appointments = appointmentRepository;
    private readonly ISystemSettingsRepository _settings = settingsRepository;
    private readonly ICacheService _cache = cacheService;

    public async Task<IReadOnlyList<ProviderSummaryResponse>> GetActiveProvidersAsync(CancellationToken cancellationToken = default)
    {
        var providers = await _appointments.GetActiveProvidersAsync(cancellationToken);
        return providers
            .OrderBy(x => x.Specialty)
            .ThenBy(x => x.FirstName)
            .Select(x => new ProviderSummaryResponse(x.Id, x.DisplayName, x.Specialty, x.DefaultSlotIntervalMinutes))
            .ToList();
    }

    public async Task<OperationResult<IReadOnlyList<AvailabilitySlotResponse>>> GetAvailabilityAsync(Guid providerId, DateOnly date, CancellationToken cancellationToken = default)
    {
        var provider = await _appointments.GetActiveProviderAsync(providerId, cancellationToken);
        if (provider is null)
            return OperationResult<IReadOnlyList<AvailabilitySlotResponse>>.NotFound("No se encontró el médico o terapista seleccionado.");

        var settings = await GetSettingsAsync(cancellationToken);
        var today = DateOnly.FromDateTime(DateTime.Today);
        if (date < today)
            return OperationResult<IReadOnlyList<AvailabilitySlotResponse>>.Validation("No es posible reservar citas en fechas pasadas.");

        if (date > today.AddDays(settings.WeeksAheadBooking * 7))
            return OperationResult<IReadOnlyList<AvailabilitySlotResponse>>.Validation($"Solo se pueden reservar citas dentro de las próximas {settings.WeeksAheadBooking} semanas.");

        var cacheKey = $"availability:{providerId}:{date:yyyyMMdd}";
        var cached = await _cache.GetOrSetAsync(cacheKey, TimeSpan.FromMinutes(2), async () =>
        {
            var availabilities = await _appointments.GetWeeklyAvailabilitiesAsync(providerId, date.DayOfWeek, cancellationToken);
            var bookedTimes = await _appointments.GetBookedTimesAsync(providerId, date, cancellationToken);

            var slots = new List<AvailabilitySlotResponse>();
            foreach (var availability in availabilities.OrderBy(x => x.StartTime))
            {
                foreach (var slot in BookingSlotCalculator.BuildSlots(availability.StartTime, availability.EndTime, availability.SlotIntervalMinutes))
                {
                    slots.Add(new AvailabilitySlotResponse(
                        slot.StartTime.ToString("HH:mm"),
                        slot.EndTime.ToString("HH:mm"),
                        !bookedTimes.Contains(slot.StartTime)));
                }
            }

            return (IReadOnlyList<AvailabilitySlotResponse>)slots;
        }, cancellationToken);

        return OperationResult<IReadOnlyList<AvailabilitySlotResponse>>.Success(cached ?? Array.Empty<AvailabilitySlotResponse>());
    }

    private async Task<SystemSetting> GetSettingsAsync(CancellationToken cancellationToken) =>
        await _settings.GetAsync(cancellationToken) ?? new SystemSetting { WeeksAheadBooking = 6, TimeZoneId = "America/Bogota" };
}
