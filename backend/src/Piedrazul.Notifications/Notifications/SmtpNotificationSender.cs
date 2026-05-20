using MailKit.Net.Smtp;
using MailKit.Security;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using MimeKit;

namespace Piedrazul.Notifications.Notifications;

public sealed class SmtpNotificationSender(IConfiguration configuration, ILogger<SmtpNotificationSender> logger) : INotificationSender
{
    private readonly string _host = configuration["Smtp:Host"] ?? "localhost";
    private readonly int _port = int.TryParse(configuration["Smtp:Port"], out var p) ? p : 25;
    private readonly string _from = configuration["Smtp:From"] ?? "noreply@piedrazul.local";
    private readonly string? _username = configuration["Smtp:Username"];
    private readonly string? _password = configuration["Smtp:Password"];

    public async Task SendAppointmentCreatedAsync(Guid appointmentId, DateOnly date, string startTime, Guid patientProfileId, Guid providerId, CancellationToken cancellationToken = default)
    {
        var subject = $"Cita confirmada — {date:dd/MM/yyyy} a las {startTime}";
        var body = $"Su cita ha sido registrada exitosamente para el {date:dd/MM/yyyy} a las {startTime}. ID de cita: {appointmentId}.";
        await SendAsync(subject, body, cancellationToken);
    }

    public async Task SendAppointmentStatusChangedAsync(Guid appointmentId, string status, DateOnly date, string startTime, Guid patientProfileId, CancellationToken cancellationToken = default)
    {
        var subject = $"Actualización de cita — {status}";
        var body = $"El estado de su cita del {date:dd/MM/yyyy} a las {startTime} ha cambiado a: {status}. ID: {appointmentId}.";
        await SendAsync(subject, body, cancellationToken);
    }

    private async Task SendAsync(string subject, string body, CancellationToken cancellationToken)
    {
        var message = new MimeMessage();
        message.From.Add(MailboxAddress.Parse(_from));
        message.To.Add(MailboxAddress.Parse(_from)); // placeholder — real implementation would use patient email
        message.Subject = subject;
        message.Body = new TextPart("plain") { Text = body };

        try
        {
            using var client = new SmtpClient();
            await client.ConnectAsync(_host, _port, SecureSocketOptions.Auto, cancellationToken);
            if (!string.IsNullOrWhiteSpace(_username))
                await client.AuthenticateAsync(_username, _password, cancellationToken);
            await client.SendAsync(message, cancellationToken);
            await client.DisconnectAsync(true, cancellationToken);
            logger.LogInformation("Email sent: {Subject}", subject);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Failed to send email: {Subject}", subject);
            throw;
        }
    }
}
