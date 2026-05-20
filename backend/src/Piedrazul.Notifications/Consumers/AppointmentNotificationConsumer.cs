using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Piedrazul.Notifications.Notifications;
using RabbitMQ.Client;
using RabbitMQ.Client.Events;

namespace Piedrazul.Notifications.Consumers;

public sealed class AppointmentNotificationConsumer : BackgroundService
{
    private const string Exchange     = "piedrazul";
    private const string DlxExchange  = "piedrazul.dlx";
    private const string Queue        = "notifications.appointments";
    private const string DlqQueue     = "notifications.appointments.dlq";

    private readonly ILogger<AppointmentNotificationConsumer> _logger;
    private readonly INotificationSender _sender;
    private readonly string _connectionString;
    private IConnection? _connection;
    private IChannel? _channel;

    public AppointmentNotificationConsumer(
        IConfiguration configuration,
        ILogger<AppointmentNotificationConsumer> logger,
        INotificationSender sender)
    {
        _logger = logger;
        _sender = sender;
        _connectionString = configuration.GetSection("RabbitMq").GetValue<string>("ConnectionString")
            ?? throw new InvalidOperationException("RabbitMq:ConnectionString is required.");
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var factory = new ConnectionFactory { Uri = new Uri(_connectionString) };
        _connection = await factory.CreateConnectionAsync(stoppingToken);
        _channel = await _connection.CreateChannelAsync(cancellationToken: stoppingToken);

        // Main exchange
        await _channel.ExchangeDeclareAsync(Exchange, ExchangeType.Topic, durable: true, autoDelete: false, cancellationToken: stoppingToken);

        // Dead letter exchange (direct)
        await _channel.ExchangeDeclareAsync(DlxExchange, ExchangeType.Direct, durable: true, autoDelete: false, cancellationToken: stoppingToken);

        // Dead letter queue
        await _channel.QueueDeclareAsync(DlqQueue, durable: true, exclusive: false, autoDelete: false, cancellationToken: stoppingToken);
        await _channel.QueueBindAsync(DlqQueue, DlxExchange, routingKey: Queue, cancellationToken: stoppingToken);

        // Main queue with DLX args
        var queueArgs = new Dictionary<string, object?> { { "x-dead-letter-exchange", DlxExchange }, { "x-dead-letter-routing-key", Queue } };
        await _channel.QueueDeclareAsync(Queue, durable: true, exclusive: false, autoDelete: false, arguments: queueArgs, cancellationToken: stoppingToken);
        await _channel.QueueBindAsync(Queue, Exchange, routingKey: "appointment.*", cancellationToken: stoppingToken);

        await _channel.BasicQosAsync(prefetchSize: 0, prefetchCount: 10, global: false, cancellationToken: stoppingToken);

        var consumer = new AsyncEventingBasicConsumer(_channel);
        consumer.ReceivedAsync += OnMessageReceivedAsync;

        await _channel.BasicConsumeAsync(Queue, autoAck: false, consumer: consumer, cancellationToken: stoppingToken);

        _logger.LogInformation("AppointmentNotificationConsumer started. DLQ: '{DlqQueue}'", DlqQueue);

        try { await Task.Delay(Timeout.Infinite, stoppingToken); }
        catch (OperationCanceledException) { }
    }

    private async Task OnMessageReceivedAsync(object sender, BasicDeliverEventArgs ea)
    {
        try
        {
            var json = Encoding.UTF8.GetString(ea.Body.ToArray());
            _logger.LogInformation("[{RoutingKey}] {Payload}", ea.RoutingKey, json);

            using var doc = JsonDocument.Parse(json);
            var root = doc.RootElement;

            if (ea.RoutingKey == "appointment.created")
            {
                var id       = root.GetProperty("Id").GetGuid();
                var date     = DateOnly.Parse(root.GetProperty("AppointmentDate").GetString()!);
                var start    = root.GetProperty("StartTime").GetString()!;
                var patient  = root.GetProperty("PatientProfileId").GetGuid();
                var provider = root.GetProperty("ProviderId").GetGuid();
                await _sender.SendAppointmentCreatedAsync(id, date, start, patient, provider);
            }
            else if (ea.RoutingKey == "appointment.status")
            {
                var id      = root.GetProperty("Id").GetGuid();
                var status  = root.GetProperty("Status").GetString()!;
                var date    = DateOnly.Parse(root.GetProperty("AppointmentDate").GetString()!);
                var start   = root.GetProperty("StartTime").GetString()!;
                var patient = root.GetProperty("PatientProfileId").GetGuid();
                await _sender.SendAppointmentStatusChangedAsync(id, status, date, start, patient);
            }

            if (_channel is not null)
                await _channel.BasicAckAsync(ea.DeliveryTag, multiple: false);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error processing message [{RoutingKey}] — routing to DLQ", ea.RoutingKey);
            // NACK without requeue → message goes to DLX → DLQ
            if (_channel is not null)
                await _channel.BasicNackAsync(ea.DeliveryTag, multiple: false, requeue: false);
        }
    }

    public override async Task StopAsync(CancellationToken cancellationToken)
    {
        await base.StopAsync(cancellationToken);
        if (_channel is not null) await _channel.DisposeAsync();
        if (_connection is not null) await _connection.DisposeAsync();
    }
}
