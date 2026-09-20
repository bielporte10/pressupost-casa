-- ============================================================
--  Pressupost de casa — esquema i seguretat
--  Enganxa TOT aquest fitxer a Supabase → SQL Editor → Run
-- ============================================================
--
--  Model de seguretat
--  ------------------
--  La clau "anon" que hi ha a config.js és PÚBLICA per disseny: va dins
--  de qualsevol app web de Supabase i no dona accés a res per si sola.
--  Qui protegeix les dades és el Row Level Security (RLS) d'aquest
--  fitxer: cada consulta només pot tocar les files de la teva llar, i
--  només si has iniciat sessió.
--
--  Sense sessió iniciada: 0 files, sempre.
--  Amb sessió d'una altra llar: 0 files de la teva.
-- ============================================================

-- ---------- 1. TAULES ----------

create table if not exists public.llars (
  id          uuid primary key default gen_random_uuid(),
  nom         text not null,
  creada      timestamptz not null default now()
);

create table if not exists public.membres (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  llar_id     uuid not null references public.llars(id) on delete cascade,
  nom         text not null,
  butxaca     numeric(10,2) not null default 0,
  color       text not null default '#4f76c4',
  es_admin    boolean not null default false,
  creat       timestamptz not null default now()
);
create index if not exists membres_llar_idx on public.membres(llar_id);

create table if not exists public.categories (
  id          uuid primary key default gen_random_uuid(),
  llar_id     uuid not null references public.llars(id) on delete cascade,
  bloc        text not null default 'CASA',
  nom         text not null,
  limit_mes   numeric(10,2) not null default 0,
  ordre       integer not null default 0
);
create index if not exists categories_llar_idx on public.categories(llar_id);

create table if not exists public.config (
  llar_id     uuid primary key references public.llars(id) on delete cascade,
  ingressos   numeric(10,2) not null default 0,
  fixos       numeric(10,2) not null default 0,
  objectiu    numeric(10,2) not null default 0
);

create table if not exists public.moviments (
  id           uuid primary key default gen_random_uuid(),
  llar_id      uuid not null references public.llars(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  data         date not null,
  categoria_id uuid references public.categories(id) on delete set null,
  import       numeric(10,2) not null check (import > 0),
  nota         text,
  creat        timestamptz not null default now()
);
create index if not exists moviments_llar_data_idx on public.moviments(llar_id, data desc);

-- ---------- 2. QUINA LLAR ÉS LA TEVA ----------
-- SECURITY DEFINER és imprescindible: sense això, la política de
-- "membres" consultaria "membres" i entraria en recursió infinita.

create or replace function public.la_meva_llar()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select llar_id from public.membres where user_id = auth.uid()
$$;

revoke all on function public.la_meva_llar() from public, anon;
grant execute on function public.la_meva_llar() to authenticated;

-- ---------- 3. ACTIVAR RLS ----------
-- Un cop activat, per defecte NO es veu res. Només passa el que
-- permetin explícitament les polítiques de sota.

alter table public.llars      enable row level security;
alter table public.membres    enable row level security;
alter table public.categories enable row level security;
alter table public.config     enable row level security;
alter table public.moviments  enable row level security;

alter table public.llars      force row level security;
alter table public.membres    force row level security;
alter table public.categories force row level security;
alter table public.config     force row level security;
alter table public.moviments  force row level security;

-- ---------- 4. PERMISOS DE TAULA ----------
-- Si has creat el projecte amb "Automatically expose new tables"
-- desmarcat (recomanat), les taules no són accessibles fins que es
-- doni permís explícitament. Això és una segona capa per sota del RLS:
--
--   permisos  -> decideixen QUINES TAULES existeixen per a l'API
--   RLS       -> decideix QUINES FILES en surten
--
-- El rol "anon" (sense sessió) no rep cap permís sobre cap taula.

grant usage on schema public to anon, authenticated;

revoke all on all tables in schema public from anon;

grant select                         on public.llars      to authenticated;
grant select, update                 on public.membres    to authenticated;
grant select, insert, update, delete on public.categories to authenticated;
grant select, insert, update, delete on public.config     to authenticated;
grant select, insert, update, delete on public.moviments  to authenticated;

-- ---------- 5. POLÍTIQUES ----------

-- LLARS: només la teva, i només llegir-la.
drop policy if exists llars_select on public.llars;
create policy llars_select on public.llars
  for select to authenticated
  using (id = public.la_meva_llar());

-- MEMBRES: veus qui viu a casa teva. Només pots editar-te a tu mateix.
drop policy if exists membres_select on public.membres;
create policy membres_select on public.membres
  for select to authenticated
  using (llar_id = public.la_meva_llar());

drop policy if exists membres_update on public.membres;
create policy membres_update on public.membres
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and llar_id = public.la_meva_llar());

-- CATEGORIES: qualsevol de la llar les pot llegir i ajustar.
drop policy if exists categories_all on public.categories;
create policy categories_all on public.categories
  for all to authenticated
  using (llar_id = public.la_meva_llar())
  with check (llar_id = public.la_meva_llar());

-- CONFIG: igual.
drop policy if exists config_all on public.config;
create policy config_all on public.config
  for all to authenticated
  using (llar_id = public.la_meva_llar())
  with check (llar_id = public.la_meva_llar());

-- MOVIMENTS: tothom de la llar els veu (és un pressupost compartit),
-- però cadascú només pot crear-los a nom seu i esborrar els seus.
drop policy if exists moviments_select on public.moviments;
create policy moviments_select on public.moviments
  for select to authenticated
  using (llar_id = public.la_meva_llar());

drop policy if exists moviments_insert on public.moviments;
create policy moviments_insert on public.moviments
  for insert to authenticated
  with check (llar_id = public.la_meva_llar() and user_id = auth.uid());

drop policy if exists moviments_update on public.moviments;
create policy moviments_update on public.moviments
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and llar_id = public.la_meva_llar());

drop policy if exists moviments_delete on public.moviments;
create policy moviments_delete on public.moviments
  for delete to authenticated
  using (user_id = auth.uid());

-- ---------- 6. TEMPS REAL ----------
-- Perquè quan un apunti una despesa, als altres els aparegui sola.

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'moviments'
  ) then
    alter publication supabase_realtime add table public.moviments;
  end if;
end $$;

-- ============================================================
--  7. DADES INICIALS
--  Executa aquest bloc DESPRÉS d'haver creat els usuaris a
--  Authentication → Users (un per persona).
--  No cal tocar res: agafa tots els usuaris que existeixin.
-- ============================================================

--  IMPORTANT: la llista de correus de sota és una llista blanca.
--  Només s'hi donaran d'alta aquests. Fer-ho així i no "tots els
--  usuaris que existeixin" és a posta: si algun dia el registre
--  públic queda obert i un desconegut es crea un compte, tornar a
--  executar aquest bloc no li donaria accés a les vostres dades.

do $$
declare
  v_llar  uuid;
  u       record;
  nous    integer := 0;
  n       integer;
  -- correu, nom, butxaca, color
  gent    text[][] := array[
    ['marcporte@gmail.com',   'Marc',   '500', '#4f76c4'],
    ['ibigorda@gmail.com',    'Isabel', '300', '#c4607a'],
    ['bielporte10@gmail.com', 'Biel',   '0',   '#3d9970']
    -- per afegir-ne més, posa'ls aquí i torna a executar el bloc:
    -- ,['oriol@exemple.com', 'Oriol', '0', '#d98d3a']
    -- ,['pol@exemple.com',   'Pol',   '0', '#8a6fc4']
  ];
begin
  select id into v_llar from public.llars limit 1;
  if v_llar is null then
    insert into public.llars (nom) values ('Casa') returning id into v_llar;
  end if;

  for i in 1 .. array_length(gent,1) loop
    for u in
      select au.id from auth.users au
      where lower(au.email) = lower(gent[i][1])
        and not exists (select 1 from public.membres m where m.user_id = au.id)
    loop
      insert into public.membres (user_id, llar_id, nom, butxaca, color)
      values (u.id, v_llar, gent[i][2], gent[i][3]::numeric, gent[i][4]);
      nous := nous + 1;
    end loop;
  end loop;

  if not exists (select 1 from public.categories where llar_id = v_llar) then
    insert into public.categories (llar_id,bloc,nom,limit_mes,ordre) values
      (v_llar,'CASA','Supermercat',700,1),
      (v_llar,'CASA','Cotxe: benzina i pàrquing',290,2),
      (v_llar,'CASA','Farmàcia, metges i dentista',155,3),
      (v_llar,'CASA','Llar i manteniment',85,4),
      (v_llar,'CASA','Veterinari',60,5),
      (v_llar,'CASA','Transport públic',20,6),
      (v_llar,'FAMÍLIA','Restaurants i sortides',400,7),
      (v_llar,'FAMÍLIA','Fons de vacances',150,8),
      (v_llar,'IMPREVISTOS','Imprevistos',300,99);
  end if;

  insert into public.config (llar_id,ingressos,fixos,objectiu)
  values (v_llar, 7083.81, 3723.67, 500)
  on conflict (llar_id) do nothing;

  select count(*) into n from public.membres;
  raise notice 'Fet. % membres nous, % en total.', nous, n;
end $$;

-- ============================================================
--  QUI TÉ ACCÉS A LES DADES?
--  Executa això de tant en tant. Han de sortir només els de casa.
--  Si hi surt algú que no coneixes, esborra'l de la taula membres
--  (i de Authentication → Users).
-- ============================================================
--
--   select m.nom, u.email, m.butxaca
--   from public.membres m join auth.users u on u.id = m.user_id
--   order by m.creat;

-- ============================================================
--  COMPROVACIÓ
--  Amb sessió iniciada, això ha de tornar només la teva llar:
--     select * from llars;
--  Sense sessió (clau anon pelada), ha de tornar 0 files.
-- ============================================================
