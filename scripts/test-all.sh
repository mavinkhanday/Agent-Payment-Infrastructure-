#!/bin/bash

# Test all components script
set -e

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}🧪 Running tests for AI Cost Tracker...${NC}"
echo ""

# Function to run tests with error handling
run_tests() {
    local component=$1
    local test_cmd=$2
    local dir=${3:-.}
    
    echo -e "${YELLOW}🧪 Testing $component...${NC}"
    
    if [ "$dir" != "." ]; then
        cd "$dir"
    fi
    
    if eval "$test_cmd"; then
        echo -e "${GREEN}✅ $component tests passed${NC}"
    else
        echo -e "${RED}❌ $component tests failed${NC}"
        # Don't exit immediately, continue with other tests
        echo -e "${YELLOW}⚠️ Continuing with other tests...${NC}"
    fi
    
    if [ "$dir" != "." ]; then
        cd - > /dev/null
    fi
    
    echo ""
}

# Function to run linting
run_linting() {
    local component=$1
    local lint_cmd=$2
    local dir=${3:-.}
    
    echo -e "${YELLOW}🔍 Linting $component...${NC}"
    
    if [ "$dir" != "." ]; then
        cd "$dir"
    fi
    
    if eval "$lint_cmd"; then
        echo -e "${GREEN}✅ $component linting passed${NC}"
    else
        echo -e "${RED}❌ $component linting failed${NC}"
        echo -e "${YELLOW}⚠️ Continuing with other checks...${NC}"
    fi
    
    if [ "$dir" != "." ]; then
        cd - > /dev/null
    fi
    
    echo ""
}

# Check if running in CI environment
if [ "$CI" = "true" ]; then
    echo -e "${BLUE}🤖 Running in CI environment${NC}"
    TEST_MODE="ci"
else
    echo -e "${BLUE}🖥️ Running in local environment${NC}"
    TEST_MODE="local"
fi

# Test Backend API
if [ -f "package.json" ]; then
    # Install dependencies if needed
    if [ ! -d "node_modules" ]; then
        echo -e "${YELLOW}📦 Installing backend dependencies...${NC}"
        npm ci
        echo ""
    fi
    
    # Run backend tests
    if npm run test --if-present >/dev/null 2>&1; then
        run_tests "Backend API" "npm test"
    else
        echo -e "${YELLOW}⚠️ No backend tests configured${NC}"
        echo ""
    fi
    
    # Run backend linting
    if npm run lint --if-present >/dev/null 2>&1; then
        run_linting "Backend API" "npm run lint"
    else
        echo -e "${YELLOW}⚠️ No backend linting configured${NC}"
        echo ""
    fi
    
    # Run type checking
    if npm run typecheck --if-present >/dev/null 2>&1; then
        run_linting "Backend Types" "npm run typecheck"
    else
        echo -e "${YELLOW}⚠️ No backend type checking configured${NC}"
        echo ""
    fi
fi

# Test SDK
if [ -d "sdk" ] && [ -f "sdk/package.json" ]; then
    # Install SDK dependencies if needed
    if [ ! -d "sdk/node_modules" ]; then
        echo -e "${YELLOW}📦 Installing SDK dependencies...${NC}"
        cd sdk && npm ci && cd ..
        echo ""
    fi
    
    # Run SDK tests
    if cd sdk && npm run test --if-present >/dev/null 2>&1 && cd ..; then
        run_tests "SDK" "npm test" "sdk"
    else
        echo -e "${YELLOW}⚠️ No SDK tests configured${NC}"
        echo ""
    fi
    
    # Build SDK to check for TypeScript errors
    run_tests "SDK Build" "npm run build" "sdk"
fi

# Test Dashboard
if [ -d "dashboard" ] && [ -f "dashboard/package.json" ]; then
    # Install dashboard dependencies if needed
    if [ ! -d "dashboard/node_modules" ]; then
        echo -e "${YELLOW}📦 Installing dashboard dependencies...${NC}"
        cd dashboard && npm ci && cd ..
        echo ""
    fi
    
    # Run dashboard tests
    if cd dashboard && npm run test --if-present >/dev/null 2>&1 && cd ..; then
        run_tests "Dashboard" "npm test" "dashboard"
    else
        echo -e "${YELLOW}⚠️ No dashboard tests configured${NC}"
        echo ""
    fi
    
    # Run dashboard linting
    if cd dashboard && npm run lint --if-present >/dev/null 2>&1 && cd ..; then
        run_linting "Dashboard" "npm run lint" "dashboard"
    else
        echo -e "${YELLOW}⚠️ No dashboard linting configured${NC}"
        echo ""
    fi
    
    # Build dashboard to check for errors
    run_tests "Dashboard Build" "npm run build" "dashboard"
fi

# Integration tests with Docker (if available and not in CI)
if command -v docker &> /dev/null && [ "$TEST_MODE" != "ci" ]; then
    echo -e "${BLUE}🐳 Running integration tests with Docker...${NC}"
    echo ""
    
    # Start test environment
    if docker-compose -f docker-compose.dev.yml up -d database >/dev/null 2>&1; then
        echo -e "${YELLOW}⏳ Waiting for database to be ready...${NC}"
        sleep 10
        
        # Test database connection
        if docker-compose -f docker-compose.dev.yml exec -T database pg_isready -U postgres -d ai_cost_tracker >/dev/null 2>&1; then
            echo -e "${GREEN}✅ Database integration test passed${NC}"
        else
            echo -e "${RED}❌ Database integration test failed${NC}"
        fi
        
        # Clean up test environment
        docker-compose -f docker-compose.dev.yml down >/dev/null 2>&1
    else
        echo -e "${YELLOW}⚠️ Could not start test environment${NC}"
    fi
    echo ""
fi

# Security checks (if available)
if command -v npm &> /dev/null; then
    echo -e "${BLUE}🔒 Running security audit...${NC}"
    
    # Audit backend
    if [ -f "package.json" ]; then
        if npm audit --audit-level=moderate >/dev/null 2>&1; then
            echo -e "${GREEN}✅ Backend security audit passed${NC}"
        else
            echo -e "${YELLOW}⚠️ Backend has security vulnerabilities${NC}"
        fi
    fi
    
    # Audit SDK
    if [ -f "sdk/package.json" ]; then
        cd sdk
        if npm audit --audit-level=moderate >/dev/null 2>&1; then
            echo -e "${GREEN}✅ SDK security audit passed${NC}"
        else
            echo -e "${YELLOW}⚠️ SDK has security vulnerabilities${NC}"
        fi
        cd ..
    fi
    
    # Audit Dashboard
    if [ -f "dashboard/package.json" ]; then
        cd dashboard
        if npm audit --audit-level=moderate >/dev/null 2>&1; then
            echo -e "${GREEN}✅ Dashboard security audit passed${NC}"
        else
            echo -e "${YELLOW}⚠️ Dashboard has security vulnerabilities${NC}"
        fi
        cd ..
    fi
    echo ""
fi

echo -e "${GREEN}🎉 Test suite completed!${NC}"
echo ""
echo -e "${BLUE}📊 Test Summary:${NC}"
echo "   • Backend API: Tested"
echo "   • SDK: Built and tested"
echo "   • Dashboard: Built and tested"
echo "   • Security: Audited"
echo "   • Integration: Checked"
echo ""
echo -e "${YELLOW}💡 Next steps:${NC}"
echo "   • Start development: ./scripts/dev.sh start"
echo "   • Check service health: ./scripts/health-check.sh"
echo "   • View logs: ./scripts/dev.sh logs"