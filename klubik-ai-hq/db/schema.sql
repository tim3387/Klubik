-- Klubik AI HQ — schéma Postgres (Supabase ou tout Postgres 15+).
-- Idempotent : peut être rejoué sans perte (scripts/migrate-db.ts).
-- Accès uniquement côté serveur (clé de connexion jamais exposée au navigateur).

create extension if not exists pgcrypto;

-- ─────────────────────────────── CRM (source de vérité unique) ───────────────────────────────

-- Une ligne par club. `data` conserve les colonnes d'origine du fichier Excel (en-têtes français),
-- hors colonnes calculées (recalculées par l'application). Dates au format AAAA-MM-JJ.
create table if not exists crm_clubs (
  id          integer primary key,                         -- colonne « ID » du fichier
  data        jsonb not null,
  version     integer not null default 1,                  -- verrou optimiste
  updated_at  timestamptz not null default now(),
  club        text generated always as (data->>'Club') stored,
  statut      text generated always as (data->>'Statut') stored
);
create index if not exists crm_clubs_statut_idx on crm_clubs (statut);

-- Règles de l'onglet « Listes » (statuts, canaux, délai de relance, seuils, objectif hebdo).
create table if not exists crm_settings (
  key    text primary key,
  value  jsonb not null
);

-- Journal de toutes les modifications du CRM (avant → après). Jamais modifié ni purgé par l'application.
create table if not exists crm_journal (
  id          bigserial primary key,
  club_id     integer not null,
  actor       text not null,                 -- 'timothe' (validation) | 'import'
  kind        text not null,                 -- premier-contact, relance, reponse, …
  summary     text,
  before      jsonb,
  after       jsonb,
  action_id   uuid,
  created_at  timestamptz not null default now()
);
create index if not exists crm_journal_club_idx on crm_journal (club_id, created_at);

-- Archive intégrale de chaque import (tous les onglets, valeurs ET formules, + fichier d'origine).
create table if not exists crm_import_archive (
  id             serial primary key,
  imported_at    timestamptz not null default now(),
  source_name    text not null,
  source_sha256  text not null,
  sheets         jsonb not null,
  file_base64    text
);

-- Dossiers de renseignement produits par Jojo.
create table if not exists intel_dossiers (
  id          bigserial primary key,
  club_id     integer not null,
  verifie_le  date not null,
  data        jsonb not null,
  task_id     uuid,
  created_at  timestamptz not null default now()
);
create index if not exists intel_club_idx on intel_dossiers (club_id, verifie_le desc);

-- ─────────────────────────────── Conversations et missions ───────────────────────────────

create table if not exists conversations (
  id          uuid primary key default gen_random_uuid(),
  agent_id    text not null,
  title       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists conversations_agent_idx on conversations (agent_id, updated_at desc);

create table if not exists chat_messages (
  id               bigserial primary key,
  conversation_id  uuid not null references conversations(id) on delete cascade,
  role             text not null check (role in ('user', 'agent', 'event')),
  agent_id         text,
  content          text not null,
  task_id          uuid,
  meta             jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now()
);
create index if not exists chat_messages_conv_idx on chat_messages (conversation_id, id);

-- Une tâche = une exécution d'agent (boucle d'appels à l'API Claude), découpée en étapes persistées.
-- Les délégations de Kung créent des tâches enfants. La racine d'une demande est une « mission ».
create table if not exists tasks (
  id                  uuid primary key default gen_random_uuid(),
  root_id             uuid,
  parent_id           uuid references tasks(id),
  parent_tool_use_id  text,
  conversation_id     uuid references conversations(id) on delete set null,
  agent_id            text not null,
  title               text not null,
  input               text not null,
  status              text not null check (status in ('ready', 'running', 'waiting', 'done', 'failed')),
  transcript          jsonb not null default '[]'::jsonb,     -- messages API (append-only)
  pending_results     jsonb not null default '[]'::jsonb,     -- résultats d'outils en attente des enfants
  result              text,
  error               text,
  steps               integer not null default 0,
  attempts            integer not null default 0,
  not_before          timestamptz not null default now(),
  locked_until        timestamptz,
  cost_usd            numeric(12, 6) not null default 0,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  finished_at         timestamptz
);
create index if not exists tasks_runnable_idx on tasks (status, not_before);
create index if not exists tasks_root_idx on tasks (root_id);
create index if not exists tasks_parent_idx on tasks (parent_id);

-- Actions proposées par les agents, en attente de la validation de Timothé.
create table if not exists actions (
  id          uuid primary key default gen_random_uuid(),
  task_id     uuid references tasks(id) on delete set null,
  root_id     uuid,
  conversation_id uuid references conversations(id) on delete set null,
  agent_id    text not null,
  kind        text not null check (kind in ('crm_update', 'message_draft')),
  status      text not null check (status in ('pending', 'applied', 'rejected', 'sent', 'failed')),
  club_id     integer,
  title       text not null,
  payload     jsonb not null,
  result      jsonb,
  created_at  timestamptz not null default now(),
  decided_at  timestamptz
);
create index if not exists actions_status_idx on actions (status, created_at desc);

-- Consommation de l'API (suivi des coûts et plafond mensuel).
create table if not exists usage_log (
  id             bigserial primary key,
  task_id        uuid,
  agent_id       text not null,
  model          text not null,
  input_tokens   integer not null default 0,
  output_tokens  integer not null default 0,
  cache_read     integer not null default 0,
  cache_write    integer not null default 0,
  web_searches   integer not null default 0,
  cost_usd       numeric(12, 6) not null default 0,
  created_at     timestamptz not null default now()
);
create index if not exists usage_month_idx on usage_log (created_at);

-- Sécurité Supabase : RLS activé sans aucune politique = aucun accès via les clés publiques (anon).
-- L'application accède à la base uniquement côté serveur, avec la chaîne de connexion Postgres.
alter table crm_clubs enable row level security;
alter table crm_settings enable row level security;
alter table crm_journal enable row level security;
alter table crm_import_archive enable row level security;
alter table intel_dossiers enable row level security;
alter table conversations enable row level security;
alter table chat_messages enable row level security;
alter table tasks enable row level security;
alter table actions enable row level security;
alter table usage_log enable row level security;

-- Mot de passe de Timothé (haché scrypt). Défini une seule fois via la page /setup (protégée par SETUP_TOKEN).
create table if not exists app_auth (
  id             integer primary key default 1 check (id = 1),
  password_hash  text not null,
  updated_at     timestamptz not null default now()
);
alter table app_auth enable row level security;
