-- Initial schema for Makeup Cosmetic Data Guardian
-- PostgreSQL migration

-- Users
CREATE TABLE IF NOT EXISTS users (
    id              SERIAL PRIMARY KEY,
    username        TEXT NOT NULL UNIQUE,
    password_hash   TEXT NOT NULL,
    display_name    TEXT NOT NULL DEFAULT '',
    email           TEXT,
    role            TEXT NOT NULL DEFAULT 'viewer'
                    CHECK (role IN ('admin', 'editor', 'viewer')),
    department      TEXT DEFAULT '',
    is_active       BOOLEAN NOT NULL DEFAULT true,
    last_login_at   TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Express sessions (SQLite-backed session persistence)
CREATE TABLE IF NOT EXISTS express_sessions (
    sid             TEXT PRIMARY KEY,
    user_id         INTEGER REFERENCES users(id) ON DELETE SET NULL,
    data            JSONB NOT NULL,
    expired_at      TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_express_sessions_exp ON express_sessions(expired_at);

-- Data sources
CREATE TABLE IF NOT EXISTS data_sources (
    id              SERIAL PRIMARY KEY,
    title           TEXT NOT NULL,
    description     TEXT,
    category        TEXT NOT NULL DEFAULT '其他',
    trust_level     TEXT NOT NULL DEFAULT '用户提供'
                    CHECK (trust_level IN ('内部资料', '行业公开', '用户提供')),
    file_path       TEXT,
    file_type       TEXT,
    file_size       INTEGER,
    source_url      TEXT,
    ref_id          TEXT NOT NULL UNIQUE,
    owner_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    is_archived     BOOLEAN NOT NULL DEFAULT false,
    metadata_json   JSONB,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ds_owner ON data_sources(owner_id);
CREATE INDEX IF NOT EXISTS idx_ds_cat ON data_sources(category);
CREATE INDEX IF NOT EXISTS idx_ds_ref ON data_sources(ref_id);

-- Data points
CREATE TABLE IF NOT EXISTS data_points (
    id              SERIAL PRIMARY KEY,
    source_id       INTEGER NOT NULL REFERENCES data_sources(id) ON DELETE CASCADE,
    label           TEXT NOT NULL,
    value           TEXT NOT NULL,
    unit            TEXT DEFAULT '',
    context         TEXT DEFAULT '',
    row_index       INTEGER,
    column_name     TEXT,
    sheet_name      TEXT,
    source_url      TEXT,
    ref_id          TEXT NOT NULL UNIQUE,
    tags_json       JSONB DEFAULT '[]',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_dp_source ON data_points(source_id);
CREATE INDEX IF NOT EXISTS idx_dp_ref ON data_points(ref_id);

-- Documents
CREATE TABLE IF NOT EXISTS documents (
    id              SERIAL PRIMARY KEY,
    title           TEXT NOT NULL,
    doc_type        TEXT NOT NULL CHECK (doc_type IN ('pptx', 'docx')),
    template_name   TEXT DEFAULT 'default',
    brand_config    JSONB DEFAULT '{}',
    author_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status          TEXT NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft','generating','complete','failed')),
    file_path       TEXT,
    file_size       INTEGER,
    instruction     TEXT,
    data_point_ids  JSONB DEFAULT '[]',
    source_link_count INTEGER DEFAULT 0,
    content_hash    TEXT,
    scan_passed     BOOLEAN DEFAULT false,
    scan_report     JSONB,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at    TIMESTAMPTZ,
    downloaded_at   TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_docs_author ON documents(author_id);
CREATE INDEX IF NOT EXISTS idx_docs_status ON documents(status);

-- Document-data point links
CREATE TABLE IF NOT EXISTS document_data_points (
    document_id     INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    data_point_id   INTEGER NOT NULL REFERENCES data_points(id) ON DELETE CASCADE,
    slide_page_num  INTEGER,
    placement_hint  TEXT,
    PRIMARY KEY (document_id, data_point_id)
);

-- Audit logs
CREATE TABLE IF NOT EXISTS audit_logs (
    id              SERIAL PRIMARY KEY,
    user_id         INTEGER REFERENCES users(id) ON DELETE SET NULL,
    username        TEXT NOT NULL,
    action          TEXT NOT NULL,
    resource_type   TEXT,
    resource_id     INTEGER,
    detail_json     JSONB DEFAULT '{}',
    ip_address      TEXT,
    user_agent      TEXT,
    session_id      TEXT,
    outcome         TEXT DEFAULT 'success' CHECK (outcome IN ('success','failure','blocked')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);

-- Sensitive words
CREATE TABLE IF NOT EXISTS sensitive_words (
    id              SERIAL PRIMARY KEY,
    word            TEXT NOT NULL UNIQUE,
    category        TEXT DEFAULT 'general',
    severity        TEXT DEFAULT 'medium' CHECK (severity IN ('low','medium','high','critical')),
    replacement     TEXT DEFAULT '***',
    is_active       BOOLEAN NOT NULL DEFAULT true,
    created_by      INTEGER REFERENCES users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Brand VI configs
CREATE TABLE IF NOT EXISTS brand_configs (
    id              SERIAL PRIMARY KEY,
    name            TEXT NOT NULL,
    owner_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    is_default      BOOLEAN DEFAULT false,
    config_json     JSONB NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Categories
CREATE TABLE IF NOT EXISTS categories (
    id              SERIAL PRIMARY KEY,
    name            TEXT NOT NULL UNIQUE,
    name_zh         TEXT NOT NULL,
    parent_id       INTEGER REFERENCES categories(id),
    sort_order      INTEGER DEFAULT 0,
    is_active       BOOLEAN DEFAULT true
);

-- Sessions tracking table
CREATE TABLE IF NOT EXISTS sessions (
    id              TEXT PRIMARY KEY,
    user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    ip_address      TEXT,
    user_agent      TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_active_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    expired_at      TIMESTAMPTZ,
    is_active       BOOLEAN NOT NULL DEFAULT true
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
