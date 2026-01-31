#!/bin/bash
# Script to run integration tests with LocalStack
# Starts LocalStack, runs tests, then cleans up

set -e

echo "🚀 Starting LocalStack for integration tests..."

# Start LocalStack in background
docker run -d --name localstack-phase-mirror \
  -p 4566:4566 \
  -e SERVICES=ssm \
  localstack/localstack:latest

echo "⏳ Waiting for LocalStack to be ready..."
sleep 5

# Wait for LocalStack to be healthy
RETRIES=30
while [ $RETRIES -gt 0 ]; do
  if curl -s http://localhost:4566/_localstack/health | grep -q "ssm"; then
    echo "✅ LocalStack is ready!"
    break
  fi
  echo "  Waiting... ($RETRIES retries left)"
  sleep 2
  RETRIES=$((RETRIES - 1))
done

if [ $RETRIES -eq 0 ]; then
  echo "❌ LocalStack failed to start"
  docker stop localstack-phase-mirror 2>/dev/null || true
  docker rm localstack-phase-mirror 2>/dev/null || true
  exit 1
fi

echo "🧪 Running integration tests..."

# Run the integration tests
cd /home/runner/work/Phase-Mirror/Phase-Mirror/packages/mirror-dissonance
pnpm test -- nonce-rotation.integration.test.ts

TEST_EXIT_CODE=$?

echo "🧹 Cleaning up..."
docker stop localstack-phase-mirror
docker rm localstack-phase-mirror

if [ $TEST_EXIT_CODE -eq 0 ]; then
  echo "✅ All integration tests passed!"
else
  echo "❌ Integration tests failed with exit code $TEST_EXIT_CODE"
fi

exit $TEST_EXIT_CODE
