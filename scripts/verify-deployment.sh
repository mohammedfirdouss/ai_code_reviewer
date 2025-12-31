#!/bin/bash

# Post-deployment verification script
echo "AI Code Reviewer - Post-deployment Verification"
echo "================================================="

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Get the worker URL
WORKER_URL=""
echo -n "Enter your deployed Worker URL (e.g., https://ai-code-reviewer.your-subdomain.workers.dev): "
read WORKER_URL

if [ -z "$WORKER_URL" ]; then
    echo -e "${RED}❌ Worker URL is required${NC}"
    exit 1
fi

# Remove trailing slash
WORKER_URL=$(echo $WORKER_URL | sed 's/\/$//')

echo ""
echo "Testing deployed Worker..."

# Test 1: Health check
echo -n "Testing health endpoint... "
health_response=$(curl -s -w "%{http_code}" "$WORKER_URL/health" -o /tmp/health_response.json)
if [ "$health_response" = "200" ]; then
    echo -e "${GREEN}Health check passed${NC}"
    echo "   Response: $(cat /tmp/health_response.json)"
else
    echo -e "${RED}Health check failed (HTTP $health_response)${NC}"
fi

# Test 2: CORS headers
echo -n "Testing CORS headers... "
cors_headers=$(curl -s -I "$WORKER_URL/health" | grep -i "access-control-allow-origin")
if [ ! -z "$cors_headers" ]; then
    echo -e "${GREEN}CORS headers present${NC}"
else
    echo -e "${RED}CORS headers missing${NC}"
fi

# Test 3: Agent endpoint
echo -n "Testing agent endpoint... "
agent_response=$(curl -s -w "%{http_code}" "$WORKER_URL/agent/status" -o /tmp/agent_response.json)
if [ "$agent_response" = "200" ]; then
    echo -e "${GREEN}Agent endpoint accessible${NC}"
else
    echo -e "${YELLOW}Agent endpoint returned HTTP $agent_response${NC}"
fi

# Test 4: Security headers
echo -n "Testing security headers... "
security_headers=$(curl -s -I "$WORKER_URL/health" | grep -E "(X-Content-Type-Options|X-Frame-Options|X-XSS-Protection)")
if [ ! -z "$security_headers" ]; then
    echo -e "${GREEN}✅ Security headers present${NC}"
else
    echo -e "${YELLOW}⚠️  Some security headers missing${NC}"
fi

echo ""
echo "📊 Summary:"
echo "- Worker URL: $WORKER_URL"
echo "- Health endpoint: $WORKER_URL/health"
echo "- WebSocket endpoint: ${WORKER_URL/https:/wss:}/agent"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo "1. Update your frontend to use the production Worker URL"
echo "2. Test WebSocket connections from your frontend"
echo "3. Monitor the Worker logs in Cloudflare dashboard"
echo "4. Set up custom domain (optional)"

# Cleanup
rm -f /tmp/health_response.json /tmp/agent_response.json