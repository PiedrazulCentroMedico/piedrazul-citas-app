using Microsoft.EntityFrameworkCore;
using Piedrazul.Application.Abstractions.Repositories;
using Piedrazul.Domain;

namespace Piedrazul.Infrastructure.Persistence.Repositories;

public sealed class PatientRepository(AppDbContext dbContext) : IPatientRepository
{
    private readonly AppDbContext _dbContext = dbContext;

    public async Task<PatientProfile?> GetByIdAsync(Guid patientId, CancellationToken cancellationToken = default)
    {
        return await _dbContext.PatientProfiles
            .FirstOrDefaultAsync(x => x.Id == patientId, cancellationToken);
    }

    public async Task<PatientProfile?> GetByExternalUserIdAsync(string externalUserId, CancellationToken cancellationToken = default)
    {
        return await _dbContext.PatientProfiles
            .FirstOrDefaultAsync(x => x.ExternalUserId == externalUserId, cancellationToken);
    }

    public async Task<PatientProfile?> GetByDocumentAsync(string documentNumber, CancellationToken cancellationToken = default)
    {
        return await _dbContext.PatientProfiles
            .FirstOrDefaultAsync(x => x.DocumentNumber == documentNumber, cancellationToken);
    }

    public async Task<IReadOnlyList<PatientProfile>> SearchByPrefixAsync(string term, int take, CancellationToken cancellationToken = default)
    {
        return await _dbContext.PatientProfiles
            .AsNoTracking()
            .Where(x => EF.Functions.ILike(x.DocumentNumber, $"{term}%")
                     || EF.Functions.ILike(x.FirstName, $"%{term}%")
                     || EF.Functions.ILike(x.LastName, $"%{term}%"))
            .OrderBy(x => x.DocumentNumber)
            .Take(take)
            .ToListAsync(cancellationToken);
    }

    public async Task<IReadOnlyList<PatientProfile>> SearchByTermAsync(string term, int take, CancellationToken cancellationToken = default)
    {
        return await _dbContext.PatientProfiles
            .AsNoTracking()
            .Where(x => EF.Functions.ILike(x.DocumentNumber, $"%{term}%")
                     || EF.Functions.ILike(x.FirstName, $"%{term}%")
                     || EF.Functions.ILike(x.LastName, $"%{term}%"))
            .OrderBy(x => x.FirstName)
            .ThenBy(x => x.LastName)
            .Take(take)
            .ToListAsync(cancellationToken);
    }

    public async Task AddAsync(PatientProfile patient, CancellationToken cancellationToken = default)
    {
        await _dbContext.PatientProfiles.AddAsync(patient, cancellationToken);
    }

    public Task SaveChangesAsync(CancellationToken cancellationToken = default)
    {
        return _dbContext.SaveChangesAsync(cancellationToken);
    }
}
