using Piedrazul.Notifications.Consumers;
using Piedrazul.Notifications.Notifications;
using RabbitMQ.Client;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

var rabbitMqConnectionString = builder.Configuration.GetSection("RabbitMq").GetValue<string>("ConnectionString");
if (!string.IsNullOrWhiteSpace(rabbitMqConnectionString))
{
    builder.Services.AddSingleton<IConnection>(_ =>
    {
        var factory = new ConnectionFactory { Uri = new Uri(rabbitMqConnectionString) };
        return Task.Run(() => factory.CreateConnectionAsync()).GetAwaiter().GetResult();
    });
    builder.Services.AddHostedService<AppointmentNotificationConsumer>();
}

// Register notification sender
var smtpHost = builder.Configuration["Smtp:Host"];
if (!string.IsNullOrWhiteSpace(smtpHost))
    builder.Services.AddSingleton<INotificationSender, SmtpNotificationSender>();
else
    builder.Services.AddSingleton<INotificationSender, NullNotificationSender>();

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.MapPost("/notifications/appointment", (AppointmentNotification notification, INotificationSender sender) =>
{
    _ = sender.SendAppointmentCreatedAsync(notification.Id, notification.AppointmentDate, notification.StartTime, notification.PatientProfileId, notification.ProviderId);
    return Results.Accepted();
});

app.MapPost("/notifications/appointment/status", (AppointmentStatusNotification notification, INotificationSender sender) =>
{
    _ = sender.SendAppointmentStatusChangedAsync(notification.Id, notification.Status, notification.AppointmentDate, notification.StartTime, notification.PatientProfileId);
    return Results.Accepted();
});

app.Run();

public sealed record AppointmentNotification(
    Guid Id,
    DateOnly AppointmentDate,
    string StartTime,
    string EndTime,
    Guid PatientProfileId,
    Guid ProviderId);

public sealed record AppointmentStatusNotification(
    Guid Id,
    string Status,
    DateOnly AppointmentDate,
    string StartTime,
    Guid PatientProfileId);
