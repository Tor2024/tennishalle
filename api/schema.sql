-- TENNISHALLE schema for Neon Postgres (ported from Supabase live schema, auth-independent)
-- No Supabase-specific: auth.users, RLS policies, is_admin(); auth moves to cookie sessions (app-level).

create extension if not exists "pgcrypto";

create table if not exists venues (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text,
  sort_order integer not null default 0,
  is_active boolean not null default true
);

create table if not exists courts (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references venues(id) on delete cascade,
  name text not null,
  surface text,
  environment text,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  image_url text,
  hourly_price numeric(10,2)
);

create table if not exists operating_hours (
  id uuid primary key default gen_random_uuid(),
  court_id uuid not null references courts(id) on delete cascade,
  weekday integer not null check (weekday between 0 and 6),
  opens text not null,
  closes text not null
);

create table if not exists price_zones (
  id uuid primary key default gen_random_uuid(),
  court_id uuid not null references courts(id) on delete cascade,
  label text not null,
  weekdays integer[] not null default '{0,1,2,3,4,5,6}',
  start_time text not null,
  end_time text not null,
  price_cents integer not null,
  sort_order integer not null default 0
);

create table if not exists club_settings (
  id integer primary key default 1,
  timezone text not null default 'Europe/Berlin',
  currency text not null default 'EUR',
  booking_window_days integer not null default 30,
  allowed_durations integer[] not null default '{30,60,90}',
  member_cancel_cutoff_hours integer not null default 24,
  hall_name text,
  contact_email text,
  contact_phone text,
  address text
);

create table if not exists reservations (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  court_id uuid not null references courts(id) on delete restrict,
  start_at timestamptz not null,
  end_at timestamptz not null,
  duration_minutes integer not null,
  customer_name text not null,
  customer_email text not null,
  customer_phone text,
  notes text,
  fee_cents integer not null default 0,
  status text not null default 'confirmed' check (status in ('confirmed','cancelled')),
  customer_user_id uuid,
  created_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists reservations_court_time_idx on reservations (court_id, start_at);
create index if not exists reservations_status_idx on reservations (status);

create table if not exists court_blocks (
  id uuid primary key default gen_random_uuid(),
  court_id uuid not null references courts(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason text,
  created_at timestamptz not null default now()
);
create index if not exists court_blocks_court_time_idx on court_blocks (court_id, starts_at);

create table if not exists news_posts (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text not null unique,
  body text,
  image_path text,
  published boolean not null default false,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  type text not null default 'news' check (type in ('news','promo')),
  promo_expires_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid unique references reservations(id) on delete set null,
  court_id uuid references courts(id) on delete set null,
  kind text not null check (kind in ('match','tournament','training','other')),
  title text not null check (char_length(title) between 1 and 160),
  participants text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  description text,
  is_published boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint events_valid_time check (ends_at > starts_at)
);
create index if not exists events_published_starts_at_idx on events (starts_at) where is_published;

create table if not exists partners (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  link text,
  logo_path text,
  sort_order integer not null default 0,
  is_active boolean not null default true
);

create table if not exists admin_confirmation_tokens (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null,
  action text not null check (action in ('delete_block','delete_event','delete_partner','delete_post')),
  target_id uuid not null,
  token_hash text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists admin_confirmation_tokens_actor_expires_at_idx on admin_confirmation_tokens (actor_id, expires_at);

-- App-level auth (cookie sessions) — replaces Supabase auth.users
create table if not exists app_users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  password_hash text not null,
  full_name text,
  role text not null default 'member' check (role in ('member','owner','admin')),
  created_at timestamptz not null default now()
);

create table if not exists app_sessions (
  token_hash text primary key,
  user_id uuid not null references app_users(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists app_sessions_user_idx on app_sessions (user_id);
