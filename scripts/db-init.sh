#!/bin/bash

# Database initialization script
set -e

echo "🗄️ Initializing AI Cost Tracker database..."

# Check if database environment variables are set
if [ -z "$DATABASE_URL" ] && [ -z "$DB_HOST" ]; then
    echo "❌ Database connection information not found"
    echo "Please set either DATABASE_URL or DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD"
    exit 1
fi

# Wait for database to be ready
echo "⏳ Waiting for database to be ready..."
if [ -n "$DATABASE_URL" ]; then
    # Extract connection info from DATABASE_URL
    DB_HOST=$(echo $DATABASE_URL | sed 's|postgresql://[^@]*@\([^:]*\):.*|\1|')
    DB_PORT=$(echo $DATABASE_URL | sed 's|postgresql://[^@]*@[^:]*:\([^/]*\)/.*|\1|')
    DB_NAME=$(echo $DATABASE_URL | sed 's|postgresql://[^@]*@[^/]*/\([^?]*\).*|\1|')
fi

# Default values
DB_HOST=${DB_HOST:-localhost}
DB_PORT=${DB_PORT:-5432}
DB_NAME=${DB_NAME:-ai_cost_tracker}

# Wait for PostgreSQL to be ready
for i in {1..30}; do
    if pg_isready -h "$DB_HOST" -p "$DB_PORT" -d "$DB_NAME" >/dev/null 2>&1; then
        echo "✅ Database is ready"
        break
    fi
    
    if [ $i -eq 30 ]; then
        echo "❌ Database is not ready after 30 attempts"
        exit 1
    fi
    
    echo "Waiting for database... (attempt $i/30)"
    sleep 2
done

# Run the Node.js initialization script
echo "🚀 Running database initialization..."
node src/database/init.js

echo "✅ Database initialization completed successfully!"