#!/bin/bash

# Fast-CRM API Endpoint Testing Script
# Tests all 4 scenarios from the PRD: ADD_LEAD, QUALIFY_LEAD (new), QUALIFY_LEAD (update), IRRELEVANT

set -e

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Deployment endpoint
CRM_ENDPOINT="https://svc-01k6432yz0yhvw4qakgess7g1b.01k2trmrbsdx3erbaamwzzydy8.lmapp.run"
API_URL="${CRM_ENDPOINT}/api/v1/process_email"

# Test counter
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0

echo -e "${BLUE}=== Fast-CRM API Endpoint Testing ===${NC}"
echo "Testing endpoint: $API_URL"
echo ""

# Function to run a test
run_test() {
    local test_name="$1"
    local test_data="$2"
    local expected_action="$3"

    echo -e "${YELLOW}Running Test: $test_name${NC}"
    echo "Expected Action: $expected_action"
    echo ""

    TOTAL_TESTS=$((TOTAL_TESTS + 1))

    # Make the API call
    response=$(curl -s -w "\nHTTP_STATUS:%{http_code}" \
        -X POST \
        -H "Content-Type: application/json" \
        -H "Accept: application/json" \
        -H "Origin: https://test.example.com" \
        -d "$test_data" \
        "$API_URL")

    # Extract HTTP status and response body
    http_status=$(echo "$response" | grep "HTTP_STATUS:" | cut -d: -f2)
    response_body=$(echo "$response" | sed '/HTTP_STATUS:/d')

    echo "HTTP Status: $http_status"
    echo "Response Body:"
    echo "$response_body" | jq . 2>/dev/null || echo "$response_body"
    echo ""

    # Validate response
    if [ "$http_status" = "200" ]; then
        # Check if response contains expected action
        if echo "$response_body" | grep -q "\"category\".*\"$expected_action\""; then
            echo -e "${GREEN}✓ PASSED: Correct action returned${NC}"
            PASSED_TESTS=$((PASSED_TESTS + 1))
        else
            echo -e "${RED}✗ FAILED: Expected action '$expected_action' not found in response${NC}"
            FAILED_TESTS=$((FAILED_TESTS + 1))
        fi
    else
        echo -e "${RED}✗ FAILED: HTTP status $http_status (expected 200)${NC}"
        FAILED_TESTS=$((FAILED_TESTS + 1))
    fi

    echo "----------------------------------------"
    echo ""
}

# Test 1: ADD_LEAD - General inquiry (should insert new lead)
echo -e "${BLUE}TEST 1: ADD_LEAD - General Inquiry${NC}"
test1_data='{
    "sender_email": "jenny@newstartup.com",
    "subject": "Following up from the Hackathon",
    "body": "Hi LiquidMetal team,\n\nIt was great seeing your booth. I am curious about the Raindrop platform. Can you send me some general information on how it works and what your pricing structure looks like?\n\nThanks,\nJenny"
}'

run_test "ADD_LEAD - General Inquiry" "$test1_data" "ADD_LEAD"

# Test 2: QUALIFY_LEAD - Technical feature inquiry (new lead)
echo -e "${BLUE}TEST 2: QUALIFY_LEAD - Technical Feature Inquiry (New Lead)${NC}"
test2_data='{
    "sender_email": "dev_dave@aistartup.io",
    "subject": "SmartMemory vs Actors for long-running agents",
    "body": "Hello,\n\nI am evaluating platforms for a multi-agent system. I need persistent context across sessions. Should I be using Actors for state management, or is SmartMemory sufficient for maintaining long-term episodic memory? We are currently using Redis but it is not scaling well.\n\n-Dave"
}'

run_test "QUALIFY_LEAD - Technical Feature Inquiry" "$test2_data" "QUALIFY_LEAD"

# Test 3: QUALIFY_LEAD - Existing lead update
echo -e "${BLUE}TEST 3: QUALIFY_LEAD - Existing Lead Update${NC}"
test3_data='{
    "sender_email": "cto_carla@healthtech.com",
    "subject": "SmartSQL capabilities and PII",
    "body": "Hi,\n\nFollowing up on the demo. We are working in HealthTech and have significant PII concerns with our existing SQL database. Can SmartSQL interface with it, and does its automatic PII detection help with compliance?\n\nCarla"
}'

run_test "QUALIFY_LEAD - Existing Lead Update" "$test3_data" "QUALIFY_LEAD"

# Test 4: IRRELEVANT - Spam email
echo -e "${BLUE}TEST 4: IRRELEVANT - Spam Email${NC}"
test4_data='{
    "sender_email": "marketing@spam.com",
    "subject": "Boost your SEO today!",
    "body": "Dear website owner, we can guarantee first page results on Google..."
}'

run_test "IRRELEVANT - Spam Email" "$test4_data" "IRRELEVANT"

# Test Summary
echo -e "${BLUE}=== TEST SUMMARY ===${NC}"
echo "Total Tests: $TOTAL_TESTS"
echo -e "Passed: ${GREEN}$PASSED_TESTS${NC}"
echo -e "Failed: ${RED}$FAILED_TESTS${NC}"

SUCCESS_RATE=$(echo "scale=1; $PASSED_TESTS * 100 / $TOTAL_TESTS" | bc -l)
echo "Success Rate: $SUCCESS_RATE%"
echo ""

if [ $FAILED_TESTS -eq 0 ]; then
    echo -e "${GREEN}🎉 ALL TESTS PASSED! The Fast-CRM API is working correctly.${NC}"
    exit 0
else
    echo -e "${RED}⚠️  Some tests failed. Please review the results above.${NC}"
    exit 1
fi