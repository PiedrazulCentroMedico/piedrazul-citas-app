using OfficeOpenXml;
using OfficeOpenXml.Style;
using Piedrazul.Application;
using Piedrazul.Application.Abstractions.Infrastructure;
using System.Drawing;

namespace Piedrazul.Infrastructure.Services;

public sealed class AppointmentExcelExporter : IAppointmentExcelExporter
{
    static AppointmentExcelExporter()
    {
        ExcelPackage.LicenseContext = LicenseContext.NonCommercial;
    }

    public byte[] Export(string centerName, string providerName, string specialty, DateOnly date, IReadOnlyList<AppointmentResponse> appointments)
    {
        using var package = new ExcelPackage();
        var ws = package.Workbook.Worksheets.Add("Citas");

        // Header row 1 - title
        ws.Cells[1, 1].Value = $"{centerName} — {providerName} — {specialty} — {date:dd/MM/yyyy}";
        ws.Cells[1, 1, 1, 7].Merge = true;
        ws.Cells[1, 1].Style.Font.Bold = true;
        ws.Cells[1, 1].Style.Font.Size = 13;
        ws.Cells[1, 1].Style.HorizontalAlignment = ExcelHorizontalAlignment.Center;

        // Column headers row 2
        string[] headers = ["Hora", "Paciente", "Documento", "Teléfono", "Canal", "Estado", "Observaciones"];
        for (int i = 0; i < headers.Length; i++)
        {
            var cell = ws.Cells[2, i + 1];
            cell.Value = headers[i];
            cell.Style.Font.Bold = true;
            cell.Style.Fill.PatternType = ExcelFillStyle.Solid;
            cell.Style.Fill.BackgroundColor.SetColor(Color.FromArgb(52, 73, 94));
            cell.Style.Font.Color.SetColor(Color.White);
            cell.Style.HorizontalAlignment = ExcelHorizontalAlignment.Center;
        }

        // Data rows
        for (int row = 0; row < appointments.Count; row++)
        {
            var apt = appointments[row];
            int excelRow = row + 3;
            ws.Cells[excelRow, 1].Value = apt.StartTime;
            ws.Cells[excelRow, 2].Value = apt.PatientFullName;
            ws.Cells[excelRow, 3].Value = apt.DocumentNumber;
            ws.Cells[excelRow, 4].Value = apt.Phone;
            ws.Cells[excelRow, 5].Value = apt.Channel;
            ws.Cells[excelRow, 6].Value = apt.Status;
            ws.Cells[excelRow, 7].Value = apt.Notes ?? string.Empty;

            if (row % 2 == 1)
            {
                ws.Cells[excelRow, 1, excelRow, 7].Style.Fill.PatternType = ExcelFillStyle.Solid;
                ws.Cells[excelRow, 1, excelRow, 7].Style.Fill.BackgroundColor.SetColor(Color.FromArgb(245, 245, 245));
            }
        }

        ws.Cells[ws.Dimension.Address].AutoFitColumns();
        ws.Column(2).Width = Math.Max(ws.Column(2).Width, 25);

        return package.GetAsByteArray();
    }
}
