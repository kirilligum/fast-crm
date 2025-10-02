import { useState, useEffect } from 'react'
import './App.css'

interface Lead {
  email: string
  status: 'Lead' | 'Qualified'
  notes: string
  created_at: string
  updated_at: string
}

interface ApiResponse {
  message: string
  results?: string
  status: number
  queryExecuted: string
}

interface EmailInteraction {
  id: string
  sender_email: string
  subject: string
  body: string
  response_subject?: string
  response_body?: string
  category: string
  timestamp: string
  type: 'incoming' | 'outgoing'
}

interface AdvisorDocument {
  id: string
  title: string
  author?: string
  upload_timestamp: string
  chunk_count: number
  metadata: {
    document_type: 'book' | 'article' | 'manual' | 'guide' | 'other'
    domain: string
    language: string
  }
}

interface DocumentChunk {
  id: string
  content: string
  chunk_index: number
  relevance_score: number
}

interface DocumentContent {
  document_id: string
  title: string
  preview_text: string
  total_chunks: number
  sample_chunks: DocumentChunk[]
  metadata: {
    document_type: string
    domain: string
    language: string
    upload_timestamp: string
  }
}

function App() {
  const [leads, setLeads] = useState<Lead[]>([])
  const [emailHistory, setEmailHistory] = useState<EmailInteraction[]>([])
  const [advisorDocs, setAdvisorDocs] = useState<AdvisorDocument[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<string>('')
  const [activeTab, setActiveTab] = useState<'leads' | 'rag' | 'advisor'>('leads')
  const [uploadForm, setUploadForm] = useState({
    title: '',
    content: ''
  })
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [selectedDocContent, setSelectedDocContent] = useState<DocumentContent | null>(null)
  const [showingContent, setShowingContent] = useState<string | null>(null)

  const fetchLeads = async () => {
    try {
      setLoading(true)

      // First, let's try to query the database for leads
      const response = await fetch('https://svc-01k6h492192p3412a4cbn6dp4z.01k2trmrbsdx3erbaamwzzydy8.lmapp.run/api/v1/leads', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const data: ApiResponse = await response.json()

      if (data.results) {
        // Parse the JSON results from SmartSQL
        const parsedLeads = JSON.parse(data.results) as Lead[]
        setLeads(parsedLeads)
      } else {
        setLeads([])
      }

      setLastUpdated(new Date().toLocaleTimeString())
      setError(null)
    } catch (err) {
      console.error('Failed to fetch leads:', err)
      setError('Failed to fetch leads data. The database might be empty or the API endpoint may not exist yet.')

      // Show sample data for demo purposes
      setLeads([
        {
          email: 'jenny@newstartup.com',
          status: 'Qualified',
          notes: 'Interested in SmartMemory and platform capabilities',
          created_at: '2024-09-26T10:30:00Z',
          updated_at: '2024-09-26T11:45:00Z'
        },
        {
          email: 'dev@techcorp.com',
          status: 'Qualified',
          notes: 'Asked about SmartSQL and PII detection features',
          created_at: '2024-09-26T14:20:00Z',
          updated_at: '2024-09-26T14:25:00Z'
        },
        {
          email: 'founder@aicompany.com',
          status: 'Lead',
          notes: 'General inquiry about Raindrop platform',
          created_at: '2024-09-26T16:10:00Z',
          updated_at: '2024-09-26T16:10:00Z'
        }
      ])

      // Email history is now fetched via fetchEmailHistory() function
    } finally {
      setLoading(false)
    }
  }

  const deleteLead = async (email: string) => {
    try {
      console.log('Attempting to delete lead:', email)

      // Try the API first
      try {
        const response = await fetch(`https://svc-01k6h492192p3412a4cbn6dp4z.01k2trmrbsdx3erbaamwzzydy8.lmapp.run/api/v1/leads?email=${encodeURIComponent(email)}`, {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
          },
        })

        console.log('Delete response status:', response.status)

        if (response.ok) {
          const result = await response.json()
          console.log('Delete successful via API:', result)
          alert('Lead deleted successfully!')
          fetchLeads()
          return
        }
      } catch (apiError) {
        console.log('API delete failed, using frontend-only delete:', apiError)
      }

      // Fallback: Remove from frontend state (since API endpoint isn't available yet)
      console.log('Removing lead from frontend state:', email)
      setLeads(currentLeads => currentLeads.filter(lead => lead.email !== email))
      alert(`Lead ${email} removed from display (API endpoint not available - this is a frontend-only removal)`)

    } catch (err) {
      console.error('Failed to delete lead - Exception:', err)
      alert(`Failed to delete lead: ${err.message}`)
    }
  }

  const fetchEmailHistory = async () => {
    try {
      const response = await fetch('https://svc-01k6h492192p3412a4cbn6dp4z.01k2trmrbsdx3erbaamwzzydy8.lmapp.run/api/v1/email_history', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const data = await response.json()
      console.log('Email history data:', data)

      if (data.email_interactions && Array.isArray(data.email_interactions)) {
        setEmailHistory(data.email_interactions)
      } else {
        console.log('No email interactions found in response')
        setEmailHistory([])
      }
    } catch (err) {
      console.error('Failed to fetch email history:', err)
      setEmailHistory([])
    }
  }

  useEffect(() => {
    fetchLeads()
    fetchEmailHistory()
    fetchAdvisorDocs()

    // Refresh every 30 seconds for demo
    const interval = setInterval(() => {
      fetchLeads()
      fetchEmailHistory()
      fetchAdvisorDocs()
    }, 30000)
    return () => clearInterval(interval)
  }, [])

  const getStatusBadge = (status: string) => {
    const baseClasses = "px-3 py-1 rounded-full text-sm font-medium"
    if (status === 'Qualified') {
      return `${baseClasses} bg-green-100 text-green-800`
    }
    return `${baseClasses} bg-yellow-100 text-yellow-800`
  }

  const fetchAdvisorDocs = async () => {
    try {
      const response = await fetch('https://svc-01k6h492192p3412a4cbn6dp4z.01k2trmrbsdx3erbaamwzzydy8.lmapp.run/api/v1/advisor_documents', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const data = await response.json()
      setAdvisorDocs(data.documents || [])
    } catch (err) {
      console.error('Failed to fetch advisor documents:', err)
      // Show sample data for demo
      setAdvisorDocs([
        {
          id: 'doc_sample_book',
          title: 'Sales Mastery Guide by Expert Author',
          upload_timestamp: '2024-01-15T10:30:00Z',
          chunk_count: 25,
          metadata: {
            document_type: 'other',
            domain: 'general',
            language: 'en'
          }
        }
      ])
    }
  }

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('text/') && !file.name.endsWith('.txt')) {
      alert('Please upload a text file (.txt)')
      return
    }

    setUploadFile(file)

    try {
      const text = await file.text()
      setUploadForm(prev => ({
        ...prev,
        content: text,
        title: prev.title || file.name.replace(/\.[^/.]+$/, '')
      }))
    } catch (err) {
      console.error('Failed to read file:', err)
      alert('Failed to read file content')
    }
  }

  const uploadAdvisorDocument = async () => {
    if (!uploadForm.title || !uploadForm.content) {
      alert('Please fill in title and content')
      return
    }

    setUploading(true)
    try {
      const response = await fetch('https://svc-01k6h492192p3412a4cbn6dp4z.01k2trmrbsdx3erbaamwzzydy8.lmapp.run/api/v1/upload_advisor_document', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(uploadForm),
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const result = await response.json()
      alert(`Document uploaded successfully! Created ${result.chunks_created} chunks.`)

      // Reset form
      setUploadForm({
        title: '',
        content: ''
      })
      setUploadFile(null)

      // Refresh documents list
      fetchAdvisorDocs()
    } catch (err) {
      console.error('Failed to upload document:', err)
      alert('Failed to upload document. Please try again.')
    } finally {
      setUploading(false)
    }
  }

  const deleteAdvisorDocument = async (documentId: string) => {
    if (!confirm('Are you sure you want to delete this document? This action cannot be undone.')) {
      return
    }

    try {
      const response = await fetch(`https://svc-01k6h492192p3412a4cbn6dp4z.01k2trmrbsdx3erbaamwzzydy8.lmapp.run/api/v1/advisor_documents?id=${encodeURIComponent(documentId)}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const result = await response.json()
      alert(result.message || 'Document deleted successfully!')

      // Refresh documents list
      fetchAdvisorDocs()
    } catch (err) {
      console.error('Failed to delete document:', err)
      alert('Failed to delete document. Please try again.')
    }
  }

  const viewDocumentContent = async (documentId: string) => {
    try {
      setShowingContent(documentId)

      const response = await fetch(`https://svc-01k6h492192p3412a4cbn6dp4z.01k2trmrbsdx3erbaamwzzydy8.lmapp.run/api/v1/advisor_documents/${encodeURIComponent(documentId)}/content`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const content = await response.json()
      setSelectedDocContent(content)
    } catch (err) {
      console.error('Failed to fetch document content:', err)
      alert('Failed to load document content. Please try again.')
      setSelectedDocContent(null)
    }
  }

  const closeDocumentContent = () => {
    setSelectedDocContent(null)
    setShowingContent(null)
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString()
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-white shadow rounded-lg">
          <div className="px-6 py-4 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">
                  🚀 Fast-CRM Dashboard
                </h1>
                <p className="mt-1 text-sm text-gray-600">
                  AI-Powered Lead Management System
                </p>
              </div>
              <div className="flex items-center space-x-4">
                <button
                  onClick={fetchLeads}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors"
                  disabled={loading}
                >
                  {loading ? '🔄 Loading...' : '↻ Refresh'}
                </button>
                {lastUpdated && (
                  <span className="text-xs text-gray-500">
                    Last updated: {lastUpdated}
                  </span>
                )}
              </div>
            </div>
          </div>

          {error && (
            <div className="px-6 py-4 bg-yellow-50 border-l-4 border-yellow-400">
              <div className="flex">
                <div className="ml-3">
                  <p className="text-sm text-yellow-700">
                    ⚠️ {error}
                  </p>
                  <p className="text-xs text-yellow-600 mt-1">
                    Showing sample data for demonstration purposes.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Tab Navigation */}
          <div className="border-b border-gray-200">
            <nav className="-mb-px flex space-x-8 px-6">
              <button
                onClick={() => setActiveTab('leads')}
                className={`py-4 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'leads'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                📊 Leads Database
              </button>
              <button
                onClick={() => setActiveTab('rag')}
                className={`py-4 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'rag'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                💬 RAG Email History
              </button>
              <button
                onClick={() => setActiveTab('advisor')}
                className={`py-4 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'advisor'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                📚 Advisor Knowledge
              </button>
            </nav>
          </div>

          <div className="px-6 py-4">
            {activeTab === 'leads' && (
              <>
                <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div className="bg-blue-50 rounded-lg p-4">
                    <div className="text-2xl font-bold text-blue-600">
                      {leads.length}
                    </div>
                    <div className="text-sm text-blue-600">Total Leads</div>
                  </div>
                  <div className="bg-green-50 rounded-lg p-4">
                    <div className="text-2xl font-bold text-green-600">
                      {leads.filter(lead => lead.status === 'Qualified').length}
                    </div>
                    <div className="text-sm text-green-600">Qualified Leads</div>
                  </div>
                  <div className="bg-yellow-50 rounded-lg p-4">
                    <div className="text-2xl font-bold text-yellow-600">
                      {leads.filter(lead => lead.status === 'Lead').length}
                    </div>
                    <div className="text-sm text-yellow-600">New Leads</div>
                  </div>
                </div>
              </>
            )}

            {activeTab === 'rag' && (
              <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-4">
                <div className="bg-purple-50 rounded-lg p-4">
                  <div className="text-2xl font-bold text-purple-600">
                    {emailHistory.length}
                  </div>
                  <div className="text-sm text-purple-600">Email Interactions</div>
                </div>
                <div className="bg-indigo-50 rounded-lg p-4">
                  <div className="text-2xl font-bold text-indigo-600">
                    {[...new Set(emailHistory.map(e => e.sender_email))].length}
                  </div>
                  <div className="text-sm text-indigo-600">Unique Senders</div>
                </div>
                <div className="bg-cyan-50 rounded-lg p-4">
                  <div className="text-2xl font-bold text-cyan-600">
                    {emailHistory.filter(e => e.category === 'QUALIFY_LEAD').length}
                  </div>
                  <div className="text-sm text-cyan-600">Qualified Interactions</div>
                </div>
                <div className="bg-teal-50 rounded-lg p-4">
                  <div className="text-2xl font-bold text-teal-600">
                    {emailHistory.filter(e => e.category === 'ADD_LEAD').length}
                  </div>
                  <div className="text-sm text-teal-600">Lead Gen Interactions</div>
                </div>
              </div>
            )}

            {activeTab === 'leads' && (
              <>
                {loading ? (
                  <div className="text-center py-8">
                    <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                    <p className="mt-2 text-gray-600">Loading leads data...</p>
                  </div>
                ) : (
                  <div className="overflow-hidden shadow ring-1 ring-black ring-opacity-5 md:rounded-lg">
                    <table className="min-w-full divide-y divide-gray-300">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Email
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Status
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Notes
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Created
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Updated
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Actions
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {leads.map((lead, index) => (
                          <tr key={index} className="hover:bg-gray-50">
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                              {lead.email}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span className={getStatusBadge(lead.status)}>
                                {lead.status}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-900 max-w-xs truncate">
                              {lead.notes}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              {formatDate(lead.created_at)}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              {formatDate(lead.updated_at)}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              <button
                                onClick={() => deleteLead(lead.email)}
                                className="text-red-600 hover:text-red-900 text-sm font-medium"
                              >
                                🗑️ Delete
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>

                    {leads.length === 0 && !loading && (
                      <div className="text-center py-8">
                        <p className="text-gray-500">No leads found in the database.</p>
                        <p className="text-sm text-gray-400 mt-1">
                          Send some test emails to populate the CRM!
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}

            {activeTab === 'rag' && (
              <div className="space-y-6">
                {emailHistory.map((interaction) => (
                  <div key={interaction.id} className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
                    <div className="bg-gray-50 px-6 py-4 border-b border-gray-200">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <div className="text-sm font-medium text-gray-900">
                            {interaction.sender_email}
                          </div>
                          <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                            interaction.category === 'QUALIFY_LEAD'
                              ? 'bg-green-100 text-green-800'
                              : 'bg-blue-100 text-blue-800'
                          }`}>
                            {interaction.category}
                          </span>
                        </div>
                        <div className="text-xs text-gray-500">
                          {formatDate(interaction.timestamp)}
                        </div>
                      </div>
                    </div>

                    <div className="p-6 space-y-4">
                      {/* Incoming Email */}
                      <div className="bg-blue-50 rounded-lg p-4">
                        <div className="flex items-center space-x-2 mb-2">
                          <span className="text-blue-600 font-medium text-sm">📨 Incoming Email</span>
                        </div>
                        <div className="text-sm font-medium text-gray-900 mb-2">
                          Subject: {interaction.subject}
                        </div>
                        <div className="text-sm text-gray-700 leading-relaxed">
                          {interaction.body}
                        </div>
                      </div>

                      {/* AI Response */}
                      {interaction.response_subject && (
                        <div className="bg-green-50 rounded-lg p-4">
                          <div className="flex items-center space-x-2 mb-2">
                            <span className="text-green-600 font-medium text-sm">🤖 AI Response</span>
                          </div>
                          <div className="text-sm font-medium text-gray-900 mb-2">
                            Subject: {interaction.response_subject}
                          </div>
                          <div className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">
                            {interaction.response_body}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}

                {emailHistory.length === 0 && (
                  <div className="text-center py-8">
                    <p className="text-gray-500">No email interactions found.</p>
                    <p className="text-sm text-gray-400 mt-1">
                      Email conversations will appear here as they are processed by the RAG system.
                    </p>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'advisor' && (
              <div className="space-y-6">
                {/* Upload Form */}
                <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-6">
                  <h3 className="text-lg font-medium text-gray-900 mb-4">📚 Upload Advisor Document</h3>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Title *
                      </label>
                      <input
                        type="text"
                        value={uploadForm.title}
                        onChange={(e) => setUploadForm({...uploadForm, title: e.target.value})}
                        className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        placeholder="e.g., Sales Mastery Guide by Expert Author"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Upload Text File
                      </label>
                      <input
                        type="file"
                        accept=".txt,text/plain"
                        onChange={handleFileUpload}
                        className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 file:mr-3 file:py-1 file:px-3 file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                      />
                      {uploadFile && (
                        <p className="text-sm text-green-600 mt-1">
                          ✅ {uploadFile.name} loaded ({(uploadFile.size / 1024).toFixed(1)} KB)
                        </p>
                      )}
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Content *
                      </label>
                      <textarea
                        value={uploadForm.content}
                        onChange={(e) => setUploadForm({...uploadForm, content: e.target.value})}
                        rows={10}
                        className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        placeholder="Paste text content here or upload a .txt file above. The system will automatically chunk it for RAG processing."
                      />
                    </div>
                    <div className="flex justify-between items-center">
                      <p className="text-sm text-gray-600">
                        Text will be processed into semantic chunks for AI advisor responses
                      </p>
                      <button
                        onClick={uploadAdvisorDocument}
                        disabled={uploading || !uploadForm.title || !uploadForm.content}
                        className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white px-6 py-2 rounded-md text-sm font-medium transition-colors"
                      >
                        {uploading ? '⏳ Uploading...' : '📤 Upload Document'}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Documents List */}
                <div className="bg-white border border-gray-200 rounded-lg shadow-sm">
                  <div className="px-6 py-4 border-b border-gray-200">
                    <h3 className="text-lg font-medium text-gray-900">📋 Advisor Documents</h3>
                    <p className="text-sm text-gray-600 mt-1">
                      Knowledge base documents used for enhancing AI responses
                    </p>
                  </div>
                  <div className="divide-y divide-gray-200">
                    {advisorDocs.map((doc) => (
                      <div key={doc.id} className="px-6 py-4">
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <div className="flex items-center space-x-3">
                              <h4 className="text-sm font-medium text-gray-900">
                                {doc.title}
                              </h4>
                              <span className="px-2 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-800">
                                📄 Document
                              </span>
                            </div>
                            <p className="text-xs text-gray-500 mt-1">
                              {doc.chunk_count} chunks • Uploaded {formatDate(doc.upload_timestamp)}
                            </p>
                          </div>
                          <div className="flex items-center space-x-3">
                            <button
                              onClick={() => viewDocumentContent(doc.id)}
                              disabled={showingContent === doc.id}
                              className="px-3 py-1 text-xs font-medium rounded-md bg-blue-100 text-blue-700 hover:bg-blue-200 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {showingContent === doc.id ? '🔄 Loading...' : '👁️ View Content'}
                            </button>
                            <button
                              onClick={() => deleteAdvisorDocument(doc.id)}
                              className="px-3 py-1 text-xs font-medium rounded-md bg-red-100 text-red-700 hover:bg-red-200"
                            >
                              🗑️ Delete
                            </button>
                            <span className="text-sm text-gray-500">
                              🧠 {doc.chunk_count} chunks
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  {advisorDocs.length === 0 && (
                    <div className="text-center py-8">
                      <p className="text-gray-500">No advisor documents uploaded yet.</p>
                      <p className="text-sm text-gray-400 mt-1">
                        Upload text documents to enhance AI responses with expert knowledge.
                      </p>
                    </div>
                  )}
                </div>

                {/* Document Content Preview Modal */}
                {selectedDocContent && (
                  <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
                      <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
                        <div>
                          <h3 className="text-lg font-medium text-gray-900">
                            📚 {selectedDocContent.title}
                          </h3>
                          <p className="text-sm text-gray-500 mt-1">
                            {selectedDocContent.total_chunks} total chunks • Document ID: {selectedDocContent.document_id}
                          </p>
                        </div>
                        <button
                          onClick={closeDocumentContent}
                          className="text-gray-400 hover:text-gray-600"
                        >
                          <span className="sr-only">Close</span>
                          ✕
                        </button>
                      </div>

                      <div className="px-6 py-4 max-h-[70vh] overflow-y-auto">
                        {/* Preview Text */}
                        <div className="mb-6">
                          <h4 className="text-sm font-medium text-gray-900 mb-2">📖 Preview</h4>
                          <div className="bg-gray-50 rounded-lg p-4">
                            <p className="text-sm text-gray-700">
                              {selectedDocContent.preview_text}
                            </p>
                          </div>
                        </div>

                        {/* Sample Chunks */}
                        <div>
                          <h4 className="text-sm font-medium text-gray-900 mb-3">
                            🧩 Sample Knowledge Chunks ({selectedDocContent.sample_chunks.length} of {selectedDocContent.total_chunks})
                          </h4>
                          <div className="space-y-4">
                            {selectedDocContent.sample_chunks.map((chunk) => (
                              <div key={chunk.id} className="border border-gray-200 rounded-lg p-4">
                                <div className="flex items-center justify-between mb-2">
                                  <span className="text-xs font-medium text-blue-600">
                                    Chunk #{chunk.chunk_index}
                                  </span>
                                  <span className="text-xs text-gray-500">
                                    Relevance: {Math.round(chunk.relevance_score * 100)}%
                                  </span>
                                </div>
                                <p className="text-sm text-gray-700 leading-relaxed">
                                  {chunk.content}
                                </p>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Metadata */}
                        <div className="mt-6 p-4 bg-gray-50 rounded-lg">
                          <h4 className="text-sm font-medium text-gray-900 mb-2">📊 Document Metadata</h4>
                          <div className="grid grid-cols-2 gap-4 text-xs text-gray-600">
                            <div>
                              <span className="font-medium">Type:</span> {selectedDocContent.metadata.document_type}
                            </div>
                            <div>
                              <span className="font-medium">Domain:</span> {selectedDocContent.metadata.domain}
                            </div>
                            <div>
                              <span className="font-medium">Language:</span> {selectedDocContent.metadata.language}
                            </div>
                            <div>
                              <span className="font-medium">Uploaded:</span> {formatDate(selectedDocContent.metadata.upload_timestamp)}
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="px-6 py-4 border-t border-gray-200 bg-gray-50">
                        <div className="flex justify-between items-center">
                          <p className="text-xs text-gray-500">
                            These chunks are used to enhance AI responses with expert knowledge
                          </p>
                          <button
                            onClick={closeDocumentContent}
                            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                          >
                            Close
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="px-6 py-4 bg-gray-50 border-t border-gray-200">
            <div className="flex items-center justify-between text-sm text-gray-600">
              <div>
                {activeTab === 'leads'
                  ? '📊 CRM leads database with AI categorization and status tracking'
                  : activeTab === 'rag'
                  ? '💬 RAG email history showing context-aware conversation flow'
                  : '📚 Advisor knowledge base for document-enhanced AI responses'
                }
              </div>
              <div className="flex items-center space-x-4">
                <span>🔗 APIs:</span>
                <code className="bg-gray-200 px-2 py-1 rounded text-xs">
                  /api/v1/process_email
                </code>
                <code className="bg-gray-200 px-2 py-1 rounded text-xs">
                  /api/v1/leads
                </code>
                {activeTab === 'advisor' && (
                  <code className="bg-gray-200 px-2 py-1 rounded text-xs">
                    /api/v1/upload_advisor_document
                  </code>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default App
