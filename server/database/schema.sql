PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    username        TEXT    NOT NULL UNIQUE,
    password_hash   TEXT    NOT NULL,
    display_name    TEXT    NOT NULL DEFAULT '',
    email           TEXT,
    role            TEXT    NOT NULL DEFAULT 'viewer'
                            CHECK (role IN ('admin', 'editor', 'viewer')),
    department      TEXT    DEFAULT '',
    is_active       INTEGER NOT NULL DEFAULT 1,
    last_login_at   TEXT,
    created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
    id              TEXT    PRIMARY KEY,
    user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    ip_address      TEXT,
    user_agent      TEXT,
    created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
    last_active_at  TEXT    NOT NULL DEFAULT (datetime('now')),
    expired_at      TEXT,
    is_active       INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);

CREATE TABLE IF NOT EXISTS data_sources (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    title           TEXT    NOT NULL,
    description     TEXT,
    category        TEXT    NOT NULL DEFAULT '其他',
    trust_level     TEXT    NOT NULL DEFAULT '用户提供'
                            CHECK (trust_level IN ('内部资料', '行业公开', '用户提供')),
    file_path       TEXT,
    file_type       TEXT,
    file_size       INTEGER,
    source_url      TEXT,
    ref_id          TEXT    NOT NULL UNIQUE,
    owner_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    is_archived     INTEGER NOT NULL DEFAULT 0,
    metadata_json   TEXT,
    created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_datasources_owner ON data_sources(owner_id);
CREATE INDEX IF NOT EXISTS idx_datasources_cat   ON data_sources(category);
CREATE INDEX IF NOT EXISTS idx_datasources_ref   ON data_sources(ref_id);

CREATE TABLE IF NOT EXISTS data_points (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    source_id       INTEGER NOT NULL REFERENCES data_sources(id) ON DELETE CASCADE,
    label           TEXT    NOT NULL,
    value           TEXT    NOT NULL,
    unit            TEXT    DEFAULT '',
    context         TEXT    DEFAULT '',
    row_index       INTEGER,
    column_name     TEXT,
    sheet_name      TEXT,
    source_url      TEXT,
    ref_id          TEXT    NOT NULL UNIQUE,
    tags_json       TEXT    DEFAULT '[]',
    created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_datapoints_source ON data_points(source_id);
CREATE INDEX IF NOT EXISTS idx_datapoints_ref    ON data_points(ref_id);

CREATE TABLE IF NOT EXISTS documents (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    title           TEXT    NOT NULL,
    doc_type        TEXT    NOT NULL CHECK (doc_type IN ('pptx', 'docx')),
    template_name   TEXT    DEFAULT 'default',
    brand_config    TEXT    DEFAULT '{}',
    author_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status          TEXT    NOT NULL DEFAULT 'draft'
                            CHECK (status IN ('draft','generating','complete','failed')),
    file_path       TEXT,
    file_size       INTEGER,
    instruction     TEXT,
    data_point_ids  TEXT    DEFAULT '[]',
    source_link_count INTEGER DEFAULT 0,
    content_hash    TEXT,
    scan_passed     INTEGER DEFAULT 0,
    scan_report     TEXT,
    created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
    completed_at    TEXT,
    downloaded_at   TEXT
);
CREATE INDEX IF NOT EXISTS idx_documents_author ON documents(author_id);
CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(status);

CREATE TABLE IF NOT EXISTS document_data_points (
    document_id     INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    data_point_id   INTEGER NOT NULL REFERENCES data_points(id) ON DELETE CASCADE,
    slide_page_num  INTEGER,
    placement_hint  TEXT,
    PRIMARY KEY (document_id, data_point_id)
);

CREATE TABLE IF NOT EXISTS audit_logs (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id         INTEGER REFERENCES users(id) ON DELETE SET NULL,
    username        TEXT    NOT NULL,
    action          TEXT    NOT NULL,
    resource_type   TEXT,
    resource_id     INTEGER,
    detail_json     TEXT    DEFAULT '{}',
    ip_address      TEXT,
    user_agent      TEXT,
    session_id      TEXT,
    outcome         TEXT    DEFAULT 'success' CHECK (outcome IN ('success','failure','blocked')),
    created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_audit_user    ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_action  ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);

CREATE TABLE IF NOT EXISTS sensitive_words (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    word            TEXT    NOT NULL UNIQUE,
    category        TEXT    DEFAULT 'general',
    severity        TEXT    DEFAULT 'medium' CHECK (severity IN ('low','medium','high','critical')),
    replacement     TEXT    DEFAULT '***',
    is_active       INTEGER NOT NULL DEFAULT 1,
    created_by      INTEGER REFERENCES users(id),
    created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS brand_configs (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    name            TEXT    NOT NULL,
    owner_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    is_default      INTEGER DEFAULT 0,
    config_json     TEXT    NOT NULL,
    created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS categories (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    name            TEXT    NOT NULL UNIQUE,
    name_zh         TEXT    NOT NULL,
    parent_id       INTEGER REFERENCES categories(id),
    sort_order      INTEGER DEFAULT 0,
    is_active       INTEGER DEFAULT 1
);
