# Nonce CLI Commands

The Phase Mirror CLI provides comprehensive commands for managing cryptographic nonce bindings tied to verified organizational identities.

## Overview

The `nonce` command group allows you to:
- Generate and bind nonces to verified organizations
- Validate nonce bindings
- Rotate nonces for security or key updates
- Revoke nonces in case of security violations
- List and inspect nonce bindings
- View rotation history

## Commands

### `oracle nonce generate`

Generate and bind a new nonce for a verified organization.

```bash
oracle nonce generate --org-id <orgId> --public-key <key>
```

### `oracle nonce validate`

Validate that a nonce is properly bound to an organization.

```bash
oracle nonce validate --org-id <orgId> --nonce <nonce> [--verbose]
```

### `oracle nonce rotate`

Rotate nonce for an organization (creates new nonce, revokes old one).

```bash
oracle nonce rotate --org-id <orgId> --public-key <key> --reason <reason>
```

### `oracle nonce revoke`

Revoke a nonce binding (e.g., due to security violation).

```bash
oracle nonce revoke --org-id <orgId> --reason <reason>
```

### `oracle nonce list`

List nonce bindings.

```bash
oracle nonce list [--org-id <orgId>] [--show-revoked]
```

### `oracle nonce history`

Show rotation history for an organization.

```bash
oracle nonce history --org-id <orgId>
```

## Example Workflow

```bash
# 1. Generate initial nonce
oracle nonce generate --org-id my-org --public-key my-pubkey

# 2. Validate the nonce
oracle nonce validate --org-id my-org --nonce <generated-nonce> --verbose

# 3. Later: Rotate nonce
oracle nonce rotate --org-id my-org --public-key new-key --reason "Quarterly rotation"

# 4. View rotation history
oracle nonce history --org-id my-org

# 5. List all bindings
oracle nonce list
```

## Environment Variables

- `PHASE_MIRROR_DATA_DIR` - Directory for storing nonce bindings (default: `.phase-mirror-data`)

## See Also

- [Nonce Binding Service Documentation](../../mirror-dissonance/src/trust/identity/NONCE_BINDING.md)
- [CLI Reference](../README.md)
