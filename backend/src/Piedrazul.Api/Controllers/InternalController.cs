using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Piedrazul.Api.Extensions;
using Piedrazul.Application;

namespace Piedrazul.Api.Controllers;

[Authorize(Policy = "InternalStaff")]
[Route("api/internal")]
public sealed class InternalController(
    IAppointmentBookingService bookingService,
    IAppointmentQueryService queryService,
    IAppointmentLifecycleService lifecycleService,
    IPatientLookupService patientLookupService) : ApiControllerBase
{
    private readonly IAppointmentBookingService _booking = bookingService;
    private readonly IAppointmentQueryService _query = queryService;
    private readonly IAppointmentLifecycleService _lifecycle = lifecycleService;
    private readonly IPatientLookupService _patientLookup = patientLookupService;

    [HttpGet("patients/search")]
    public async Task<ActionResult<IReadOnlyList<PatientLookupResponse>>> SearchPatients([FromQuery] string document, CancellationToken cancellationToken)
    {
        var result = await _patientLookup.SearchPatientsAsync(document, cancellationToken);
        return Ok(result);
    }

    [HttpGet("appointments")]
    public async Task<ActionResult<AppointmentListResponse>> GetAppointments([FromQuery] Guid providerId, [FromQuery] DateOnly date, CancellationToken cancellationToken)
    {
        var result = await _query.GetAppointmentsByProviderAndDateAsync(providerId, date, cancellationToken);
        return result.Succeeded && result.Data is not null ? Ok(result.Data) : FromFailure(result);
    }

    [HttpPost("appointments")]
    public async Task<ActionResult<AppointmentResponse>> CreateInternalAppointment([FromBody] InternalCreateAppointmentRequest request, CancellationToken cancellationToken)
    {
        var result = await _booking.CreateInternalAppointmentAsync(request, User.GetDisplayName(), cancellationToken);
        return result.Succeeded && result.Data is not null ? Ok(result.Data) : FromFailure(result);
    }

    [HttpGet("appointments/export/pdf")]
    public async Task<IActionResult> ExportPdf([FromQuery] Guid providerId, [FromQuery] DateOnly date, CancellationToken cancellationToken)
    {
        var bytes = await _query.ExportAppointmentsPdfAsync(providerId, date, cancellationToken);
        if (bytes.Length == 0)
            return NotFound(new { errors = new[] { "No fue posible generar el PDF solicitado." } });
        return File(bytes, "application/pdf", $"citas-{date:yyyyMMdd}.pdf");
    }

    [HttpGet("appointments/export/csv")]
    public async Task<IActionResult> ExportCsv([FromQuery] Guid providerId, [FromQuery] DateOnly date, CancellationToken cancellationToken)
    {
        var bytes = await _query.ExportAppointmentsCsvAsync(providerId, date, cancellationToken);
        if (bytes.Length == 0)
            return NotFound(new { errors = new[] { "No fue posible generar el CSV solicitado." } });
        return File(bytes, "text/csv", $"citas_{date:yyyyMMdd}.csv");
    }

    [HttpGet("appointments/export/xlsx")]
    public async Task<IActionResult> ExportXlsx([FromQuery] Guid providerId, [FromQuery] DateOnly date, CancellationToken cancellationToken)
    {
        var bytes = await _query.ExportAppointmentsXlsxAsync(providerId, date, cancellationToken);
        if (bytes.Length == 0)
            return NotFound(new { errors = new[] { "No fue posible generar el Excel solicitado." } });
        return File(bytes, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", $"citas_{date:yyyyMMdd}.xlsx");
    }

    [HttpPatch("appointments/{appointmentId:guid}/status")]
    public async Task<ActionResult<AppointmentResponse>> UpdateAppointmentStatus(Guid appointmentId, [FromBody] AppointmentStatusUpdateRequest request, CancellationToken cancellationToken)
    {
        var result = await _lifecycle.UpdateAppointmentStatusAsync(appointmentId, request.Status, cancellationToken);
        return result.Succeeded && result.Data is not null ? Ok(result.Data) : FromFailure(result);
    }

    [HttpPut("appointments/{appointmentId:guid}/reschedule")]
    public async Task<ActionResult<AppointmentResponse>> RescheduleAppointment(Guid appointmentId, [FromBody] RescheduleAppointmentRequest request, CancellationToken cancellationToken)
    {
        var normalizedRequest = request with { AppointmentId = appointmentId };
        var result = await _lifecycle.RescheduleAppointmentAsync(normalizedRequest, User.GetSubject(), cancellationToken);
        if (result.Succeeded && result.Data is not null)
            return Ok(result.Data);

        var payload = new { errors = result.Errors };
        return result.Status switch
        {
            OperationStatus.NotFound        => NotFound(payload),
            OperationStatus.Conflict        => Conflict(payload),
            OperationStatus.ValidationError => UnprocessableEntity(payload),
            _                               => BadRequest(payload)
        };
    }

    [HttpGet("appointments/{appointmentId:guid}/history")]
    public async Task<ActionResult<IReadOnlyList<AppointmentHistoryResponse>>> GetAppointmentHistory(Guid appointmentId, CancellationToken cancellationToken)
    {
        var history = await _query.GetAppointmentHistoryAsync(appointmentId, cancellationToken);
        return Ok(history);
    }

    [HttpGet("appointments/by-document")]
    public async Task<ActionResult<IReadOnlyList<AppointmentResponse>>> GetAppointmentsByDocument([FromQuery] string document, CancellationToken cancellationToken)
    {
        var result = await _query.GetAppointmentsByDocumentAsync(document, cancellationToken);
        return Ok(result);
    }
}
