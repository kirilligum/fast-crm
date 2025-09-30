# Manual API Testing Reference

> **For complete setup and usage guide, see the [main README.md](../README.md). This file contains specific test cases and curl commands.**

## Test Cases

### TEST 1: ADD_LEAD - General Inquiry

**Expected Category:** `ADD_LEAD`
**Expected Behavior:** Creates new lead in database, generates welcome email with platform overview and free trial CTA

```bash
curl -s -X POST -H "Content-Type: application/json" \
  -d '{"sender_email": "jenny@newstartup.com", "subject": "Following up from the Hackathon", "body": "Hi there! It was great meeting you at the hackathon yesterday. I am Jenny from NewStartup and I am really interested in learning more about what LiquidMetal AI does. Could you send me some information about your platform?"}' \
  "https://svc-01k6432yz0yhvw4qakgess7g1b.01k2trmrbsdx3erbaamwzzydy8.lmapp.run/api/v1/process_email" | jq
```

### TEST 2: QUALIFY_LEAD - Technical Feature Inquiry (New Lead)

**Expected Category:** `QUALIFY_LEAD`
**Expected Behavior:** Creates qualified lead, generates technical response with probing questions about their stack

```bash
curl -s -X POST -H "Content-Type: application/json" \
  -d '{"sender_email": "dev_dave@aistartup.io", "subject": "SmartMemory vs Actors for long-running agents", "body": "Hey! I am building a multi-agent system that needs persistent context between sessions. I have been using Redis for state but running into scaling issues. Can Raindrop help with this? Specifically interested in SmartMemory vs Actors for long-running agent state. What are the tradeoffs?"}' \
  "https://svc-01k6432yz0yhvw4qakgess7g1b.01k2trmrbsdx3erbaamwzzydy8.lmapp.run/api/v1/process_email" | jq
```

### TEST 3: QUALIFY_LEAD - Existing Lead Update

**Expected Category:** `QUALIFY_LEAD`
**Expected Behavior:** Updates existing lead to qualified status, generates detailed technical response about SmartSQL capabilities

```bash
curl -s -X POST -H "Content-Type: application/json" \
  -d '{"sender_email": "cto_carla@healthtech.com", "subject": "SmartSQL capabilities and PII", "body": "Following up from the demo yesterday. Our HealthTech app handles sensitive patient data. Can SmartSQL help with PII detection and compliance? We need to be HIPAA compliant."}' \
  "https://svc-01k6432yz0yhvw4qakgess7g1b.01k2trmrbsdx3erbaamwzzydy8.lmapp.run/api/v1/process_email" | jq
```

### TEST 4: IRRELEVANT - Spam Email

**Expected Category:** `IRRELEVANT`
**Expected Behavior:** No database action, no email response generated

```bash
curl -s -X POST -H "Content-Type: application/json" \
  -d '{"sender_email": "marketing@spam.com", "subject": "Boost your SEO today!", "body": "Amazing SEO services! Get to page 1 of Google fast!"}' \
  "https://svc-01k6432yz0yhvw4qakgess7g1b.01k2trmrbsdx3erbaamwzzydy8.lmapp.run/api/v1/process_email" | jq
```

## Expected Response Format

Each successful request returns a JSON object with this structure:

```json
{
  "status": "processed",
  "category": "ADD_LEAD|QUALIFY_LEAD|IRRELEVANT|AMBIGUOUS",
  "sender_email": "user@example.com",
  "db_action": "INSERT INTO leads|UPDATE leads|No action taken",
  "response_email": {
    "to": "user@example.com",
    "subject": "Re: Original Subject",
    "body": "Generated email response content..."
  },
  "requires_review": false
}
```

## Response Categories

- **ADD_LEAD**: General inquiries, basic interest in platform
- **QUALIFY_LEAD**: Technical questions, specific feature inquiries, concrete use cases
- **IRRELEVANT**: Spam, unrelated business inquiries
- **AMBIGUOUS**: Unclear intent, requires human review

## Database Actions

- **ADD_LEAD**: `INSERT INTO leads` - Creates new lead record
- **QUALIFY_LEAD**:
  - New email: `INSERT INTO leads` with qualified status
  - Existing email: `UPDATE leads SET status = 'Qualified'`
- **IRRELEVANT**: `No action taken`

## AI Model Configuration

The system currently uses **gpt-oss-120b** for both:
- Email categorization (Triage-Bot)
- Response generation (Response-Bot)

Configuration: `max_tokens: 1000`, `temperature: 0.1`

## Automated Testing

To run all tests automatically, use the provided test script:

```bash
./api_test.sh
```

## Troubleshooting

### Common Issues

1. **Invalid JSON format**: Ensure proper escaping of quotes in email body
2. **503 Service Unavailable**: AI model provider temporarily unavailable
3. **AMBIGUOUS categorization**: Email content unclear, system defaults to manual review

### Logs

Check application logs for detailed error information:

```bash
raindrop logs query --last 30m
```

### Success Metrics

- **Categorization Accuracy**: Should achieve 95%+ correct categorization
- **Response Quality**: Professional, contextual email responses
- **Database Integrity**: Proper lead creation and updates
- **Response Time**: Typically 200-800ms per request