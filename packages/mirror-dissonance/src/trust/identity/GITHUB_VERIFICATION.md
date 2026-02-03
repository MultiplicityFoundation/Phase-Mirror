# GitHub Organization Verification

## Overview

The GitHub organization verification feature prevents Sybil attacks in Phase Mirror's Trust Module by verifying organizational identities through established GitHub organizations with verifiable history.

## Quick Start

```typescript
import { GitHubVerifier } from '@mirror-dissonance/core/trust/identity/github-verifier';

// Initialize verifier with GitHub token
const verifier = new GitHubVerifier(process.env.GITHUB_TOKEN);

// Verify an organization
const result = await verifier.verifyOrganization('org-123', 'acme-corp');

if (result.verified) {
  console.log('✅ Verification successful!');
  console.log('GitHub Org ID:', result.metadata.githubOrgId);
  console.log('Member Count:', result.metadata.memberCount);
  console.log('Public Repos:', result.metadata.publicRepoCount);
} else {
  console.log('❌ Verification failed:', result.reason);
}
```

## Anti-Sybil Heuristics

The verifier implements multiple heuristics to prevent Sybil attacks:

### Default Thresholds

| Criterion | Default | Rationale |
|-----------|---------|-----------|
| **Age** | ≥90 days | Prevents rapid creation of fake orgs |
| **Members** | ≥3 | Distinguishes real orgs from personal accounts |
| **Public Repos** | ≥1 | Demonstrates legitimate activity |
| **Recent Activity** | Within 180 days | Ensures org is actively maintained |

### Custom Configuration

You can customize thresholds based on your security requirements:

```typescript
const verifier = new GitHubVerifier(process.env.GITHUB_TOKEN, {
  minAgeDays: 180,                    // Require 6 months age
  minMemberCount: 5,                  // Require 5+ members
  minPublicRepos: 2,                  // Require 2+ public repos
  requireRecentActivityDays: 90,      // Require activity within 90 days
  allowPrivateOrgFallback: true,      // Allow private orgs if other criteria met
});
```

## Verification Process

1. **Fetch Organization**: Query GitHub API for org metadata
2. **Validate Age**: Check if org is old enough (default: ≥90 days)
3. **Validate Members**: Count org members (default: ≥3)
4. **Validate Repos**: Check public repository count (default: ≥1)
5. **Check Activity**: Verify recent activity if required (default: within 180 days)

## Result Structure

### Success Result

```typescript
{
  verified: true,
  method: 'github_org',
  reason: 'GitHub organization verified',
  verifiedAt: Date('2026-02-03T14:30:00.000Z'),
  metadata: {
    githubOrgId: 12345,
    githubOrgName: 'acme-corp',
    createdAt: Date('2020-01-15T10:00:00.000Z'),
    memberCount: 15,
    publicRepoCount: 42,
    hasRecentActivity: true,
    lastActivityDate: Date('2026-02-01T12:00:00.000Z')
  }
}
```

### Failure Result

```typescript
{
  verified: false,
  method: 'github_org',
  reason: 'Organization too new (45 days, minimum 90)',
  verifiedAt: undefined,
  metadata: {
    githubOrgId: -1,  // Sentinel value for failures
    githubOrgName: 'new-corp',
    createdAt: Date(0),
    memberCount: 0,
    publicRepoCount: 0,
    hasRecentActivity: false
  }
}
```

## Error Handling

The verifier throws `GitHubVerificationError` for API failures:

```typescript
try {
  const result = await verifier.verifyOrganization('org-123', 'test-org');
} catch (error) {
  if (error instanceof GitHubVerificationError) {
    switch (error.code) {
      case 'RATE_LIMIT':
        console.error('GitHub rate limit exceeded');
        break;
      case 'NOT_FOUND':
        console.error('Organization not found');
        break;
      case 'API_ERROR':
        console.error('GitHub API error');
        break;
      case 'INVALID_TOKEN':
        console.error('Invalid GitHub token');
        break;
    }
  }
}
```

## Rate Limit Management

GitHub API has a rate limit of 5,000 requests per hour for authenticated requests. Check your current rate limit status:

```typescript
const status = await verifier.getRateLimitStatus();

console.log('Limit:', status.limit);
console.log('Remaining:', status.remaining);
console.log('Resets at:', status.reset);
```

## Security Properties

### Sybil Resistance

- **Age requirement**: Prevents rapid creation of many fake orgs
- **Member requirement**: Makes mass fake orgs expensive (need real GitHub accounts)
- **Activity requirement**: Ensures orgs are actively maintained
- **GitHub org ID binding**: Prevents reuse after org deletion

### Privacy Preservation

- Verification happens before contribution submission
- GitHub metadata is stored separately from contribution data
- Only the org ID hash appears in the calibration network (k-anonymity preserved)

### One-to-One Binding

- Each GitHub organization can verify exactly one Phase Mirror org
- Each Phase Mirror org can be verified by exactly one GitHub org
- Prevents organization identity sharing

## Testing

Run the test suite to verify the implementation:

```bash
npm test -- github-verifier.test.ts
```

The test suite includes:
- 27 comprehensive unit tests
- Success cases for legitimate organizations
- Failure cases for insufficient criteria
- Edge cases for API errors and missing data

## Requirements

### GitHub Token

A GitHub Personal Access Token with the following scopes:
- `read:org` - Read organization data
- `read:user` - Read user data

Generate a token at: https://github.com/settings/tokens

### Environment Variable

```bash
export GITHUB_TOKEN=ghp_your_token_here
```

## Troubleshooting

### "Organization too new"
Wait until your GitHub org is at least 90 days old, or adjust the `minAgeDays` configuration.

### "Insufficient members"
Add more members to your GitHub organization. Members must have accepted their invitation.

### "No activity in last N days"
Create a commit, issue, or PR in a public repository. Activity in private repos does not count unless your org qualifies for the private org exemption.

### "GitHub organization not found"
- Check that the organization name is spelled correctly (case-sensitive)
- Verify the organization is public
- Ensure your GitHub token has `read:org` scope

### Rate Limit Exceeded
Wait for the rate limit to reset (shown in error message) or use a different GitHub token.

## Integration

The GitHub verifier integrates with the broader Trust Module:

```
Organization → GitHubVerifier → VerificationService → NonceBinding → IdentityStore
                     ↓
              TrustModule → ReputationEngine → ContributionWeighting
```

For integration examples, see:
- `trust/identity/verification-service.ts` (coming soon)
- `trust/adapters/local/identity-store.ts` (for storage)

## References

- [GitHub REST API - Organizations](https://docs.github.com/en/rest/orgs)
- [GitHub API Rate Limiting](https://docs.github.com/en/rest/overview/resources-in-the-rest-api#rate-limiting)
- [Phase Mirror Trust Module Architecture](../README.md)
