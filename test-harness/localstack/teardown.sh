#!/usr/bin/env bash
set -euo pipefail

echo "Tearing down LocalStack infrastructure..."

docker compose -f localstack-compose.yml down -v
rm -rf localstack-data

echo "✓ LocalStack infrastructure removed"
