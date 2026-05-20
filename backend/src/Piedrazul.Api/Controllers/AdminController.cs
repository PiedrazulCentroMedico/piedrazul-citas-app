using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Piedrazul.Application;
using Piedrazul.Application.Abstractions.Infrastructure;

namespace Piedrazul.Api.Controllers;

[Authorize(Roles = "Admin,Doctor")]
[Route("api/admin")]
public sealed class AdminController(
    IAdministrationService administrationService,
    IKeycloakAdminClient keycloakAdmin) : ApiControllerBase
{
    private readonly IAdministrationService _administrationService = administrationService;
    private readonly IKeycloakAdminClient _keycloakAdmin = keycloakAdmin;

    [HttpGet("settings")]
    public async Task<ActionResult<SystemSettingsResponse>> GetSettings(CancellationToken cancellationToken)
    {
        var result = await _administrationService.GetSystemSettingsAsync(cancellationToken);
        return Ok(result);
    }

    [Authorize(Roles = "Admin")]
    [HttpPut("settings")]
    public async Task<ActionResult<SystemSettingsResponse>> UpdateSettings([FromBody] SystemSettingsRequest request, CancellationToken cancellationToken)
    {
        var result = await _administrationService.UpdateSystemSettingsAsync(request, cancellationToken);
        return result.Succeeded && result.Data is not null ? Ok(result.Data) : FromFailure(result);
    }

    [HttpGet("provider-schedules")]
    public async Task<ActionResult<IReadOnlyList<ProviderScheduleResponse>>> GetProviderSchedules(CancellationToken cancellationToken)
    {
        var result = await _administrationService.GetProviderSchedulesAsync(cancellationToken);
        return Ok(result);
    }

    [Authorize(Roles = "Admin")]
    [HttpPost("provider-schedules")]
    public async Task<ActionResult<ProviderScheduleResponse>> CreateProviderSchedule([FromBody] ProviderScheduleRequest request, CancellationToken cancellationToken)
    {
        var result = await _administrationService.CreateProviderScheduleAsync(request, cancellationToken);
        return result.Succeeded && result.Data is not null ? Ok(result.Data) : FromFailure(result);
    }

    [Authorize(Roles = "Admin")]
    [HttpPut("provider-schedules/{providerId:guid}")]
    public async Task<ActionResult<ProviderScheduleResponse>> UpdateProviderSchedule(Guid providerId, [FromBody] ProviderScheduleRequest request, CancellationToken cancellationToken)
    {
        var result = await _administrationService.UpdateProviderScheduleAsync(providerId, request, cancellationToken);
        return result.Succeeded && result.Data is not null ? Ok(result.Data) : FromFailure(result);
    }

    [Authorize(Roles = "Admin")]
    [HttpDelete("provider-schedules/{providerId:guid}")]
    public async Task<IActionResult> DeleteProviderSchedule(Guid providerId, CancellationToken cancellationToken)
    {
        var result = await _administrationService.DeleteProviderScheduleAsync(providerId, cancellationToken);
        return result.Succeeded ? NoContent() : FromFailure(result);
    }

    [Authorize(Roles = "Admin")]
    [HttpGet("patients")]
    public async Task<ActionResult<IReadOnlyList<PatientLookupResponse>>> SearchPatients([FromQuery] string term, CancellationToken cancellationToken)
    {
        var result = await _administrationService.SearchPatientsForAdminAsync(term, cancellationToken);
        return Ok(result);
    }

    [Authorize(Roles = "Admin")]
    [HttpPut("patients/{patientId:guid}")]
    public async Task<ActionResult<PatientLookupResponse>> UpdatePatient(Guid patientId, [FromBody] PatientProfileUpsertRequest request, CancellationToken cancellationToken)
    {
        var result = await _administrationService.UpdatePatientAsync(patientId, request, cancellationToken);
        return result.Succeeded && result.Data is not null ? Ok(result.Data) : FromFailure(result);
    }

    [Authorize(Roles = "Admin")]
    [HttpGet("internal-users")]
    public async Task<ActionResult<IReadOnlyList<KeycloakUserInfo>>> GetInternalUsers(CancellationToken cancellationToken)
    {
        var users = await _keycloakAdmin.GetUsersAsync(cancellationToken);
        return Ok(users);
    }

    [Authorize(Roles = "Admin")]
    [HttpPost("internal-users")]
    public async Task<ActionResult<object>> CreateInternalUser([FromBody] CreateKeycloakUserRequest request, CancellationToken cancellationToken)
    {
        var userId = await _keycloakAdmin.CreateUserAsync(request, cancellationToken);
        return Ok(new { id = userId });
    }

    [Authorize(Roles = "Admin")]
    [HttpDelete("internal-users/{userId}")]
    public async Task<IActionResult> DeleteInternalUser(string userId, CancellationToken cancellationToken)
    {
        await _keycloakAdmin.DeleteUserAsync(userId, cancellationToken);
        return NoContent();
    }
}
