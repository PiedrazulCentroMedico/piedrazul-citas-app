namespace Piedrazul.Application;

/// <summary>
/// Se lanza cuando una operación de persistencia viola una restricción de unicidad en la base de datos.
/// Infrastructure la lanza; Application la captura para devolver un resultado de conflicto.
/// Esto mantiene la capa de Application sin dependencia directa de EF Core o Npgsql.
/// </summary>
public sealed class UniqueConstraintException : Exception
{
    public UniqueConstraintException() : base("Unique constraint violation.") { }
    public UniqueConstraintException(string message) : base(message) { }
}
