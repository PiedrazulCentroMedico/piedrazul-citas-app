using Piedrazul.Application;
using Xunit;

namespace Piedrazul.Domain.Tests;

public sealed class ValidationTests
{
    // ── BookingSlotCalculator ─────────────────────────────────────────────────

    [Fact]
    public void BuildSlots_ShouldGenerateExpectedSlots()
    {
        var slots = BookingSlotCalculator.BuildSlots(new TimeOnly(8, 0), new TimeOnly(9, 0), 30);

        Assert.Equal(2, slots.Count);
        Assert.Equal(new TimeOnly(8, 0), slots[0].StartTime);
        Assert.Equal(new TimeOnly(8, 30), slots[0].EndTime);
        Assert.Equal(new TimeOnly(8, 30), slots[1].StartTime);
        Assert.Equal(new TimeOnly(9, 0), slots[1].EndTime);
    }

    [Fact]
    public void BuildSlots_ShouldReturnEmpty_WhenIntervalIsZero()
    {
        var slots = BookingSlotCalculator.BuildSlots(new TimeOnly(8, 0), new TimeOnly(9, 0), 0);
        Assert.Empty(slots);
    }

    [Fact]
    public void BuildSlots_ShouldReturnEmpty_WhenIntervalIsNegative()
    {
        var slots = BookingSlotCalculator.BuildSlots(new TimeOnly(8, 0), new TimeOnly(9, 0), -15);
        Assert.Empty(slots);
    }

    [Fact]
    public void BuildSlots_ShouldReturnEmpty_WhenStartEqualsEnd()
    {
        var slots = BookingSlotCalculator.BuildSlots(new TimeOnly(8, 0), new TimeOnly(8, 0), 30);
        Assert.Empty(slots);
    }

    [Fact]
    public void BuildSlots_ShouldReturnEmpty_WhenStartIsAfterEnd()
    {
        var slots = BookingSlotCalculator.BuildSlots(new TimeOnly(10, 0), new TimeOnly(8, 0), 30);
        Assert.Empty(slots);
    }

    [Fact]
    public void BuildSlots_ShouldDropPartialSlotAtEnd()
    {
        // 8:00–8:50 con intervalo de 30 min → solo 1 slot (8:00–8:30); 8:30–9:00 no cabe en 8:50
        var slots = BookingSlotCalculator.BuildSlots(new TimeOnly(8, 0), new TimeOnly(8, 50), 30);

        Assert.Single(slots);
        Assert.Equal(new TimeOnly(8, 0), slots[0].StartTime);
        Assert.Equal(new TimeOnly(8, 30), slots[0].EndTime);
    }

    [Fact]
    public void BuildSlots_ShouldReturnSingleSlot_WhenRangeExactlyMatchesInterval()
    {
        var slots = BookingSlotCalculator.BuildSlots(new TimeOnly(8, 0), new TimeOnly(9, 0), 60);

        Assert.Single(slots);
        Assert.Equal(new TimeOnly(8, 0), slots[0].StartTime);
        Assert.Equal(new TimeOnly(9, 0), slots[0].EndTime);
    }

    [Fact]
    public void BuildSlots_ShouldGenerateFourSlots_WithFifteenMinuteInterval()
    {
        var slots = BookingSlotCalculator.BuildSlots(new TimeOnly(8, 0), new TimeOnly(9, 0), 15);

        Assert.Equal(4, slots.Count);
        Assert.Equal(new TimeOnly(8, 45), slots[3].StartTime);
        Assert.Equal(new TimeOnly(9, 0), slots[3].EndTime);
    }

    // ── PatientInputValidator ─────────────────────────────────────────────────

    [Fact]
    public void ValidateBasicPatientData_ShouldRejectInvalidDocumentAndPhone()
    {
        var errors = PatientInputValidator.ValidateBasicPatientData("ABC", "María", "Gomez", "30A", "correo");

        Assert.Contains(errors, error => error.Contains("documento", StringComparison.OrdinalIgnoreCase));
        Assert.Contains(errors, error => error.Contains("celular", StringComparison.OrdinalIgnoreCase));
        Assert.Contains(errors, error => error.Contains("correo", StringComparison.OrdinalIgnoreCase));
    }

    [Fact]
    public void ValidateBasicPatientData_ShouldReturnNoErrors_ForValidInput()
    {
        var errors = PatientInputValidator.ValidateBasicPatientData(
            "12345678", "María", "Gomez", "3001234567", "ana@ejemplo.com");

        Assert.Empty(errors);
    }

    [Fact]
    public void ValidateBasicPatientData_ShouldRejectDocumentTooShort()
    {
        // 4 dígitos — mínimo es 5
        var errors = PatientInputValidator.ValidateBasicPatientData(
            "1234", "María", "Gomez", "3001234567", null);

        Assert.Contains(errors, e => e.Contains("documento", StringComparison.OrdinalIgnoreCase));
    }

    [Fact]
    public void ValidateBasicPatientData_ShouldRejectDocumentTooLong()
    {
        // 21 dígitos — máximo es 20
        var errors = PatientInputValidator.ValidateBasicPatientData(
            "123456789012345678901", "María", "Gomez", "3001234567", null);

        Assert.Contains(errors, e => e.Contains("documento", StringComparison.OrdinalIgnoreCase));
    }

    [Fact]
    public void ValidateBasicPatientData_ShouldRejectPhoneTooShort()
    {
        // 6 dígitos — mínimo es 7
        var errors = PatientInputValidator.ValidateBasicPatientData(
            "12345678", "María", "Gomez", "123456", null);

        Assert.Contains(errors, e => e.Contains("celular", StringComparison.OrdinalIgnoreCase));
    }

    [Fact]
    public void ValidateBasicPatientData_ShouldAcceptNullEmail()
    {
        var errors = PatientInputValidator.ValidateBasicPatientData(
            "12345678", "María", "Gomez", "3001234567", null);

        Assert.DoesNotContain(errors, e => e.Contains("correo", StringComparison.OrdinalIgnoreCase));
    }

    [Fact]
    public void ValidateBasicPatientData_ShouldRejectEmailWithoutAtSymbol()
    {
        var errors = PatientInputValidator.ValidateBasicPatientData(
            "12345678", "María", "Gomez", "3001234567", "sinarroba.com");

        Assert.Contains(errors, e => e.Contains("correo", StringComparison.OrdinalIgnoreCase));
    }

    [Fact]
    public void ValidateBasicPatientData_ShouldRejectFirstNameWithNumbers()
    {
        var errors = PatientInputValidator.ValidateBasicPatientData(
            "12345678", "María123", "Gomez", "3001234567", null);

        Assert.Contains(errors, e => e.Contains("nombres", StringComparison.OrdinalIgnoreCase));
    }

    // ── Normalize ─────────────────────────────────────────────────────────────

    [Fact]
    public void Normalize_ShouldTrimAndCollapseSpaces()
    {
        var normalized = PatientInputValidator.Normalize("  María    Maria  ");

        Assert.Equal("María Maria", normalized);
    }

    [Fact]
    public void Normalize_ShouldReturnEmpty_ForNull()
    {
        var normalized = PatientInputValidator.Normalize(null);

        Assert.Equal(string.Empty, normalized);
    }

    [Fact]
    public void Normalize_ShouldReturnSameString_WhenAlreadyClean()
    {
        var normalized = PatientInputValidator.Normalize("María Maria");

        Assert.Equal("María Maria", normalized);
    }
}
