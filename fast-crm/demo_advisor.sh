#!/bin/bash
echo "🚀 Fast-CRM Advisor RAG Demo"
echo "==============================="
echo ""
echo "📚 Testing Advisor Document Upload..."
echo ""

# Upload an advisor document
UPLOAD_RESPONSE=$(curl -s -X POST -H "Content-Type: application/json" \
  -d '{"title": "Expert Sales Guide by John Doe", "content": "Focus on building relationships with customers. Listen actively to their needs and pain points. Provide value-driven solutions that address specific business challenges. Always follow up promptly and maintain professional communication. Key strategies include understanding customer workflow, identifying decision makers, and presenting clear ROI benefits."}' \
  "https://svc-01k6h492192p3412a4cbn6dp4z.01k2trmrbsdx3erbaamwzzydy8.lmapp.run/api/v1/upload_advisor_document")

echo "✅ Document Upload Response:"
echo "$UPLOAD_RESPONSE" | jq '.'
echo ""

echo "📋 Fetching Advisor Documents..."
DOCS_RESPONSE=$(curl -s "https://svc-01k6h492192p3412a4cbn6dp4z.01k2trmrbsdx3erbaamwzzydy8.lmapp.run/api/v1/advisor_documents")

echo "✅ Documents List:"
echo "$DOCS_RESPONSE" | jq '.'
echo ""

echo "💬 Testing Email Processing with Advisor Context..."
EMAIL_RESPONSE=$(curl -s -X POST -H "Content-Type: application/json" \
  -d '{"sender_email": "ceo@startup.com", "subject": "Need help with sales strategy", "body": "Hi, we are a startup struggling with customer acquisition. We need advice on sales processes and building relationships with enterprise clients. Can you help?"}' \
  "https://svc-01k6h492192p3412a4cbn6dp4z.01k2trmrbsdx3erbaamwzzydy8.lmapp.run/api/v1/process_email")

echo "✅ Email Response with Advisor Context:"
echo "$EMAIL_RESPONSE" | jq '.'
echo ""

echo "🎯 Demo Complete!"
echo ""
echo "🌐 Frontend Dashboard: http://localhost:3000"
echo "   → Go to '📚 Advisor Knowledge' tab to upload documents"
echo "   → Go to '💬 RAG Email History' tab to see context-aware responses"
echo ""
echo "🔗 Key Endpoints:"
echo "   📤 Upload Document: POST /api/v1/upload_advisor_document"
echo "   📋 List Documents: GET /api/v1/advisor_documents"
echo "   💬 Process Email: POST /api/v1/process_email"