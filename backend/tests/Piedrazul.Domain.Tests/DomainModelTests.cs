using Piedrazul.Application;
using Piedrazul.Domain;
using Xunit;

namespace Piedrazul.Domain.Tests;

public sealed class DomainModelTests
{
    // ── PatientProfile.FullName ───────────────────────────────────────────────

    [Fact]
    public void PatientProfile_FullName_ShouldCombineFirstAndLastName()
    {
        var patient = new PatientProfile { FirstName = "María", LastName = "Gomez" };

        Assert.Equal("María Gomez", patient.FullName);
    }

    [Fact]
    public void PatientProfile_FullName_ShouldReturnFirstNameOnly_WhenLastNameIsEmpty()
    {
        var patient = new PatientProfile { FirstName = "María", LastName = "" };

        Assert.Equal("María", patient.FullName);
    }

    [Fact]
    public void PatientProfile_FullName_ShouldReturnLastNameOnly_WhenFirstNameIsEmpty()
    {
        var patient = new PatientProfile { FirstName = "", LastName = "Gomez" };

        Assert.Equal("Gomez", patient.FullName);
    }

    [Fact]
    public void PatientProfile_FullName_ShouldReturnEmpty_WhenBothNamesAreEmpty()
    {
        var patient = new PatientProfile { FirstName = "", LastName = "" };

        Assert.Equal(string.Empty, patient.FullName);
    }

    // ── Provider.DisplayName ──────────────────────────────────────────────────

    [Fact]
    public void Provider_DisplayName_ShouldCombineFirstAndLastName()
    {
        var provider = new Provider { FirstName = "Pedro", LastName = "Martínez" };

        Assert.Equal("Pedro Martínez", provider.DisplayName);
    }

    [Fact]
    public void Provider_DisplayName_ShouldReturnFirstNameOnly_WhenLastNameIsEmpty()
    {
        var provider = new Provider { FirstName = "Pedro", LastName = "" };

        Assert.Equal("Pedro", provider.DisplayName);
    }

    // ── ScheduleValidator ─────────────────────────────────────────────────────

    [Theory]
    [InlineData(10)]
    [InlineData(15)]
    [InlineData(30)]
    [InlineData(60)]
    [InlineData(120)]
    public void ScheduleValidator_ShouldReturnNoErrors_ForValidInterval(int interval)
    {
        var errors = ScheduleValidator.ValidateInterval(interval);

        Assert.Empty(errors);
    }

    [Theory]
    [InlineData(0)]
    [InlineData(9)]
    [InlineData(-1)]
    [InlineData(121)]
    [InlineData(240)]
    public void ScheduleValidator_ShouldReturnError_ForInvalidInterval(int interval)
    {
        var errors = ScheduleValidator.ValidateInterval(interval);

        Assert.NotEmpty(errors);
        Assert.Contains(errors, e => e.Contains("intervalo", StringComparison.OrdinalIgnoreCase));
    }

    // ── AuditableEntity defaults ──────────────────────────────────────────────

    [Fact]
    public void AuditableEntity_ShouldGenerateUniqueIds_OnCreation()
    {
        var a = new PatientProfile();
        var b = new PatientProfile();

        Assert.NotEqual(a.Id, b.Id);
    }

    [Fact]
    public void AuditableEntity_CreatedAtUtc_ShouldBeRecentlySet()
    {
        var before = DateTime.UtcNow.AddSeconds(-1);
        var entity = new PatientProfile();
        var after = DateTime.UtcNow.AddSeconds(1);

        Assert.InRange(entity.CreatedAtUtc, before, after);
    }

    // ── Appointment defaults ──────────────────────────────────────────────────

    [Fact]
    public void Appointment_DefaultStatus_ShouldBeScheduled()
    {
        var appointment = new Appointment();

        Assert.Equal(AppointmentStatus.Scheduled, appointment.Status);
    }

    [Fact]
    public void Appointment_DefaultChannel_ShouldBeWeb()
    {
        var appointment = new Appointment();

        Assert.Equal(AppointmentChannel.Web, appointment.Channel);
    }
}
