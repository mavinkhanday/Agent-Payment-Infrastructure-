#!/bin/bash

# AI Cost Tracker Setup Script
set -e

echo "🚀 Setting up AI Cost Tracker..."

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is required but not installed. Please install Docker first."
    exit 1
fi

# Check if Docker Compose is installed
if ! command -v docker-compose &> /dev/null; then
    echo "❌ Docker Compose is required but not installed. Please install Docker Compose first."
    exit 1
fi

# Create .env file if it doesn't exist
if [ ! -f .env ]; then
    echo "📝 Creating .env file..."
    cp .env.example .env
    
    # Generate a random JWT secret
    JWT_SECRET=$(openssl rand -base64 32 2>/dev/null || echo "change-this-in-production")
    sed -i.bak "s/your-super-secret-jwt-key-here/$JWT_SECRET/" .env
    rm -f .env.bak
    
    echo "✅ Created .env file with random JWT secret"
    echo "🔧 Please review and update the .env file with your settings"
fi

# Start the services
echo "🐳 Starting Docker containers..."
docker-compose up -d

# Wait for database to be ready
echo "⏳ Waiting for database to be ready..."
sleep 10

# Initialize database
echo "🗄️ Initializing database..."
docker-compose exec -T app node src/database/init.js

echo ""
echo "🎉 Setup completed successfully!"
echo ""
echo "📍 Services are now running:"
echo "   • API Server: http://localhost:3000"
echo "   • Dashboard: http://localhost:3000 (served by API)"
echo "   • Database: localhost:5432"
echo ""
echo "🔑 Next steps:"
echo "   1. Visit http://localhost:3000 to access the dashboard"
echo "   2. Create an account and get your API key"
echo "   3. Install the SDK: npm install ai-cost-tracker-sdk"
echo "   4. Check the README.md for integration examples"
echo ""
echo "📚 Useful commands:"
echo "   • View logs: docker-compose logs -f"
echo "   • Stop services: docker-compose down"
echo "   • Rebuild: docker-compose build --no-cache"
echo ""