create table if not exists google_pending_users (
  token_hash text primary key,
  user_id uuid not null references app_users(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists google_pending_users_expires on google_pending_users (expires_at);
