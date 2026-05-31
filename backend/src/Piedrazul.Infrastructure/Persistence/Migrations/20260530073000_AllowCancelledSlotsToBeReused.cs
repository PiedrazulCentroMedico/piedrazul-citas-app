using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Piedrazul.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AllowCancelledSlotsToBeReused : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_appointments_ProviderId_AppointmentDate_StartTime",
                table: "appointments");

            migrationBuilder.CreateIndex(
                name: "IX_appointments_ProviderId_AppointmentDate_StartTime",
                table: "appointments",
                columns: new[] { "ProviderId", "AppointmentDate", "StartTime" },
                unique: true,
                filter: "\"Status\" = 'Scheduled'");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_appointments_ProviderId_AppointmentDate_StartTime",
                table: "appointments");

            migrationBuilder.CreateIndex(
                name: "IX_appointments_ProviderId_AppointmentDate_StartTime",
                table: "appointments",
                columns: new[] { "ProviderId", "AppointmentDate", "StartTime" },
                unique: true);
        }
    }
}
