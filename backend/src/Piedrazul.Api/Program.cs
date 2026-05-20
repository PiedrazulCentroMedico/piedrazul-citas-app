using System.Security.Claims;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.IdentityModel.Tokens;
using Serilog;
using Piedrazul.Api.Configuration;
using Piedrazul.Api.Middleware;
using Piedrazul.Application;
using Piedrazul.Infrastructure;
using Piedrazul.Infrastructure.Persistence;
using Piedrazul.Infrastructure.Security;
using AppAuthenticationOptions = Piedrazul.Api.Configuration.AuthenticationOptions;

var builder = WebApplication.CreateBuilder(args);

Log.Logger = new LoggerConfiguration()
    .Enrich.FromLogContext()
    .Enrich.WithProperty("Service", "Piedrazul.Api")
    .WriteTo.Console()
    .WriteTo.File("logs/audit-.log", rollingInterval: RollingInterval.Day)
    .CreateLogger();

builder.Host.UseSerilog();

builder.Services.Configure<AppAuthenticationOptions>(builder.Configuration.GetSection("Authentication"));
builder.Services.Configure<FrontendOptions>(builder.Configuration.GetSection("Frontend"));
builder.Services.Configure<CenterOptions>(builder.Configuration.GetSection("Center"));
builder.Services.Configure<DevelopmentAuthOptions>(builder.Configuration.GetSection("DevelopmentAuth"));
builder.Services.Configure<RedisOptions>(builder.Configuration.GetSection("Redis"));
builder.Services.Configure<NotificationOptions>(builder.Configuration.GetSection("Notifications"));

builder.Services.AddControllers().AddJsonOptions(options =>
{
    options.JsonSerializerOptions.Converters.Add(new JsonStringEnumConverter());
});
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();
builder.Services.AddProblemDetails();

builder.Services.AddRateLimiter(options =>
{
    options.AddFixedWindowLimiter("global", limiterOptions =>
    {
        limiterOptions.Window = TimeSpan.FromMinutes(1);
        limiterOptions.PermitLimit = 120;
        limiterOptions.QueueLimit = 0;
        limiterOptions.AutoReplenishment = true;
    });
});

builder.Services.AddApplication();
builder.Services.AddInfrastructure(builder.Configuration);

var frontendBaseUrl = builder.Configuration.GetSection("Frontend").GetValue<string>("BaseUrl");
var additionalOrigins = builder.Configuration.GetSection("Frontend:AllowedOrigins").Get<string[]>() ?? Array.Empty<string>();
var allowedOrigins = new List<string>();

if (!string.IsNullOrWhiteSpace(frontendBaseUrl))
{
    allowedOrigins.Add(frontendBaseUrl);
}

allowedOrigins.AddRange(additionalOrigins.Where(origin => !string.IsNullOrWhiteSpace(origin)));

if (allowedOrigins.Count == 0)
{
    allowedOrigins.Add("http://localhost:5173");
}

allowedOrigins = allowedOrigins
    .Distinct(StringComparer.OrdinalIgnoreCase)
    .ToList();
builder.Services.AddCors(options =>
{
    options.AddPolicy("frontend", policy =>
        policy.WithOrigins(allowedOrigins.ToArray())
              .AllowAnyHeader()
              .AllowAnyMethod());
});

var authenticationMode = builder.Configuration["Authentication:Mode"] ?? "Development";
if (string.Equals(authenticationMode, "Keycloak", StringComparison.OrdinalIgnoreCase))
{
    builder.Services
        .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
        .AddJwtBearer(options =>
        {
            options.Authority = builder.Configuration["Authentication:Authority"];
            options.RequireHttpsMetadata = builder.Configuration.GetValue("Authentication:RequireHttpsMetadata", false);
            options.TokenValidationParameters = new TokenValidationParameters
            {
                ValidateAudience = true,
                ValidAudience = builder.Configuration["Authentication:Audience"],
                NameClaimType = ClaimTypes.Name,
                RoleClaimType = ClaimTypes.Role
            };
            options.Events = new JwtBearerEvents
            {
                OnTokenValidated = KeycloakClaimsEnricher.EnrichAsync
            };
        });
}
else
{
    builder.Services
        .AddAuthentication("Development")
        .AddScheme<AuthenticationSchemeOptions, DevelopmentAuthHandler>("Development", _ => { });
}

builder.Services.AddAuthorization(options =>
{
    options.AddPolicy("InternalStaff", policy => policy.RequireRole("Admin", "Scheduler", "Doctor"));
});

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseMiddleware<ExceptionHandlingMiddleware>();
app.UseMiddleware<SecurityHeadersMiddleware>();
app.UseCors("frontend");
app.UseAuthentication();
app.UseAuthorization();
app.UseRateLimiter();
app.MapControllers().RequireRateLimiting("global");

await DatabaseInitializer.MigrateAndSeedAsync(app.Services);

app.Run();