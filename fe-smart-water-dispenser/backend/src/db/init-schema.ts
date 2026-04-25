export const INIT_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS guest_users (
  id uuid PRIMARY KEY,
  display_id text NOT NULL UNIQUE,
  display_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_active_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS guest_sessions (
  id uuid PRIMARY KEY,
  guest_user_id uuid NOT NULL REFERENCES guest_users(id) ON DELETE CASCADE,
  session_token_hash text NOT NULL,
  csrf_token_hash text,
  user_agent text,
  last_ip text,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS guest_preferences (
  guest_user_id uuid PRIMARY KEY REFERENCES guest_users(id) ON DELETE CASCADE,
  notifications_enabled boolean NOT NULL DEFAULT true,
  public_leaderboard boolean NOT NULL DEFAULT true,
  language_code text NOT NULL DEFAULT 'en',
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sites (
  id uuid PRIMARY KEY,
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  address text,
  latitude numeric(10,7),
  longitude numeric(10,7),
  timezone text NOT NULL DEFAULT 'Asia/Jakarta',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS machines (
  id uuid PRIMARY KEY,
  machine_code text NOT NULL UNIQUE,
  site_id uuid REFERENCES sites(id) ON DELETE SET NULL,
  short_code text NOT NULL UNIQUE,
  display_name text NOT NULL,
  image_url text,
  is_verified boolean NOT NULL DEFAULT false,
  firmware_version text,
  connectivity_status text NOT NULL DEFAULT 'OFFLINE',
  operation_status text NOT NULL DEFAULT 'IDLE',
  last_seen_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS machine_volume_options (
  id uuid PRIMARY KEY,
  machine_id uuid NOT NULL REFERENCES machines(id) ON DELETE CASCADE,
  volume_ml integer NOT NULL,
  price_amount integer NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS machine_status_snapshots (
  id uuid PRIMARY KEY,
  machine_id uuid NOT NULL REFERENCES machines(id) ON DELETE CASCADE,
  state text NOT NULL,
  tank_level_pct integer,
  bottle_detected boolean DEFAULT false,
  pump_running boolean DEFAULT false,
  filled_ml integer DEFAULT 0,
  flow_rate_lpm numeric(6,2),
  source text,
  reported_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS transactions (
  id uuid PRIMARY KEY,
  order_id text NOT NULL UNIQUE,
  guest_user_id uuid REFERENCES guest_users(id) ON DELETE SET NULL,
  machine_id uuid NOT NULL REFERENCES machines(id) ON DELETE RESTRICT,
  volume_ml integer NOT NULL,
  gross_amount integer NOT NULL,
  payment_status text NOT NULL DEFAULT 'UNPAID',
  dispense_status text NOT NULL DEFAULT 'CREATED',
  source_channel text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE TABLE IF NOT EXISTS payments (
  id uuid PRIMARY KEY,
  transaction_id uuid NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'MIDTRANS',
  provider_transaction_id text,
  provider_reference text,
  payment_type text NOT NULL,
  transaction_status text NOT NULL,
  fraud_status text,
  gross_amount integer NOT NULL,
  qr_string text,
  qr_url text,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS payment_notifications (
  id uuid PRIMARY KEY,
  transaction_id uuid REFERENCES transactions(id) ON DELETE SET NULL,
  provider text NOT NULL DEFAULT 'MIDTRANS',
  provider_notification_id text,
  payload text NOT NULL,
  processing_status text NOT NULL DEFAULT 'RECEIVED',
  received_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS transaction_state_logs (
  id uuid PRIMARY KEY,
  transaction_id uuid NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  from_state text,
  to_state text NOT NULL,
  source_type text NOT NULL,
  source_ref text,
  metadata text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS dispense_sessions (
  id uuid PRIMARY KEY,
  transaction_id uuid NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  machine_id uuid NOT NULL REFERENCES machines(id) ON DELETE RESTRICT,
  target_volume_ml integer NOT NULL,
  actual_filled_ml integer NOT NULL DEFAULT 0,
  average_flow_rate_lpm numeric(6,2),
  started_at timestamptz,
  ended_at timestamptz,
  result_status text NOT NULL DEFAULT 'PENDING'
);

CREATE TABLE IF NOT EXISTS machine_events (
  id uuid PRIMARY KEY,
  machine_id uuid NOT NULL REFERENCES machines(id) ON DELETE CASCADE,
  transaction_id uuid REFERENCES transactions(id) ON DELETE SET NULL,
  topic text NOT NULL,
  event_type text NOT NULL,
  payload text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS device_commands (
  id uuid PRIMARY KEY,
  machine_id uuid NOT NULL REFERENCES machines(id) ON DELETE CASCADE,
  transaction_id uuid REFERENCES transactions(id) ON DELETE SET NULL,
  issued_by_admin_id uuid,
  command_type text NOT NULL,
  payload text,
  delivery_status text NOT NULL DEFAULT 'QUEUED',
  issued_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz
);

CREATE TABLE IF NOT EXISTS customer_impact_snapshots (
  id uuid PRIMARY KEY,
  guest_user_id uuid NOT NULL REFERENCES guest_users(id) ON DELETE CASCADE,
  snapshot_date date NOT NULL,
  bottles_saved integer NOT NULL DEFAULT 0,
  co2_reduced_grams integer NOT NULL DEFAULT 0,
  total_spent integer NOT NULL DEFAULT 0,
  total_volume_ml integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS leaderboard_snapshots (
  id uuid PRIMARY KEY,
  snapshot_date date NOT NULL,
  guest_user_id uuid NOT NULL REFERENCES guest_users(id) ON DELETE CASCADE,
  points integer NOT NULL DEFAULT 0,
  rank integer NOT NULL,
  scope text NOT NULL DEFAULT 'GLOBAL'
);

CREATE TABLE IF NOT EXISTS admin_users (
  id uuid PRIMARY KEY,
  email text NOT NULL UNIQUE,
  full_name text NOT NULL,
  password_hash text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS admin_roles (
  id uuid PRIMARY KEY,
  role_key text NOT NULL UNIQUE,
  role_name text NOT NULL
);

CREATE TABLE IF NOT EXISTS admin_user_roles (
  id uuid PRIMARY KEY,
  admin_user_id uuid NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  admin_role_id uuid NOT NULL REFERENCES admin_roles(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS alerts (
  id uuid PRIMARY KEY,
  machine_id uuid NOT NULL REFERENCES machines(id) ON DELETE CASCADE,
  alert_type text NOT NULL,
  severity text NOT NULL,
  status text NOT NULL DEFAULT 'OPEN',
  context text,
  resolved_by_admin_id uuid REFERENCES admin_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY,
  admin_user_id uuid REFERENCES admin_users(id) ON DELETE SET NULL,
  action text NOT NULL,
  target_type text NOT NULL,
  target_id text NOT NULL,
  before_data text,
  after_data text,
  created_at timestamptz NOT NULL DEFAULT now()
);
`;
