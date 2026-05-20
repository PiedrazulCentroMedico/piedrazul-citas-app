using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using Piedrazul.Api.Configuration;
using Piedrazul.Application;

namespace Piedrazul.Api.Controllers;

[Route("api/public")]
public sealed class PublicController(
    IAvailabilityService availabilityService,
    IAppointmentBookingService bookingService,
    IPatientLookupService patientLookupService,
    IOptions<CenterOptions> centerOptions) : ApiControllerBase
{
    private readonly IAvailabilityService _availability = availabilityService;
    private readonly IAppointmentBookingService _booking = bookingService;
    private readonly IPatientLookupService _patientLookup = patientLookupService;
    private readonly CenterOptions _centerOptions = centerOptions.Value;

    [HttpGet("info")]
    public ActionResult<CenterInfoResponse> GetInfo() =>
        Ok(new CenterInfoResponse(
            _centerOptions.Name,
            _centerOptions.Tagline,
            _centerOptions.Address,
            _centerOptions.Phone,
            _centerOptions.AttentionHours,
            _centerOptions.About));

    [HttpGet("providers")]
    public async Task<ActionResult<IReadOnlyList<ProviderSummaryResponse>>> GetProviders(CancellationToken cancellationToken)
    {
        var providers = await _availability.GetActiveProvidersAsync(cancellationToken);
        return Ok(providers);
    }

    [HttpGet("providers/{providerId:guid}/availability")]
    public async Task<ActionResult<IReadOnlyList<AvailabilitySlotResponse>>> GetAvailability(Guid providerId, [FromQuery] DateOnly date, CancellationToken cancellationToken)
    {
        var result = await _availability.GetAvailabilityAsync(providerId, date, cancellationToken);
        return result.Succeeded && result.Data is not null ? Ok(result.Data) : FromFailure(result);
    }

    [HttpGet("patients/lookup")]
    public async Task<ActionResult<PatientPublicLookupResponse>> LookupPatient([FromQuery] string document, CancellationToken cancellationToken)
    {
        var patient = await _patientLookup.GetPatientByDocumentAsync(document, cancellationToken);
        if (patient is null)
            return Ok(new PatientPublicLookupResponse(false, null, null, null, null, null, null, null));

        return Ok(new PatientPublicLookupResponse(
            Exists: true,
            Id: patient.Id,
            FirstName: patient.FirstName,
            LastName: patient.LastName,
            Gender: patient.Gender,
            MaskedPhone: PiiMasking.MaskPhone(patient.Phone),
            MaskedEmail: PiiMasking.MaskEmail(patient.Email),
            BirthYear: patient.BirthDate?.Year));
    }

    [HttpPost("appointments")]
    public async Task<ActionResult<AppointmentResponse>> CreateAppointment([FromBody] PublicAppointmentRequest request, CancellationToken cancellationToken)
    {
        var result = await _booking.CreatePublicAppointmentAsync(request, null, "public-web", cancellationToken);
        return result.Succeeded && result.Data is not null ? Ok(result.Data) : FromFailure(result);
    }
}
