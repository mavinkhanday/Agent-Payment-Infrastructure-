#!/bin/bash

# Health check script for all services
set -e

echo "🔍 Checking AI Cost Tracker services health..."

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to check service health
check_service() {
    local service_name=$1
    local url=$2
    local expected_status=${3:-200}
    
    echo -n "Checking $service_name... "
    
    if curl -f -s -o /dev/null -w "%{http_code}" "$url" | grep -q "$expected_status"; then
        echo -e "${GREEN}✅ Healthy${NC}"
        return 0
    else
        echo -e "${RED}❌ Unhealthy${NC}"
        return 1
    fi
}

# Function to check database connectivity
check_database() {
    echo -n "Checking database connection... "
    
    if pg_isready -h localhost -p 5432 -d ai_cost_tracker >/dev/null 2>&1; then
        echo -e "${GREEN}✅ Connected${NC}"
        return 0
    else
        echo -e "${RED}❌ Connection failed${NC}"
        return 1
    fi
}

# Function to check Redis connectivity
check_redis() {
    echo -n "Checking Redis connection... "
    
    if redis-cli -h localhost -p 6379 ping >/dev/null 2>&1; then
        echo -e "${GREEN}✅ Connected${NC}"
        return 0
    else
        echo -e "${YELLOW}⚠️ Redis not available (optional)${NC}"
        return 0
    fi
}

# Main health checks
health_status=0

# Check database
if ! check_database; then
    health_status=1
fi

# Check Redis
check_redis

# Check API health endpoint
if ! check_service "API Server" "http://localhost:3000/health"; then
    health_status=1
fi

# Check frontend
if ! check_service "Dashboard" "http://localhost:3001" "200"; then
    health_status=1
fi

# Summary
echo ""
if [ $health_status -eq 0 ]; then
    echo -e "${GREEN}🎉 All services are healthy!${NC}"
    echo ""
    echo "📍 Service URLs:"
    echo "   • API Server: http://localhost:3000"
    echo "   • Dashboard: http://localhost:3001"
    echo "   • Database: localhost:5432"
    echo "   • Redis: localhost:6379"
else
    echo -e "${RED}❌ Some services are unhealthy${NC}"
    echo ""
    echo "🔧 Troubleshooting:"
    echo "   • Check container logs: docker-compose logs -f"
    echo "   • Verify environment variables in .env"
    echo "   • Ensure ports are not in use by other services"
fi

exit $health_status