#!/bin/bash

# Development environment management script
set -e

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Function to show help
show_help() {
    echo "AI Cost Tracker Development Environment"
    echo ""
    echo "Usage: $0 [COMMAND]"
    echo ""
    echo "Commands:"
    echo "  start      Start all development services"
    echo "  stop       Stop all development services"
    echo "  restart    Restart all development services"
    echo "  build      Build all development containers"
    echo "  logs       Show logs from all services"
    echo "  status     Check the status of all services"
    echo "  clean      Stop and remove all containers, volumes, and images"
    echo "  shell      Open shell in API container"
    echo "  db         Open PostgreSQL shell"
    echo "  help       Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 start           # Start the development environment"
    echo "  $0 logs api        # Show logs for API service only"
    echo "  $0 shell           # Open shell in API container"
}

# Function to check if Docker is running
check_docker() {
    if ! docker info >/dev/null 2>&1; then
        echo -e "${RED}❌ Docker is not running. Please start Docker first.${NC}"
        exit 1
    fi
}

# Function to start development environment
start_dev() {
    echo -e "${BLUE}🚀 Starting AI Cost Tracker development environment...${NC}"
    
    # Create .env if it doesn't exist
    if [ ! -f .env ]; then
        echo -e "${YELLOW}📝 Creating .env file from template...${NC}"
        cp .env.example .env
        echo -e "${GREEN}✅ .env file created. Please review and update settings.${NC}"
    fi
    
    # Start services
    docker compose -f docker-compose.dev.yml up -d
    
    echo -e "${GREEN}✅ Development environment started!${NC}"
    echo ""
    echo -e "${BLUE}📍 Services available at:${NC}"
    echo "   • API Server: http://localhost:3000"
    echo "   • Dashboard: http://localhost:3001"
    echo "   • Database: localhost:5432"
    echo "   • Redis: localhost:6379"
    echo ""
    echo -e "${YELLOW}💡 Useful commands:${NC}"
    echo "   • View logs: $0 logs"
    echo "   • Check status: $0 status"
    echo "   • Open API shell: $0 shell"
    echo "   • Open database shell: $0 db"
}

# Function to stop development environment
stop_dev() {
    echo -e "${YELLOW}🛑 Stopping development environment...${NC}"
    docker compose -f docker-compose.dev.yml down
    echo -e "${GREEN}✅ Development environment stopped.${NC}"
}

# Function to restart development environment
restart_dev() {
    echo -e "${BLUE}🔄 Restarting development environment...${NC}"
    docker compose -f docker-compose.dev.yml restart
    echo -e "${GREEN}✅ Development environment restarted.${NC}"
}

# Function to build containers
build_dev() {
    echo -e "${BLUE}🔨 Building development containers...${NC}"
    docker compose -f docker-compose.dev.yml build --no-cache
    echo -e "${GREEN}✅ Containers built successfully.${NC}"
}

# Function to show logs
show_logs() {
    local service=${1:-""}
    if [ -n "$service" ]; then
        echo -e "${BLUE}📋 Showing logs for $service...${NC}"
        docker compose -f docker-compose.dev.yml logs -f "$service"
    else
        echo -e "${BLUE}📋 Showing logs for all services...${NC}"
        docker compose -f docker-compose.dev.yml logs -f
    fi
}

# Function to check status
check_status() {
    echo -e "${BLUE}📊 Development environment status:${NC}"
    echo ""
    docker compose -f docker-compose.dev.yml ps
    echo ""
    
    # Run health check if available
    if [ -f "./scripts/health-check.sh" ]; then
        ./scripts/health-check.sh
    fi
}

# Function to clean up everything
clean_dev() {
    echo -e "${RED}🧹 This will remove all containers, volumes, and images. Are you sure? (y/N)${NC}"
    read -r response
    if [[ "$response" =~ ^([yY][eE][sS]|[yY])$ ]]; then
        echo -e "${YELLOW}🧹 Cleaning up development environment...${NC}"
        
        # Stop and remove containers
        docker compose -f docker-compose.dev.yml down -v --remove-orphans
        
        # Remove images
        docker images | grep ai-cost-tracker | awk '{print $3}' | xargs -r docker rmi -f
        
        # Clean up unused Docker resources
        docker system prune -f
        
        echo -e "${GREEN}✅ Clean up completed.${NC}"
    else
        echo "Clean up cancelled."
    fi
}

# Function to open shell in API container
open_shell() {
    echo -e "${BLUE}🐚 Opening shell in API container...${NC}"
    docker compose -f docker-compose.dev.yml exec api sh
}

# Function to open database shell
open_db_shell() {
    echo -e "${BLUE}🗄️ Opening PostgreSQL shell...${NC}"
    docker compose -f docker-compose.dev.yml exec database psql -U postgres -d ai_cost_tracker
}

# Main script logic
check_docker

case "${1:-help}" in
    "start")
        start_dev
        ;;
    "stop")
        stop_dev
        ;;
    "restart")
        restart_dev
        ;;
    "build")
        build_dev
        ;;
    "logs")
        show_logs "$2"
        ;;
    "status")
        check_status
        ;;
    "clean")
        clean_dev
        ;;
    "shell")
        open_shell
        ;;
    "db")
        open_db_shell
        ;;
    "help"|"-h"|"--help")
        show_help
        ;;
    *)
        echo -e "${RED}❌ Unknown command: $1${NC}"
        echo ""
        show_help
        exit 1
        ;;
esac