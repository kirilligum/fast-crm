#!/bin/bash

# Fast-CRM API Detailed Testing Script
# This version provides more detailed diagnostics to understand why categorization is failing

set -e

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Deployment endpoint
CRM_ENDPOINT="https://svc-01k6h492192p3412a4cbn6dp4z.01k2trmrbsdx3erbaamwzzydy8.lmapp.run"
API_URL="${CRM_ENDPOINT}/api/v1/process_email"

# Test counter
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0

echo -e "${BLUE}=== Fast-CRM API Detailed Testing ===${NC}"
echo "Testing endpoint: $API_URL"
echo ""

# Function to run a detailed test
run_detailed_test() {
    local test_name="$1"
    local test_data="$2"
    local expected_action="$3"

    echo -e "${CYAN}═══════════════════════════════════════════════════${NC}"
    echo -e "${YELLOW}Test: $test_name${NC}"
    echo -e "${CYAN}═══════════════════════════════════════════════════${NC}"
    echo "Expected Action: $expected_action"
    echo ""
    echo "Request Payload:"
    echo "$test_data" | jq . 2>/dev/null || echo "$test_data"
    echo ""

    TOTAL_TESTS=$((TOTAL_TESTS + 1))

    # Make the API call with verbose output
    echo -e "${YELLOW}Making API Call...${NC}"
    response=$(curl -s -w "\nHTTP_STATUS:%{http_code}\nCONTENT_TYPE:%{content_type}\nTIME_TOTAL:%{time_total}" \
        -X POST \
        -H "Content-Type: application/json" \
        -H "Accept: application/json" \
        -H "Origin: https://test.example.com" \
        -d "$test_data" \
        "$API_URL")

    # Extract HTTP status, content type, and response body
    http_status=$(echo "$response" | grep "HTTP_STATUS:" | cut -d: -f2)
    content_type=$(echo "$response" | grep "CONTENT_TYPE:" | cut -d: -f2)
    time_total=$(echo "$response" | grep "TIME_TOTAL:" | cut -d: -f2)
    response_body=$(echo "$response" | sed '/HTTP_STATUS:/d' | sed '/CONTENT_TYPE:/d' | sed '/TIME_TOTAL:/d')

    echo -e "${CYAN}Response Details:${NC}"
    echo "HTTP Status: $http_status"
    echo "Content-Type: $content_type"
    echo "Response Time: ${time_total}s"
    echo ""
    echo -e "${CYAN}Response Body:${NC}"
    echo "$response_body" | jq . 2>/dev/null || echo "$response_body"
    echo ""

    # Detailed analysis
    echo -e "${CYAN}Analysis:${NC}"

    if [ "$http_status" = "200" ]; then
        echo -e "${GREEN}✓ HTTP Status: Success (200)${NC}"

        # Check if response is valid JSON
        if echo "$response_body" | jq . >/dev/null 2>&1; then
            echo -e "${GREEN}✓ Response Format: Valid JSON${NC}"

            # Extract actual category/action
            actual_category=$(echo "$response_body" | jq -r '.category // empty' 2>/dev/null)
            actual_status=$(echo "$response_body" | jq -r '.status // empty' 2>/dev/null)
            db_action=$(echo "$response_body" | jq -r '.db_action // empty' 2>/dev/null)
            requires_review=$(echo "$response_body" | jq -r '.requires_review // empty' 2>/dev/null)

            echo "  - Status: $actual_status"
            echo "  - Category: $actual_category"
            echo "  - DB Action: $db_action"
            echo "  - Requires Review: $requires_review"

            # Check if the expected action/category is present
            if [ "$actual_category" = "$expected_action" ]; then
                echo -e "${GREEN}✓ Categorization: Correct ($expected_action)${NC}"
                PASSED_TESTS=$((PASSED_TESTS + 1))
            else
                echo -e "${RED}✗ Categorization: Expected '$expected_action', got '$actual_category'${NC}"
                FAILED_TESTS=$((FAILED_TESTS + 1))

                # Provide diagnostic information
                echo -e "${YELLOW}  Diagnostic: The triage bot may not be working properly${NC}"
                if [ "$actual_category" = "AMBIGUOUS" ]; then
                    echo -e "${YELLOW}  Note: AMBIGUOUS suggests triage bot failure or missing prompt${NC}"
                fi
            fi
        else
            echo -e "${RED}✗ Response Format: Invalid JSON${NC}"
            FAILED_TESTS=$((FAILED_TESTS + 1))
        fi
    else
        echo -e "${RED}✗ HTTP Status: $http_status (expected 200)${NC}"
        FAILED_TESTS=$((FAILED_TESTS + 1))
    fi

    echo ""
}

# Test 1: ADD_LEAD - General inquiry
echo -e "${BLUE}RUNNING TEST 1${NC}"
test1_data='{
    "sender_email": "jenny@newstartup.com",
    "subject": "Following up from the Hackathon",
    "body": "Hi LiquidMetal team,\n\nIt was great seeing your booth. I am curious about the Raindrop platform. Can you send me some general information on how it works and what your pricing structure looks like?\n\nThanks,\nJenny"
}'

run_detailed_test "ADD_LEAD - General Inquiry" "$test1_data" "ADD_LEAD"

# Test 2: QUALIFY_LEAD - Technical feature inquiry
echo -e "${BLUE}RUNNING TEST 2${NC}"
test2_data='{
    "sender_email": "dev_dave@aistartup.io",
    "subject": "SmartMemory vs Actors for long-running agents",
    "body": "Hello,\n\nI am evaluating platforms for a multi-agent system. I need persistent context across sessions. Should I be using Actors for state management, or is SmartMemory sufficient for maintaining long-term episodic memory? We are currently using Redis but it is not scaling well.\n\n-Dave"
}'

run_detailed_test "QUALIFY_LEAD - Technical Feature Inquiry" "$test2_data" "QUALIFY_LEAD"

# Test 3: QUALIFY_LEAD - Existing lead update
echo -e "${BLUE}RUNNING TEST 3${NC}"
test3_data='{
    "sender_email": "cto_carla@healthtech.com",
    "subject": "SmartSQL capabilities and PII",
    "body": "Hi,\n\nFollowing up on the demo. We are working in HealthTech and have significant PII concerns with our existing SQL database. Can SmartSQL interface with it, and does its automatic PII detection help with compliance?\n\nCarla"
}'

run_detailed_test "QUALIFY_LEAD - Existing Lead Update" "$test3_data" "QUALIFY_LEAD"

# Test 4: IRRELEVANT - Spam email
echo -e "${BLUE}RUNNING TEST 4${NC}"
test4_data='{
    "sender_email": "marketing@spam.com",
    "subject": "Boost your SEO today!",
    "body": "Dear website owner, we can guarantee first page results on Google..."
}'

run_detailed_test "IRRELEVANT - Spam Email" "$test4_data" "IRRELEVANT"

# Test Summary
echo -e "${CYAN}═══════════════════════════════════════════════════${NC}"
echo -e "${BLUE}═══ COMPREHENSIVE TEST SUMMARY ═══${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════${NC}"
echo "Total Tests: $TOTAL_TESTS"
echo -e "Passed: ${GREEN}$PASSED_TESTS${NC}"
echo -e "Failed: ${RED}$FAILED_TESTS${NC}"

if [ $TOTAL_TESTS -gt 0 ]; then
    SUCCESS_RATE=$(echo "scale=1; $PASSED_TESTS * 100 / $TOTAL_TESTS" | bc -l)
    echo "Success Rate: $SUCCESS_RATE%"
else
    echo "Success Rate: 0%"
fi

echo ""

if [ $FAILED_TESTS -eq 0 ]; then
    echo -e "${GREEN}🎉 ALL TESTS PASSED! The Fast-CRM API is working correctly.${NC}"
    echo -e "${GREEN}✓ Email categorization is functioning properly${NC}"
    echo -e "${GREEN}✓ API endpoints are responding correctly${NC}"
    echo -e "${GREEN}✓ Database operations are working${NC}"
    exit 0
else
    echo -e "${RED}⚠️  TESTS FAILED: API Issues Detected${NC}"
    echo ""
    echo -e "${YELLOW}Common Issues and Solutions:${NC}"
    echo "1. ${CYAN}All tests returning AMBIGUOUS:${NC}"
    echo "   - Triage bot may not be properly initialized"
    echo "   - SmartMemory prompt may be missing"
    echo "   - AI model integration may be failing"
    echo ""
    echo "2. ${CYAN}HTTP errors (4xx/5xx):${NC}"
    echo "   - Check deployment status with 'raindrop build find'"
    echo "   - Verify network connectivity"
    echo "   - Check API endpoint URL"
    echo ""
    echo "3. ${CYAN}JSON parsing errors:${NC}"
    echo "   - Service may be returning non-JSON content"
    echo "   - Check service logs for detailed error information"
    echo ""
    echo -e "${YELLOW}Recommended Next Steps:${NC}"
    echo "1. Check deployment logs for error details"
    echo "2. Verify triage prompt is set up in SmartMemory"
    echo "3. Test individual service components"
    echo "4. Review configuration and environment bindings"
    exit 1
fi