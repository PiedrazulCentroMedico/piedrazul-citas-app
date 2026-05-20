namespace Piedrazul.Application.Abstractions.Infrastructure;

public sealed record KeycloakUserInfo(string Id, string Username, string? Email, string? FirstName, string? LastName, bool Enabled);
public sealed record CreateKeycloakUserRequest(string Username, string? Email, string? FirstName, string? LastName, string Password, IReadOnlyList<string> Roles);

public interface IKeycloakAdminClient
{
    Task<IReadOnlyList<KeycloakUserInfo>> GetUsersAsync(CancellationToken cancellationToken = default);
    Task<string> CreateUserAsync(CreateKeycloakUserRequest request, CancellationToken cancellationToken = default);
    Task DeleteUserAsync(string userId, CancellationToken cancellationToken = default);
}
