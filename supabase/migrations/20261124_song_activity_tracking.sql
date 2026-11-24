begin;

create table if not exists public.song_activity_events (
  id bigint generated always as identity primary key,
  song_id uuid not null references public.songs(id) on delete cascade,
  event_type text not null check (event_type in ('stream','download')),
  visitor_hash text not null check (visitor_hash ~ '^[0-9a-f]{64}$'),
  event_date date not null default current_date,
  created_at timestamptz not null default now(),
  constraint song_activity_events_unique
    unique (song_id, event_type, visitor_hash, event_date)
);

alter table public.song_activity_events enable row level security;

revoke all on public.song_activity_events from public, anon, authenticated;
grant all on public.song_activity_events to service_role;

create or replace function public.record_song_activity(
  p_song_id uuid,
  p_event_type text,
  p_visitor_hash text
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_event_id bigint;
  v_song_id uuid;
begin
  if p_event_type is null
     or p_event_type not in ('stream','download')
     or p_visitor_hash is null
     or p_visitor_hash !~ '^[0-9a-f]{64}$' then
    return false;
  end if;

  insert into public.song_activity_events (
    song_id, event_type, visitor_hash, event_date
  )
  values (
    p_song_id, p_event_type, p_visitor_hash, current_date
  )
  on conflict on constraint song_activity_events_unique do nothing
  returning id into v_event_id;

  if v_event_id is null then
    return false;
  end if;

  if p_event_type = 'stream' then
    update public.songs
    set streams = coalesce(streams, 0) + 1
    where id = p_song_id
      and status = 'published'
      and payment_status = 'paid'
      and removed_at is null
    returning id into v_song_id;
  else
    update public.songs
    set downloads = coalesce(downloads, 0) + 1
    where id = p_song_id
      and status = 'published'
      and payment_status = 'paid'
      and removed_at is null
    returning id into v_song_id;
  end if;

  if v_song_id is null then
    delete from public.song_activity_events where id = v_event_id;
    return false;
  end if;

  return true;
end;
$$;

revoke all on function public.record_song_activity(uuid, text, text)
from public, anon, authenticated;

grant execute on function public.record_song_activity(uuid, text, text)
to service_role;

commit;
