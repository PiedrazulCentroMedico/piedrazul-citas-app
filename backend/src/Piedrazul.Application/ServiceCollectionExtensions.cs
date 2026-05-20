using Microsoft.Extensions.DependencyInjection;

namespace Piedrazul.Application;

public static class ServiceCollectionExtensions
{
    public static IServiceCollection AddApplication(this IServiceCollection services)
    {
        services.AddScoped<IAvailabilityService,          AvailabilityService>();
        services.AddScoped<IAppointmentBookingService,    AppointmentBookingService>();
        services.AddScoped<IAppointmentQueryService,      AppointmentQueryService>();
        services.AddScoped<IAppointmentLifecycleService,  AppointmentLifecycleService>();
        services.AddScoped<IPatientLookupService,         PatientLookupService>();
        services.AddScoped<IPatientService,               PatientService>();
        services.AddScoped<IAdministrationService,        AdministrationService>();
        return services;
    }
}
