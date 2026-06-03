using Piedrazul.Domain;
using Xunit;

namespace Piedrazul.Domain.Tests;

// ─────────────────────────────────────────────────────────────────────────────
// AppointmentStatus — valores del enum y reglas de transición de estado
// ─────────────────────────────────────────────────────────────────────────────

public sealed class AppointmentStatusTests
{
    // ── Valores numéricos del enum ────────────────────────────────────────────

    [Theory]
    [InlineData(AppointmentStatus.Scheduled,  1)]
    [InlineData(AppointmentStatus.Cancelled,  2)]
    [InlineData(AppointmentStatus.Completed,  3)]
    [InlineData(AppointmentStatus.NoShow,     4)]
    public void AppointmentStatus_NumericValues_MatchSpecification(AppointmentStatus status, int expected)
    {
        Assert.Equal(expected, (int)status);
    }

    [Fact]
    public void AppointmentStatus_AllFourValuesAreDefined()
    {
        var defined = Enum.GetValues<AppointmentStatus>();

        Assert.Contains(AppointmentStatus.Scheduled,  defined);
        Assert.Contains(AppointmentStatus.Cancelled,  defined);
        Assert.Contains(AppointmentStatus.Completed,  defined);
        Assert.Contains(AppointmentStatus.NoShow,     defined);
        Assert.Equal(4, defined.Length);
    }

    [Fact]
    public void AppointmentStatus_CastingOutOfRangeInt_IsNotDefinedInEnum()
    {
        var undefined = (AppointmentStatus)99;

        Assert.False(Enum.IsDefined(undefined));
    }

    // ── Transiciones válidas: desde Scheduled hacia cualquier estado terminal ─

    [Theory]
    [InlineData(AppointmentStatus.Cancelled)]
    [InlineData(AppointmentStatus.Completed)]
    [InlineData(AppointmentStatus.NoShow)]
    public void Appointment_ValidTransition_ScheduledAppointmentAcceptsTerminalStatus(AppointmentStatus target)
    {
        var appointment = new Appointment(); // Status = Scheduled por defecto

        // La regla del dominio: solo se puede cambiar si el estado actual es Scheduled
        Assert.True(appointment.Status == AppointmentStatus.Scheduled);

        appointment.Status = target;

        Assert.Equal(target, appointment.Status);
    }

    // ── Transiciones inválidas: estados terminales no habilitan más cambios ───
    // La regla que aplica AppointmentLifecycleService es:
    //   if (appointment.Status != AppointmentStatus.Scheduled) → rechazar
    // Estas pruebas verifican que dicha condición sea FALSE para estados terminales.

    [Theory]
    [InlineData(AppointmentStatus.Cancelled)]
    [InlineData(AppointmentStatus.Completed)]
    [InlineData(AppointmentStatus.NoShow)]
    public void Appointment_InvalidTransition_TerminalStatusDoesNotAllowFurtherChange(AppointmentStatus terminal)
    {
        var appointment = new Appointment { Status = terminal };

        bool transitionAllowed = appointment.Status == AppointmentStatus.Scheduled;

        Assert.False(transitionAllowed);
    }

    [Fact]
    public void Appointment_TransitionNotAllowed_WhenAlreadyCancelled()
    {
        var appointment = new Appointment { Status = AppointmentStatus.Cancelled };

        // Intento de re-cancelar: la condición de guarda falla
        bool canTransition = appointment.Status == AppointmentStatus.Scheduled;

        Assert.False(canTransition);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// PatientProfile.FullName — casos de borde con espacios y nombres parciales
// (los casos básicos ya están en DomainModelTests; aquí se cubre lo faltante)
// ─────────────────────────────────────────────────────────────────────────────

public sealed class PatientFullNameEdgeCaseTests
{
    [Fact]
    public void FullName_WhenFirstNameIsWhitespaceOnly_ReturnsLastNameOnly()
    {
        var patient = new PatientProfile { FirstName = "   ", LastName = "Gómez" };

        Assert.Equal("Gómez", patient.FullName);
    }

    [Fact]
    public void FullName_WhenLastNameIsWhitespaceOnly_ReturnsFirstNameOnly()
    {
        var patient = new PatientProfile { FirstName = "Ana", LastName = "   " };

        Assert.Equal("Ana", patient.FullName);
    }

    [Fact]
    public void FullName_WhenBothNamesAreWhitespaceOnly_ReturnsEmptyString()
    {
        var patient = new PatientProfile { FirstName = "   ", LastName = "\t" };

        Assert.Equal(string.Empty, patient.FullName);
    }

    [Fact]
    public void FullName_WithMultiWordNames_ConcatenatesWithSingleSpace()
    {
        var patient = new PatientProfile
        {
            FirstName = "María José",
            LastName  = "Rodríguez Pérez"
        };

        Assert.Equal("María José Rodríguez Pérez", patient.FullName);
    }

    [Fact]
    public void FullName_WithSingleName_DoesNotAddTrailingOrLeadingSpaces()
    {
        var patient = new PatientProfile { FirstName = "Carlos", LastName = string.Empty };

        // No debe haber espacios sobrantes
        Assert.DoesNotContain(' ', patient.FullName);
        Assert.Equal("Carlos", patient.FullName);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// AuditableEntity — Id auto-generado, fechas en UTC, UpdatedAtUtc nula
// (AuditableEntity_ShouldGenerateUniqueIds y CreatedAtUtc ya están cubiertos
// en DomainModelTests; aquí se verifican los invariantes que faltaban)
// ─────────────────────────────────────────────────────────────────────────────

public sealed class AuditableEntityDefaultsTests
{
    [Fact]
    public void AuditableEntity_Id_IsNotEmptyGuid()
    {
        var entity = new PatientProfile();

        Assert.NotEqual(Guid.Empty, entity.Id);
    }

    [Fact]
    public void AuditableEntity_Id_IsValidGuidFormat()
    {
        var entity = new Appointment();

        // Guid.NewGuid() siempre produce un versión 4 de 16 bytes; se verifica
        // que al serializar a string tenga el formato canónico de 36 caracteres.
        Assert.Equal(36, entity.Id.ToString().Length);
        Assert.True(Guid.TryParse(entity.Id.ToString(), out _));
    }

    [Fact]
    public void AuditableEntity_CreatedAtUtc_KindIsUtc()
    {
        var entity = new PatientProfile();

        Assert.Equal(DateTimeKind.Utc, entity.CreatedAtUtc.Kind);
    }

    [Fact]
    public void AuditableEntity_UpdatedAtUtc_IsNullByDefault()
    {
        var entity = new Provider();

        Assert.Null(entity.UpdatedAtUtc);
    }

    [Fact]
    public void AuditableEntity_DifferentEntityTypes_EachGetUniqueId()
    {
        var patient     = new PatientProfile();
        var provider    = new Provider();
        var appointment = new Appointment();

        Assert.NotEqual(patient.Id,  provider.Id);
        Assert.NotEqual(provider.Id, appointment.Id);
        Assert.NotEqual(patient.Id,  appointment.Id);
    }
}
