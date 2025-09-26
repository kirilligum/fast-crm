// SmartSQL schema for Fast-CRM database
// Contains leads table with email categorization and status tracking

export const createTables = async () => {
  const statements = [
    `CREATE TABLE IF NOT EXISTS leads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      status TEXT CHECK(status IN ('Lead', 'Qualified')) NOT NULL,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE INDEX IF NOT EXISTS idx_leads_email ON leads(email)`
  ];
  return statements;
};

// TypeScript interfaces matching table schemas
export interface Lead {
  id: number;
  email: string;
  status: 'Lead' | 'Qualified';
  notes: string | null;
  created_at: Date;
  updated_at: Date;
}

// Additional types for API operations
export interface LeadCreate {
  email: string;
  status: 'Lead' | 'Qualified';
  notes?: string;
}

export interface LeadUpdate {
  status?: 'Lead' | 'Qualified';
  notes?: string;
  updated_at?: Date;
}