/**
 * SQL Schema for CRM Database
 *
 * Defines the leads table structure for storing customer lead information
 * from processed emails.
 */

export const crmDatabaseSchema = `
-- Leads table for storing customer lead information
CREATE TABLE IF NOT EXISTS leads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email VARCHAR(255) NOT NULL UNIQUE,
    status VARCHAR(50) NOT NULL DEFAULT 'Lead',
    notes TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Index for faster email lookups
CREATE INDEX IF NOT EXISTS idx_leads_email ON leads(email);

-- Index for status filtering
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);

-- Index for date sorting
CREATE INDEX IF NOT EXISTS idx_leads_updated_at ON leads(updated_at);
`;

export const insertLeadQuery = `
INSERT INTO leads (email, status, notes, created_at, updated_at)
VALUES (?, ?, ?, ?, ?)
ON CONFLICT(email) DO UPDATE SET
    status = excluded.status,
    notes = excluded.notes,
    updated_at = excluded.updated_at
`;

export const selectLeadsQuery = `
SELECT email, status, notes, created_at, updated_at
FROM leads
ORDER BY updated_at DESC
`;