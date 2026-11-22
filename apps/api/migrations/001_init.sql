-- Everything a user owns hangs off users(id) with ON DELETE CASCADE, so deleting the account deletes all of it.

CREATE TABLE users (
  id uuid PRIMARY KEY,
  google_sub text NOT NULL UNIQUE,
  email text,
  -- The data key encrypted under the user's recovery key. Opaque to the server.
  wrapped_key text,
  -- Per-user change counter. Taking it locks the user row, so changes commit in sequence order and a pull
  -- cursor never skips a change that commits late.
  record_seq bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE devices (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);
CREATE INDEX devices_user ON devices(user_id);

CREATE TABLE refresh_tokens (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_id uuid NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  -- Every token issued by rotating from one sign-in shares a family; reusing an old token revokes the family.
  family_id uuid NOT NULL,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX refresh_tokens_family ON refresh_tokens(family_id);

CREATE TABLE records (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  collection text NOT NULL,
  record_id uuid NOT NULL,
  version integer NOT NULL CHECK (version >= 1),
  deleted boolean NOT NULL,
  ciphertext text NOT NULL,
  key_version integer NOT NULL,
  seq bigint NOT NULL,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, collection, record_id)
);
CREATE INDEX records_pull ON records(user_id, seq);

-- Push results by idempotency key, so a retried request gets the same answer and changes nothing.
CREATE TABLE applied_ops (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  op_id uuid NOT NULL,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, op_id)
);

-- Row-level security: request handlers switch to this role and set app.user_id, so even a buggy query can only
-- touch the signed-in user's rows. A missing setting matches nothing.
DO $$ BEGIN
  CREATE ROLE spentsmart_app NOLOGIN;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
GRANT spentsmart_app TO CURRENT_USER;
GRANT SELECT, INSERT, UPDATE, DELETE ON users, devices, refresh_tokens, records, applied_ops TO spentsmart_app;

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE refresh_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE records ENABLE ROW LEVEL SECURITY;
ALTER TABLE applied_ops ENABLE ROW LEVEL SECURITY;

CREATE POLICY own_user ON users
  USING (id = NULLIF(current_setting('app.user_id', true), '')::uuid)
  WITH CHECK (id = NULLIF(current_setting('app.user_id', true), '')::uuid);
CREATE POLICY own_devices ON devices
  USING (user_id = NULLIF(current_setting('app.user_id', true), '')::uuid)
  WITH CHECK (user_id = NULLIF(current_setting('app.user_id', true), '')::uuid);
CREATE POLICY own_tokens ON refresh_tokens
  USING (user_id = NULLIF(current_setting('app.user_id', true), '')::uuid)
  WITH CHECK (user_id = NULLIF(current_setting('app.user_id', true), '')::uuid);
CREATE POLICY own_records ON records
  USING (user_id = NULLIF(current_setting('app.user_id', true), '')::uuid)
  WITH CHECK (user_id = NULLIF(current_setting('app.user_id', true), '')::uuid);
CREATE POLICY own_ops ON applied_ops
  USING (user_id = NULLIF(current_setting('app.user_id', true), '')::uuid)
  WITH CHECK (user_id = NULLIF(current_setting('app.user_id', true), '')::uuid);
