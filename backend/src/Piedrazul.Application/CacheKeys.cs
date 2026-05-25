namespace Piedrazul.Application;

internal static class CacheKeys
{
    internal static string AvailabilitySlots(Guid providerId, DateOnly date)
        => $"availability:{providerId}:{date:yyyyMMdd}";
}
