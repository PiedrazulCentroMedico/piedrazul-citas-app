using System.Security.Claims;
using System.Text.Json;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.JsonWebTokens;

namespace Piedrazul.Infrastructure.Security;

public static class KeycloakClaimsEnricher
{
    public static Task EnrichAsync(TokenValidatedContext context)
    {
        if (context.Principal?.Identity is not ClaimsIdentity identity || context.SecurityToken is not JsonWebToken jwtToken)
        {
            return Task.CompletedTask;
        }

        foreach (var role in ExtractRealmRoles(jwtToken))
        {
            if (!identity.Claims.Any(x => x.Type == ClaimTypes.Role && x.Value == role))
            {
                identity.AddClaim(new Claim(ClaimTypes.Role, role));
            }
        }

        if (jwtToken.TryGetClaim("preferred_username", out var usernameClaim))
        {
            identity.AddClaim(new Claim(ClaimTypes.Name, usernameClaim.Value));
        }

        if (jwtToken.TryGetClaim("email", out var emailClaim))
        {
            identity.AddClaim(new Claim(ClaimTypes.Email, emailClaim.Value));
        }

        return Task.CompletedTask;
    }

    private static IEnumerable<string> ExtractRealmRoles(JsonWebToken jwtToken)
    {
        if (!jwtToken.TryGetPayloadValue<JsonElement>("realm_access", out var realmAccess))
        {
            return [];
        }

        if (realmAccess.ValueKind == JsonValueKind.Object && realmAccess.TryGetProperty("roles", out var rolesElement))
        {
            return rolesElement.EnumerateArray().Select(x => x.GetString()).OfType<string>();
        }

        return [];
    }
}
