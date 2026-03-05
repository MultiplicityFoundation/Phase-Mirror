# Security Alerts — Resolution Status

> **All alerts resolved** on 2026-03-05 via dependency overrides and lockfile cleanup.
> Changes: removed stale `package-lock.json` files, added pnpm overrides, updated direct deps.

## fast-xml-parser (→ 5.4.2) ✅ RESOLVED

- [x] #28 Critical — entity encoding bypass via regex injection in DOCTYPE entity names
  - Was in: packages/mirror-dissonance/package-lock.json (deleted stale lockfile)
- [x] #27 High — DoS through entity expansion in DOCTYPE (no expansion limit)
  - Was in: packages/mirror-dissonance/package-lock.json (deleted stale lockfile)
- [x] #34 Low — stack overflow in XMLBuilder with preserveOrder (pnpm-lock.yaml)
- [x] #33 Low — stack overflow in XMLBuilder with preserveOrder (packages/mirror-dissonance/package-lock.json)

## minimatch (→ 9.0.5) ✅ RESOLVED

- [x] #18 High — ReDoS via repeated wildcards (pnpm-lock.yaml)
- [x] #17 High — ReDoS via repeated wildcards (pnpm-lock.yaml)
- [x] #32 High — matchOne() combinatorial backtracking (pnpm-lock.yaml)
- [x] #31 High — matchOne() combinatorial backtracking (pnpm-lock.yaml)
- [x] #26 High — matchOne() combinatorial backtracking (package-lock.json — deleted stale lockfile)
- [x] #24 High — matchOne() combinatorial backtracking (mirror-dissonance-pro/package-lock.json — deleted stale lockfile)
- [x] #30 High — nested *() extglobs catastrophic backtracking (pnpm-lock.yaml)
- [x] #29 High — nested *() extglobs catastrophic backtracking (pnpm-lock.yaml)

## hono (→ 4.12.5) ✅ RESOLVED

- [x] #36 High — arbitrary file access via serveStatic (pnpm-lock.yaml)
- [x] #35 Moderate — SSE Control Field Injection via CR/LF in writeSSE() (pnpm-lock.yaml)
- [x] #37 Moderate — Cookie Attribute Injection via unsanitized domain/path (pnpm-lock.yaml)
- [x] #12 Low — timing comparison hardening in basicAuth/bearerAuth (pnpm-lock.yaml)

## @hono/node-server (→ 1.19.11) ✅ RESOLVED

- [x] #38 High — authorization bypass for protected static paths via encoded slashes (pnpm-lock.yaml)

## @tootallnate/once (→ 3.0.1) ✅ RESOLVED

- [x] #40 Low — Incorrect Control Flow Scoping (pnpm-lock.yaml)
- [x] #39 Low — Incorrect Control Flow Scoping (packages/mirror-dissonance/package-lock.json)
