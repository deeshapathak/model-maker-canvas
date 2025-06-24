-- Sessions table
CREATE TABLE sessions (
    id TEXT PRIMARY KEY,
    session_id TEXT UNIQUE NOT NULL,
    patient_name TEXT NOT NULL,
    patient_id TEXT,
    status TEXT NOT NULL DEFAULT 'created',
    model_url TEXT,
    model_format TEXT,
    kiri_capture_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME,
    metadata TEXT -- JSON string
);

-- Create indexes for better performance
CREATE INDEX idx_sessions_session_id ON sessions(session_id);
CREATE INDEX idx_sessions_status ON sessions(status);
CREATE INDEX idx_sessions_created_at ON sessions(created_at);

-- Models table
CREATE TABLE models (
    id TEXT PRIMARY KEY,
    session_id TEXT REFERENCES sessions(id),
    file_url TEXT NOT NULL,
    file_size INTEGER,
    format TEXT NOT NULL,
    version INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    metadata TEXT -- JSON string
);

-- Users table
CREATE TABLE users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    role TEXT DEFAULT 'doctor',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
