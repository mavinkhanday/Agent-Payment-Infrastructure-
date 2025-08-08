#!/bin/bash

# Build all components script
set -e

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}🔨 Building all AI Cost Tracker components...${NC}"
echo ""

# Function to run build with error handling
run_build() {
    local component=$1
    local build_cmd=$2
    local dir=${3:-.}
    
    echo -e "${YELLOW}📦 Building $component...${NC}"
    
    if [ "$dir" != "." ]; then
        cd "$dir"
    fi
    
    if eval "$build_cmd"; then
        echo -e "${GREEN}✅ $component build completed${NC}"
    else
        echo -e "${RED}❌ $component build failed${NC}"
        exit 1
    fi
    
    if [ "$dir" != "." ]; then
        cd - > /dev/null
    fi
    
    echo ""
}

# Check if Docker is available
if command -v docker &> /dev/null; then
    echo -e "${BLUE}🐳 Building Docker containers...${NC}"
    echo ""
    
    # Build production container
    run_build "Production Container" "docker build -t ai-cost-tracker:latest ."
    
    # Build development containers
    run_build "Development API Container" "docker build -f Dockerfile.dev -t ai-cost-tracker-api:dev ."
    run_build "Development Dashboard Container" "docker build -f dashboard/Dockerfile.dev -t ai-cost-tracker-dashboard:dev ./dashboard"
    run_build "Development SDK Container" "docker build -f sdk/Dockerfile.dev -t ai-cost-tracker-sdk:dev ./sdk"
    
    echo -e "${GREEN}🐳 All Docker containers built successfully!${NC}"
    echo ""
else
    echo -e "${YELLOW}⚠️ Docker not found, skipping container builds${NC}"
    echo ""
fi

# Check if Node.js is available for local builds
if command -v npm &> /dev/null; then
    echo -e "${BLUE}📦 Building Node.js components locally...${NC}"
    echo ""
    
    # Build SDK
    if [ -d "sdk" ]; then
        run_build "SDK (TypeScript)" "npm ci && npm run build" "sdk"
    fi
    
    # Build Dashboard
    if [ -d "dashboard" ]; then
        run_build "Dashboard (React)" "npm ci && npm run build" "dashboard"
    fi
    
    # Install backend dependencies
    if [ -f "package.json" ]; then
        run_build "Backend Dependencies" "npm ci"
    fi
    
    echo -e "${GREEN}📦 All Node.js components built successfully!${NC}"
    echo ""
else
    echo -e "${YELLOW}⚠️ Node.js/npm not found, skipping local builds${NC}"
    echo ""
fi

echo -e "${GREEN}🎉 All builds completed successfully!${NC}"
echo ""
echo -e "${BLUE}📍 Available build artifacts:${NC}"

# List Docker images
if command -v docker &> /dev/null; then
    echo "   Docker Images:"
    docker images | grep ai-cost-tracker | while read -r line; do
        echo "   • $line"
    done
    echo ""
fi

# List built directories
echo "   Built Directories:"
[ -d "sdk/dist" ] && echo "   • SDK: sdk/dist/"
[ -d "dashboard/dist" ] && echo "   • Dashboard: dashboard/dist/"
[ -d "node_modules" ] && echo "   • Backend: node_modules/"
echo ""

echo -e "${YELLOW}💡 Next steps:${NC}"
echo "   • For development: ./scripts/dev.sh start"
echo "   • For production: docker-compose up -d"
echo "   • Run tests: ./scripts/test-all.sh"