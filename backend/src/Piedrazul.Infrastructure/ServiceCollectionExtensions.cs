using System;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Piedrazul.Application.Abstractions.Infrastructure;
using Piedrazul.Application.Abstractions.Repositories;
using Piedrazul.Infrastructure.Cache;
using Piedrazul.Infrastructure.Keycloak;
using Piedrazul.Infrastructure.Notifications;
using Piedrazul.Infrastructure.Observability;
using Piedrazul.Infrastructure.Persistence;
using Piedrazul.Infrastructure.Persistence.Repositories;
using Piedrazul.Infrastructure.Services;
using RabbitMQ.Client;
using StackExchange.Redis;

namespace Piedrazul.Infrastructure;

public static class ServiceCollectionExtensions
{
    public static IServiceCollection AddInfrastructure(this IServiceCollection services, IConfiguration configuration)
    {
        services.AddDbContext<AppDbContext>(options =>
            options.UseNpgsql(configuration.GetConnectionString("Postgres")));

        services.AddScoped<IAppointmentRepository, AppointmentRepository>();
        services.AddScoped<IPatientRepository, PatientRepository>();
        services.AddScoped<IProviderRepository, ProviderRepository>();
        services.AddScoped<ISystemSettingsRepository, SystemSettingsRepository>();

        services.AddScoped<IAppointmentPdfExporter, AppointmentPdfExporter>();
        services.AddScoped<IAppointmentExcelExporter, AppointmentExcelExporter>();
        services.AddScoped<IAuditLogger, SerilogAuditLogger>();

        var redisConnectionString = configuration.GetSection("Redis").GetValue<string>("ConnectionString")
                                    ?? configuration.GetConnectionString("Redis");
        if (string.IsNullOrWhiteSpace(redisConnectionString))
        {
            services.AddSingleton<ICacheService, NullCacheService>();
        }
        else
        {
            services.AddSingleton<IConnectionMultiplexer>(_ =>
                ConnectionMultiplexer.Connect(redisConnectionString + ",abortConnect=false"));
            services.AddSingleton<ICacheService, RedisCacheService>();
        }

        var rabbitMqConnectionString = configuration.GetSection("RabbitMq").GetValue<string>("ConnectionString");
        var notificationsBaseUrl = configuration.GetSection("Notifications").GetValue<string>("BaseUrl");

        if (!string.IsNullOrWhiteSpace(rabbitMqConnectionString))
        {
            services.AddSingleton<IConnection>(_ =>
            {
                var factory = new ConnectionFactory { Uri = new Uri(rabbitMqConnectionString) };
                // Task.Run evita el deadlock del contexto de sincronización al llamar
                // código async desde el registro síncrono de DI.
                return Task.Run(() => factory.CreateConnectionAsync()).GetAwaiter().GetResult();
            });
            services.AddSingleton<INotificationClient, RabbitMqNotificationClient>();
        }
        else if (!string.IsNullOrWhiteSpace(notificationsBaseUrl))
        {
            services.AddHttpClient<INotificationClient, HttpNotificationClient>(client =>
            {
                client.BaseAddress = new Uri(notificationsBaseUrl);
            });
        }
        else
        {
            services.AddSingleton<INotificationClient, NoOpNotificationClient>();
        }

        var keycloakUrl = configuration["Keycloak:AuthServerUrl"];
        if (!string.IsNullOrWhiteSpace(keycloakUrl))
        {
            services.AddHttpClient();
            services.AddScoped<IKeycloakAdminClient, KeycloakAdminClient>();
        }
        else
        {
            services.AddHttpClient();
            services.AddScoped<IKeycloakAdminClient, NoOpKeycloakAdminClient>();
        }

        return services;
    }
}
