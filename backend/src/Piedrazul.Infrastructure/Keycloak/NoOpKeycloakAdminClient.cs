using Microsoft.Extensions.Logging;
using Piedrazul.Application.Abstractions.Infrastructure;

namespace Piedrazul.Infrastructure.Keycloak;

public sealed class NoOpKeycloakAdminClient(ILogger<NoOpKeycloakAdminClient> logger) : IKeycloakAdminClient
{
    public Task<IReadOnlyList<KeycloakUserInfo>> GetUsersAsync(CancellationToken cancellationToken = default)
    {
        logger.LogWarning("Keycloak:AuthServerUrl not configured — returning empty user list.");
        return Task.FromResult<IReadOnlyList<KeycloakUserInfo>>(Array.Empty<KeycloakUserInfo>());
    }

    public Task<string> CreateUserAsync(CreateKeycloakUserRequest request, CancellationToken cancellationToken = default)
    {
        logger.LogWarning("Keycloak:AuthServerUrl not configured — user creation skipped.");
        return Task.FromResult(Guid.NewGuid().ToString());
    }

    public Task DeleteUserAsync(string userId, CancellationToken cancellationToken = default)
    {
        logger.LogWarning("Keycloak:AuthServerUrl not configured — user deletion skipped.");
        return Task.CompletedTask;
    }
}
