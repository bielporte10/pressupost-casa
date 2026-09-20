-- ============================================================
--  Límits refets amb els 12 mesos reals (2026-09-20)
--  Enganxa-ho al SQL Editor de Supabase i prem Run.
--  Es pot executar més d'un cop sense fer mal.
-- ============================================================

do $$
declare v_llar uuid;
begin
  select id into v_llar from public.llars limit 1;
  if v_llar is null then raise exception 'No hi ha cap llar creada.'; end if;

  -- ---- límits de casa: es queden com el gasto real, no es retallen ----
  update public.categories set limit_mes=700 where llar_id=v_llar and nom='Supermercat';
  update public.categories set limit_mes=290 where llar_id=v_llar and nom='Cotxe: benzina i pàrquing';
  update public.categories set limit_mes=155 where llar_id=v_llar and nom='Farmàcia, metges i dentista';
  update public.categories set limit_mes= 85 where llar_id=v_llar and nom='Llar i manteniment';
  update public.categories set limit_mes= 60 where llar_id=v_llar and nom='Veterinari';
  update public.categories set limit_mes= 20 where llar_id=v_llar and nom='Transport públic';

  -- ---- família: aquí sí que es retalla ----
  update public.categories set limit_mes=400 where llar_id=v_llar and nom='Restaurants i sortides';
  update public.categories set limit_mes=150 where llar_id=v_llar and nom='Fons de vacances';

  -- ---- imprevistos: bloc propi i 300 € ----
  update public.categories
     set limit_mes=300, bloc='IMPREVISTOS', ordre=99
   where llar_id=v_llar and nom='Imprevistos';

  -- ---- fora el marge: ja no cal, ara es veu gairebé tot ----
  -- Els moviments que hi hagués apuntats es queden sense categoria,
  -- o sigui que passarien a comptar com a butxaca. Per això primer
  -- els movem a Imprevistos.
  update public.moviments
     set categoria_id = (select id from public.categories
                          where llar_id=v_llar and nom='Imprevistos')
   where categoria_id in (select id from public.categories
                           where llar_id=v_llar and nom='Pendent d''assignar');
  delete from public.categories where llar_id=v_llar and nom='Pendent d''assignar';

  -- ---- els números de base ----
  update public.config
     set ingressos=7083.81,   -- mitjana de l'any, amb les pagues extres
         fixos=3723.67,       -- mesurat sobre els últims 12 mesos
         objectiu=500
   where llar_id=v_llar;

  -- ---- butxaques ----
  update public.membres set butxaca=420 where llar_id=v_llar and nom='Marc';
  update public.membres set butxaca=280 where llar_id=v_llar and nom='Isabel';

  raise notice 'Límits actualitzats.';
end $$;

-- Comprovació: ha de sumar 2.860 €
select bloc, nom, limit_mes from public.categories order by ordre;
select sum(limit_mes) as categories,
       (select sum(butxaca) from public.membres) as butxaques,
       sum(limit_mes) + (select sum(butxaca) from public.membres) as total_variable
from public.categories;
