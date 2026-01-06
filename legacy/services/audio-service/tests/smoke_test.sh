#!/bin/bash

set -e

BASE_URL="${AUDIO_BACKEND_URL:-http://localhost:3000}"
TIMEOUT=30

echo "=========================================="
echo "Audio Ambience Service - Smoke Tests"
echo "=========================================="
echo "Base URL: $BASE_URL"
echo ""

GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color

TESTS_PASSED=0
TESTS_FAILED=0

test_endpoint() {
    local name=$1
    local method=$2
    local endpoint=$3
    local data=$4
    
    echo -n "Testing $name... "
    
    if [ "$method" = "GET" ]; then
        response=$(curl -s -w "\n%{http_code}" --max-time $TIMEOUT "$BASE_URL$endpoint")
    else
        response=$(curl -s -w "\n%{http_code}" -X $method --max-time $TIMEOUT \
            -H "Content-Type: application/json" \
            -d "$data" \
            "$BASE_URL$endpoint")
    fi
    
    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | head -n-1)
    
    if [ "$http_code" = "200" ] || [ "$http_code" = "201" ]; then
        echo -e "${GREEN}✓ PASS${NC} (HTTP $http_code)"
        TESTS_PASSED=$((TESTS_PASSED + 1))
        return 0
    else
        echo -e "${RED}✗ FAIL${NC} (HTTP $http_code)"
        echo "Response: $body"
        TESTS_FAILED=$((TESTS_FAILED + 1))
        return 1
    fi
}

echo "1. Health Check"
test_endpoint "GET /health" "GET" "/health"
echo ""

echo "2. Root Endpoint"
test_endpoint "GET /" "GET" "/"
echo ""

echo "3. AudioLDM2 Generation"
test_endpoint "POST /audio/audioldm2" "POST" "/audio/audioldm2" '{
  "prompt": "Ocean waves crashing on a beach",
  "duration": 5.0,
  "seed": 42
}'
echo ""

echo "4. Diff-Foley Generation (may be disabled)"
if test_endpoint "POST /audio/difffoley" "POST" "/audio/difffoley" '{
  "video_url": "https://example.com/video.mp4",
  "duration": 10.0
}'; then
    echo "Diff-Foley is enabled"
else
    echo "Note: Diff-Foley may be disabled (AUDIO_DIFFFOLEY=false)"
fi
echo ""

echo "5. CLAP Audio Selection"
test_endpoint "POST /audio/clap/select" "POST" "/audio/clap/select" '{
  "prompt": "Ocean waves and seagulls",
  "candidates": [
    {
      "url": "https://example.com/audio1.wav",
      "source": "difffoley"
    },
    {
      "url": "https://example.com/audio2.wav",
      "source": "audioldm2"
    }
  ]
}'
echo ""

echo "=========================================="
echo "Test Summary"
echo "=========================================="
echo -e "Passed: ${GREEN}$TESTS_PASSED${NC}"
echo -e "Failed: ${RED}$TESTS_FAILED${NC}"
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
    echo -e "${GREEN}All tests passed!${NC}"
    exit 0
else
    echo -e "${RED}Some tests failed.${NC}"
    exit 1
fi
