using System.Security.Claims;
using System.Text.Encodings.Web;
using Microsoft.AspNetCore.Authentication;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace Piedrazul.Infrastructure.Security;

public sealed class DevelopmentAuthOptions
{
    public string DefaultSubject { get; set; } = "staff-admin@piedrazul.local";
    public string DefaultName { get; set; } = "Administrador Piedrazul";
    public string? DefaultEmail { get; set; } = "admin@piedrazul.local";
    public string[] DefaultRoles { get; set; } = ["Admin"];
}

public sealed class DevelopmentAuthHandler(
    IOptionsMonitor<AuthenticationSchemeOptions> options,
    ILoggerFactory logger,
    UrlEncoder encoder,
    IOptions<DevelopmentAuthOptions> developmentAuthOptions,
    IHostEnvironment env)
    : AuthenticationHandler<AuthenticationSchemeOptions>(options, logger, encoder)
{
    private readonly DevelopmentAuthOptions _developmentAuthOptions = developmentAuthOptions.Value;
    private readonly IHostEnvironment _env = env;

    protected override Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        if (!_env.IsDevelopment())
            throw new InvalidOperationException(
                "DevelopmentAuthHandler solo debe ser utilizado en entornos de desarrollo. Verifique la configuración de autenticación.");

        var subject = Request.Headers["X-Debug-Subject"].FirstOrDefault() ?? _developmentAuthOptions.DefaultSubject;
        var name = Request.Headers["X-Debug-Name"].FirstOrDefault() ?? _developmentAuthOptions.DefaultName;
        var email = Request.Headers["X-Debug-Email"].FirstOrDefault() ?? _developmentAuthOptions.DefaultEmail;
        var rolesHeader = Request.Headers["X-Debug-Roles"].FirstOrDefault();
        var roles = string.IsNullOrWhiteSpace(rolesHeader)
            ? _developmentAuthOptions.DefaultRoles
            : rolesHeader.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

        var claims = new List<Claim>
        {
            new(ClaimTypes.NameIdentifier, subject),
            new("sub", subject),
            new(ClaimTypes.Name, name)
        };

        if (!string.IsNullOrWhiteSpace(email))
        {
            claims.Add(new Claim(ClaimTypes.Email, email));
        }

        foreach (var role in roles)
        {
            claims.Add(new Claim(ClaimTypes.Role, role));
        }

        var identity = new ClaimsIdentity(claims, Scheme.Name);
        var principal = new ClaimsPrincipal(identity);
        var ticket = new AuthenticationTicket(principal, Scheme.Name);

        return Task.FromResult(AuthenticateResult.Success(ticket));
    }
}
