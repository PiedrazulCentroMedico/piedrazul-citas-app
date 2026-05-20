using System.Text;
using Piedrazul.Application.Abstractions.Infrastructure;
using Piedrazul.Application.Abstractions.Repositories;

namespace Piedrazul.Application;

public sealed class AppointmentQueryService(
    IAppointmentRepository appointmentRepository,
    IAppointmentPdfExporter pdfExporter,
    IAppointmentExcelExporter excelExporter) : IAppointmentQueryService
{
    private readonly IAppointmentRepository _appointments = appointmentRepository;
    private readonly IAppointmentPdfExporter _pdfExporter = pdfExporter;
    private readonly IAppointmentExcelExporter _excelExporter = excelExporter;

    public async Task<OperationResult<AppointmentListResponse>> GetAppointmentsByProviderAndDateAsync(Guid providerId, DateOnly date, CancellationToken cancellationToken = default)
    {
        var provider = await _appointments.GetActiveProviderAsync(providerId, cancellationToken);
        if (provider is null)
            return OperationResult<AppointmentListResponse>.NotFound("No se encontró el médico o terapista solicitado.");

        var appointmentEntities = await _appointments.GetAppointmentsByProviderAndDateAsync(providerId, date, cancellationToken);
        var appointments = appointmentEntities.Select(AppointmentMapper.ToResponse).ToList();
        var response = new AppointmentListResponse(provider.DisplayName, provider.Specialty, date, appointments.Count, appointments);
        return OperationResult<AppointmentListResponse>.Success(response);
    }

    public async Task<IReadOnlyList<AppointmentHistoryResponse>> GetAppointmentHistoryAsync(Guid appointmentId, CancellationToken cancellationToken = default)
    {
        var history = await _appointments.GetHistoryAsync(appointmentId, cancellationToken);
        return history.Select(x => new AppointmentHistoryResponse(
                x.AppointmentId,
                x.PreviousDate,
                x.PreviousStartTime.ToString("HH:mm"),
                x.PreviousEndTime.ToString("HH:mm"),
                x.NewDate,
                x.NewStartTime.ToString("HH:mm"),
                x.NewEndTime.ToString("HH:mm"),
                x.Reason,
                x.ChangedBy,
                x.ChangedAtUtc))
            .ToList();
    }

    public async Task<IReadOnlyList<AppointmentResponse>> GetAppointmentsByDocumentAsync(string documentNumber, CancellationToken cancellationToken = default)
    {
        var normalized = PatientInputValidator.Normalize(documentNumber);
        if (string.IsNullOrWhiteSpace(normalized))
            return Array.Empty<AppointmentResponse>();

        var items = await _appointments.GetAppointmentsByDocumentAsync(normalized, cancellationToken);
        return items.Select(AppointmentMapper.ToResponse).ToList();
    }

    public async Task<byte[]> ExportAppointmentsPdfAsync(Guid providerId, DateOnly date, CancellationToken cancellationToken = default)
    {
        var appointmentsResult = await GetAppointmentsByProviderAndDateAsync(providerId, date, cancellationToken);
        if (!appointmentsResult.Succeeded || appointmentsResult.Data is null)
            return Array.Empty<byte>();

        return _pdfExporter.Export(
            "Piedrazul - Centro Médico",
            appointmentsResult.Data.ProviderName,
            appointmentsResult.Data.Specialty,
            date,
            appointmentsResult.Data.Items);
    }

    public async Task<byte[]> ExportAppointmentsCsvAsync(Guid providerId, DateOnly date, CancellationToken cancellationToken = default)
    {
        var appointmentsResult = await GetAppointmentsByProviderAndDateAsync(providerId, date, cancellationToken);
        if (!appointmentsResult.Succeeded || appointmentsResult.Data is null)
            return Array.Empty<byte>();

        var builder = new StringBuilder();
        builder.AppendLine("Hora,Paciente,Documento,Teléfono,Canal,Estado,Observaciones");

        foreach (var appointment in appointmentsResult.Data.Items)
        {
            var line = string.Join(',', new[]
            {
                EscapeCsv(appointment.StartTime),
                EscapeCsv(appointment.PatientFullName),
                EscapeCsv(appointment.DocumentNumber),
                EscapeCsv(appointment.Phone),
                EscapeCsv(appointment.Channel),
                EscapeCsv(appointment.Status),
                EscapeCsv(appointment.Notes ?? string.Empty)
            });
            builder.AppendLine(line);
        }

        var encoding = new UTF8Encoding(encoderShouldEmitUTF8Identifier: true);
        return encoding.GetBytes(builder.ToString());
    }

    public async Task<byte[]> ExportAppointmentsXlsxAsync(Guid providerId, DateOnly date, CancellationToken cancellationToken = default)
    {
        var appointmentsResult = await GetAppointmentsByProviderAndDateAsync(providerId, date, cancellationToken);
        if (!appointmentsResult.Succeeded || appointmentsResult.Data is null)
            return Array.Empty<byte>();

        return _excelExporter.Export(
            "Piedrazul - Centro Médico",
            appointmentsResult.Data.ProviderName,
            appointmentsResult.Data.Specialty,
            date,
            appointmentsResult.Data.Items);
    }

    private static string EscapeCsv(string value)
    {
        if (value.IndexOfAny(new[] { ',', '"', '\r', '\n' }) >= 0)
            return $"\"{value.Replace("\"", "\"\"")}\"";
        return value;
    }
}
