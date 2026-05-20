using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Logging;
using Piedrazul.Application.Abstractions.Infrastructure;
using Piedrazul.Domain;
using RabbitMQ.Client;

namespace Piedrazul.Infrastructure.Notifications;

// Canal reutilizable entre publicaciones (MED-02).
// Las notificaciones son best-effort: si fallan tras los reintentos el error se
// registra pero NO se propaga al caller — la cita siempre se devuelve al cliente (MED-04).
public sealed class RabbitMqNotificationClient(IConnection connection, ILogger<RabbitMqNotificationClient> logger)
    : INotificationClient, IAsyncDisposable
{
    private const string Exchange = "piedrazul";
    private const int MaxAttempts = 3;

    private IChannel? _channel;
    private readonly SemaphoreSlim _lock = new(1, 1);

    public Task NotifyAppointmentCreatedAsync(Appointment appointment, CancellationToken cancellationToken = default)
    {
        var payload = new
        {
            Id = appointment.Id,
            AppointmentDate = appointment.AppointmentDate,
            StartTime = appointment.StartTime.ToString("HH:mm"),
            EndTime = appointment.EndTime.ToString("HH:mm"),
            PatientProfileId = appointment.PatientProfileId,
            ProviderId = appointment.ProviderId,
        };
        return PublishAsync("appointment.created", payload, cancellationToken);
    }

    public Task NotifyAppointmentStatusChangedAsync(Appointment appointment, CancellationToken cancellationToken = default)
    {
        var payload = new
        {
            Id = appointment.Id,
            Status = appointment.Status.ToString(),
            AppointmentDate = appointment.AppointmentDate,
            StartTime = appointment.StartTime.ToString("HH:mm"),
            PatientProfileId = appointment.PatientProfileId,
        };
        return PublishAsync("appointment.status", payload, cancellationToken);
    }

    private async Task<IChannel> GetOrCreateChannelAsync(CancellationToken cancellationToken)
    {
        if (_channel is { IsOpen: true }) return _channel;

        await _lock.WaitAsync(cancellationToken);
        try
        {
            if (_channel is { IsOpen: true }) return _channel;
            if (_channel is not null) await _channel.DisposeAsync();

            _channel = await connection.CreateChannelAsync(cancellationToken: cancellationToken);
            await _channel.ExchangeDeclareAsync(
                exchange: Exchange,
                type: ExchangeType.Topic,
                durable: true,
                autoDelete: false,
                cancellationToken: cancellationToken);
            return _channel;
        }
        finally
        {
            _lock.Release();
        }
    }

    private async Task PublishAsync<T>(string routingKey, T payload, CancellationToken cancellationToken)
    {
        var body = Encoding.UTF8.GetBytes(JsonSerializer.Serialize(payload));
        var props = new BasicProperties { Persistent = true, ContentType = "application/json" };

        for (var attempt = 1; attempt <= MaxAttempts; attempt++)
        {
            try
            {
                var channel = await GetOrCreateChannelAsync(cancellationToken);
                await channel.BasicPublishAsync(
                    exchange: Exchange,
                    routingKey: routingKey,
                    mandatory: false,
                    basicProperties: props,
                    body: body,
                    cancellationToken: cancellationToken);
                return;
            }
            catch (Exception ex) when (attempt < MaxAttempts)
            {
                logger.LogWarning(ex, "Fallo al publicar '{RoutingKey}' en RabbitMQ (intento {Attempt}/{Max}). Reintentando…",
                    routingKey, attempt, MaxAttempts);
                _channel = null;
                await Task.Delay(TimeSpan.FromSeconds(Math.Pow(2, attempt - 1)), cancellationToken);
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "No se pudo publicar '{RoutingKey}' tras {Max} intentos. La notificación se pierde.",
                    routingKey, MaxAttempts);
                // No se lanza — la cita ya fue guardada; la notificación es best-effort.
            }
        }
    }

    public async ValueTask DisposeAsync()
    {
        if (_channel is not null) await _channel.DisposeAsync();
        _lock.Dispose();
    }
}
