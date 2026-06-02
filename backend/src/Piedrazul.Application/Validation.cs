using System.Text.RegularExpressions;

namespace Piedrazul.Application;

public sealed record TimeSlot(TimeOnly StartTime, TimeOnly EndTime);

public static class BookingSlotCalculator
{
    public static IReadOnlyList<TimeSlot> BuildSlots(TimeOnly start, TimeOnly end, int intervalMinutes)
    {
        var slots = new List<TimeSlot>();

        if (intervalMinutes <= 0 || start >= end)
        {
            return slots;
        }

        var current = start;
        while (current < end)
        {
            var next = current.AddMinutes(intervalMinutes);
            if (next > end)
            {
                break;
            }

            slots.Add(new TimeSlot(current, next));
            current = next;
        }

        return slots;
    }
}

public static class PatientInputValidator
{
    private static readonly Regex DigitsOnly = new("^[0-9]+$", RegexOptions.Compiled);
    private static readonly Regex PersonName = new("^[A-Za-zÁÉÍÓÚáéíóúÑñÜü' -]+$", RegexOptions.Compiled);
    private static readonly Regex WhitespaceCollapse = new(@"\s+", RegexOptions.Compiled);

    public static string Normalize(string? value)
    {
        return WhitespaceCollapse.Replace(value?.Trim() ?? string.Empty, " ");
    }

    public static IReadOnlyList<string> ValidatePersonName(string firstName, string lastName)
    {
        var errors = new List<string>();
        var normalizedFirst = Normalize(firstName);
        var normalizedLast = Normalize(lastName);

        if (normalizedFirst.Length is < 2 or > 80 || !PersonName.IsMatch(normalizedFirst))
            errors.Add("Los nombres solo pueden contener letras, espacios, apóstrofes o guiones y tener entre 2 y 80 caracteres.");

        if (normalizedLast.Length is < 2 or > 80 || !PersonName.IsMatch(normalizedLast))
            errors.Add("Los apellidos solo pueden contener letras, espacios, apóstrofes o guiones y tener entre 2 y 80 caracteres.");

        return errors;
    }

    public static IReadOnlyList<string> ValidateBasicPatientData(
        string documentNumber,
        string firstName,
        string lastName,
        string phone,
        string? email,
        DateOnly? birthDate = null)
    {
        var errors = new List<string>();
        var normalizedDocument = Normalize(documentNumber);
        var normalizedPhone = Normalize(phone);
        var normalizedEmail = Normalize(email);

        if (normalizedDocument.Length is < 5 or > 20 || !DigitsOnly.IsMatch(normalizedDocument))
        {
            errors.Add("El documento debe contener solo números y tener entre 5 y 20 dígitos.");
        }

        errors.AddRange(ValidatePersonName(firstName, lastName));

        if (normalizedPhone.Length is < 7 or > 15 || !DigitsOnly.IsMatch(normalizedPhone))
        {
            errors.Add("El celular debe contener solo números y tener entre 7 y 15 dígitos.");
        }

        if (!string.IsNullOrWhiteSpace(normalizedEmail) && (normalizedEmail.Length > 150 || !normalizedEmail.Contains('@')))
        {
            errors.Add("El correo electrónico no tiene un formato válido o supera los 150 caracteres.");
        }

        if (birthDate is null)
        {
            errors.Add("La fecha de nacimiento es obligatoria.");
        }
        else
        {
            var today = DateOnly.FromDateTime(DateTime.Today);
            var age = today.Year - birthDate.Value.Year;
            if (birthDate.Value > today.AddYears(-age)) age--;

            if (birthDate.Value > today)
                errors.Add("La fecha de nacimiento no puede ser una fecha futura.");
            else if (age < 18)
                errors.Add("El paciente debe ser mayor de edad para continuar.");
            else if (age > 100)
                errors.Add("La edad registrada no puede superar los 100 años.");
        }

        return errors;
    }
}

public static class ScheduleValidator
{
    public static IReadOnlyList<string> ValidateInterval(int intervalMinutes)
    {
        var errors = new List<string>();
        if (intervalMinutes is < 10 or > 120)
        {
            errors.Add("El intervalo entre citas debe estar entre 10 y 120 minutos.");
        }

        return errors;
    }
}
