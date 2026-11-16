-- Дополнительная миграция Neon: exclusion constraint + allowed_durations 30-мин шаги
create extension if not exists btree_gist;

alter table reservations drop constraint if exists reservations_no_overlap;
alter table reservations
  add constraint reservations_no_overlap
  exclude using gist (court_id with =, tstzrange(start_at, end_at) with &&)
  where (status = 'confirmed');

update club_settings set allowed_durations = '{30,60,90}' where id = 1;
