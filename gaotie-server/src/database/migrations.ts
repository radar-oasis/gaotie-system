export interface DatabaseMigration {
  id: string;
  sql: string;
}

export const DATABASE_MIGRATIONS: DatabaseMigration[] = [
  {
    id: '001_auth_projects_snapshots',
    sql: `
      CREATE TABLE IF NOT EXISTS users (
        id uuid PRIMARY KEY,
        username text NOT NULL UNIQUE,
        password_hash text NOT NULL,
        display_name text,
        role text NOT NULL DEFAULT 'user',
        status text NOT NULL DEFAULT 'active',
        last_login_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS user_sessions (
        id uuid PRIMARY KEY,
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token_hash text NOT NULL UNIQUE,
        expires_at timestamptz NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id
        ON user_sessions(user_id);
      CREATE INDEX IF NOT EXISTS idx_user_sessions_expires_at
        ON user_sessions(expires_at);

      CREATE TABLE IF NOT EXISTS projects (
        id uuid PRIMARY KEY,
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name text NOT NULL,
        description text,
        status text NOT NULL DEFAULT 'active',
        current_step text NOT NULL DEFAULT 'demand',
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        archived_at timestamptz
      );

      CREATE INDEX IF NOT EXISTS idx_projects_user_updated
        ON projects(user_id, updated_at DESC);

      CREATE TABLE IF NOT EXISTS project_snapshots (
        project_id uuid PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
        version integer NOT NULL DEFAULT 1,
        updated_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE INDEX IF NOT EXISTS idx_project_snapshots_user_id
        ON project_snapshots(user_id);

      CREATE TABLE IF NOT EXISTS conversations (
        id uuid PRIMARY KEY,
        project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        module text NOT NULL,
        title text NOT NULL,
        status text NOT NULL DEFAULT 'active',
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE INDEX IF NOT EXISTS idx_conversations_project_updated
        ON conversations(project_id, updated_at DESC);

      CREATE TABLE IF NOT EXISTS messages (
        id uuid PRIMARY KEY,
        conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        role text NOT NULL,
        message_type text NOT NULL DEFAULT 'text',
        content text NOT NULL,
        payload jsonb NOT NULL DEFAULT '{}'::jsonb,
        model text,
        created_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE INDEX IF NOT EXISTS idx_messages_conversation_created
        ON messages(conversation_id, created_at ASC);
    `,
  },
  {
    id: '2026-10-06-assets',
    sql: `
      CREATE TABLE IF NOT EXISTS assets (
        id uuid PRIMARY KEY,
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
        project_name text NOT NULL,
        kind text NOT NULL CHECK (kind IN ('pattern', 'proposal')),
        name text NOT NULL,
        theme text NOT NULL DEFAULT '',
        imagery text NOT NULL DEFAULT '',
        source_key text NOT NULL,
        image_data bytea NOT NULL,
        payload jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now(),
        deleted_at timestamptz,
        UNIQUE(user_id, kind, source_key)
      );
      CREATE INDEX IF NOT EXISTS idx_assets_owner_created ON assets(user_id, created_at DESC) WHERE deleted_at IS NULL;
    `,
  },
  {
    id: '2026-10-06-asset-reference-images',
    sql: `CREATE TABLE IF NOT EXISTS asset_reference_images (
      id uuid PRIMARY KEY,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      content_hash text NOT NULL,
      image_data bytea NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(user_id, content_hash)
    );`,
  },
  {
    id: '2026-10-06-asset-name-counters',
    sql: `CREATE TABLE IF NOT EXISTS asset_name_counters (
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      root_key text NOT NULL,
      last_value bigint NOT NULL DEFAULT 0,
      allocations jsonb NOT NULL DEFAULT '{}'::jsonb,
      PRIMARY KEY (user_id, root_key)
    );`,
  },
];
