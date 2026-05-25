namespace Piedrazul.Api.Configuration;

public sealed class AuthenticationOptions
{
    public string Mode { get; set; } = "Development";
    public string Authority { get; set; } = "http://localhost:8080/realms/piedrazul";
    public string Audience { get; set; } = "piedrazul-api";
    public bool RequireHttpsMetadata { get; set; }
    public bool ValidateAudience { get; set; } = true;
}

public sealed class FrontendOptions
{
    public string BaseUrl { get; set; } = "http://localhost:5173";
}

public sealed class CenterOptions
{
    public string Name { get; set; } = "Piedrazul - Centro Médico";
    public string Tagline { get; set; } = "Agenda tus citas de forma simple, segura y clara";
    public string Address { get; set; } = "Popayán, Cauca";
    public string Phone { get; set; } = "+57 300 123 4567";
    public string AttentionHours { get; set; } = "Lunes a viernes de 8:00 a.m. a 6:00 p.m.";
    public string About { get; set; } = "Piedrazul acompaña a sus pacientes con una experiencia de agendamiento simple, enfocada en claridad, velocidad y facilidad de uso para todas las edades.";
}

public sealed class RedisOptions
{
    public string ConnectionString { get; set; } = "localhost:6379";
}

public sealed class NotificationOptions
{
    public string BaseUrl { get; set; } = "http://localhost:5200";
}
