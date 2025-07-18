# Docker Port Conflict Solution for Evals

## Problem

The `pnpm evals` command runs Docker services for postgres (port 5432) and redis (port 6379) which conflict with other services running on the same ports.

## Solution

Update the environment configuration to use non-conflicting ports:

- Postgres: 5433 (instead of 5432)
- Redis: 6380 (instead of 6379)

## Implementation Plan

### 1. Environment File Updates

Update the following files to include port configuration:

**packages/evals/.env.development**

```
DATABASE_URL=postgres://postgres:password@localhost:5433/evals_development
EVALS_DB_PORT=5433
EVALS_REDIS_PORT=6380
```

**packages/evals/.env.test**

```
DATABASE_URL=postgres://postgres:password@localhost:5433/evals_test
EVALS_DB_PORT=5433
EVALS_REDIS_PORT=6380
```

### 2. Create .env.local Template

Create `packages/evals/.env.local.example` to document the configuration:

```
# Copy this file to .env.local and customize as needed
# These ports are used to avoid conflicts with other services

# Database configuration
EVALS_DB_PORT=5433
EVALS_REDIS_PORT=6380

# Optional: Override database URL if needed
# DATABASE_URL=postgres://postgres:password@localhost:5433/evals_development
```

### 3. Docker Compose Configuration

The existing docker-compose.yml already supports these environment variables:

- `${EVALS_DB_PORT:-5432}:5432` for postgres
- `${EVALS_REDIS_PORT:-6379}:6379` for redis

### 4. Documentation Updates

Update README.md to document the port configuration and how to avoid conflicts.

## Benefits

1. **No Port Conflicts**: Evals can run alongside other postgres/redis services
2. **Backward Compatible**: Default ports remain the same if environment variables aren't set
3. **Configurable**: Users can customize ports via environment variables
4. **Clear Documentation**: Users understand how to resolve conflicts

## Testing

After implementation:

1. Start existing postgres/redis services on default ports
2. Run `pnpm evals` to verify it uses the new ports
3. Confirm both services can run simultaneously
4. Test database connectivity with the new port configuration
