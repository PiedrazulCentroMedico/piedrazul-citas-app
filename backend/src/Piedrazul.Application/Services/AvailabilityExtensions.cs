namespace Piedrazul.Application;

internal static class AvailabilityExtensions
{
    internal static async Task<OperationResult<TimeSlot>> ResolveSlotAsync(
        this IAvailabilityService availability,
        Guid providerId,
        DateOnly date,
        string startTime,
        CancellationToken cancellationToken)
    {
        if (!TimeOnly.TryParse(startTime, out var requestedStartTime))
            return OperationResult<TimeSlot>.Validation("La hora seleccionada no tiene un formato válido.");

        var availabilityResult = await availability.GetAvailabilityAsync(providerId, date, cancellationToken);
        if (!availabilityResult.Succeeded || availabilityResult.Data is null)
            return OperationResult<TimeSlot>.Validation(availabilityResult.Errors.ToArray());

        var slot = availabilityResult.Data.FirstOrDefault(x => x.StartTime == requestedStartTime.ToString("HH:mm"));
        if (slot is null)
            return OperationResult<TimeSlot>.Validation("La franja seleccionada no corresponde al horario configurado para este profesional.");

        if (!slot.Available)
            return OperationResult<TimeSlot>.Validation("La franja seleccionada ya no está disponible.");

        return OperationResult<TimeSlot>.Success(new TimeSlot(TimeOnly.Parse(slot.StartTime), TimeOnly.Parse(slot.EndTime)));
    }
}
