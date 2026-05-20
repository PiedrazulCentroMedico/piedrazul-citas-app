using Microsoft.AspNetCore.Mvc;
using Piedrazul.Application;

namespace Piedrazul.Api.Controllers;

[ApiController]
public abstract class ApiControllerBase : ControllerBase
{
    protected ActionResult FromFailure<T>(OperationResult<T> result)
    {
        var payload = new { errors = result.Errors };
        return result.Status switch
        {
            OperationStatus.NotFound       => NotFound(payload),
            OperationStatus.Conflict       => Conflict(payload),
            OperationStatus.ValidationError => UnprocessableEntity(payload),
            _                              => BadRequest(payload)
        };
    }
}
