using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Piedrazul.Application.Abstractions.Infrastructure;

namespace Piedrazul.Infrastructure.Keycloak;

public sealed class KeycloakAdminClient(IHttpClientFactory httpClientFactory, IConfiguration configuration, ILogger<KeycloakAdminClient> logger) : IKeycloakAdminClient
{
    private readonly string _keycloakUrl = configuration["Keycloak:AuthServerUrl"] ?? "http://localhost:8080";
    private readonly string _realm = configuration["Keycloak:Realm"] ?? "piedrazul";
    private readonly string _adminUser = configuration["Keycloak:Admin:Username"] ?? "admin";
    private readonly string _adminPassword = configuration["Keycloak:Admin:Password"] ?? "admin";

    private async Task<string> GetAdminTokenAsync(CancellationToken cancellationToken)
    {
        var client = httpClientFactory.CreateClient();
        var body = new FormUrlEncodedContent([
            new("client_id", "admin-cli"),
            new("username", _adminUser),
            new("password", _adminPassword),
            new("grant_type", "password"),
        ]);
        var response = await client.PostAsync($"{_keycloakUrl}/realms/master/protocol/openid-connect/token", body, cancellationToken);
        response.EnsureSuccessStatusCode();
        var json = await response.Content.ReadAsStringAsync(cancellationToken);
        using var doc = JsonDocument.Parse(json);
        return doc.RootElement.GetProperty("access_token").GetString()
            ?? throw new InvalidOperationException("No access_token in Keycloak response.");
    }

    public async Task<IReadOnlyList<KeycloakUserInfo>> GetUsersAsync(CancellationToken cancellationToken = default)
    {
        var token = await GetAdminTokenAsync(cancellationToken);
        var client = httpClientFactory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
        var response = await client.GetAsync($"{_keycloakUrl}/admin/realms/{_realm}/users?max=200", cancellationToken);
        response.EnsureSuccessStatusCode();
        var json = await response.Content.ReadAsStringAsync(cancellationToken);
        using var doc = JsonDocument.Parse(json);
        return doc.RootElement.EnumerateArray().Select(u => new KeycloakUserInfo(
            u.GetProperty("id").GetString()!,
            u.GetProperty("username").GetString()!,
            u.TryGetProperty("email", out var e) ? e.GetString() : null,
            u.TryGetProperty("firstName", out var fn) ? fn.GetString() : null,
            u.TryGetProperty("lastName", out var ln) ? ln.GetString() : null,
            u.TryGetProperty("enabled", out var en) && en.GetBoolean()
        )).ToList();
    }

    public async Task<string> CreateUserAsync(CreateKeycloakUserRequest request, CancellationToken cancellationToken = default)
    {
        var token = await GetAdminTokenAsync(cancellationToken);
        var client = httpClientFactory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);

        var payload = new
        {
            username = request.Username,
            email = request.Email,
            firstName = request.FirstName,
            lastName = request.LastName,
            enabled = true,
            credentials = new[] { new { type = "password", value = request.Password, temporary = false } },
        };
        var content = new StringContent(JsonSerializer.Serialize(payload), Encoding.UTF8, "application/json");
        var response = await client.PostAsync($"{_keycloakUrl}/admin/realms/{_realm}/users", content, cancellationToken);
        response.EnsureSuccessStatusCode();

        // Keycloak returns 201 Created with Location header containing user id
        var location = response.Headers.Location?.ToString()
            ?? throw new InvalidOperationException("Keycloak did not return a Location header.");
        var userId = location.Split('/').Last();

        // Assign roles if any
        if (request.Roles.Count > 0)
        {
            logger.LogInformation("User {UserId} created. Role assignment requires realm role IDs (skipped in demo).", userId);
        }

        return userId;
    }

    public async Task DeleteUserAsync(string userId, CancellationToken cancellationToken = default)
    {
        var token = await GetAdminTokenAsync(cancellationToken);
        var client = httpClientFactory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
        var response = await client.DeleteAsync($"{_keycloakUrl}/admin/realms/{_realm}/users/{userId}", cancellationToken);
        response.EnsureSuccessStatusCode();
    }
}
