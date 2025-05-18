--create or replace function sm.new_sm_unit (details jsonb, arg_unit_name text) returns integer
--language sql
--as
--$$
--	insert into sm.sm_unit(unit_name, unit_details)
--	values(
--	arg_unit_name, details
--	)
--	returning id;
--$$;

create or replace function sm.new_sm_unit (
  details       jsonb,
  arg_unit_name text
) returns integer
language plpgsql as
$$
declare
  running_id         integer;
  init_state integer = 0;
  neutral_state integer;
begin
  insert into sm.sm_unit(unit_name, unit_details)
    values (arg_unit_name, details)
    returning id into running_id;

  select id
    into neutral_state
  from sm.state
  where state_name = 'neutral';

  if neutral_state is null then
    raise exception 'no state neutral';
  end if;

  insert into sm.sm_log(unit_id, initial_state_id, final_state_id, payload)
    values (running_id, neutral_state, neutral_state, details);

  return running_id;
end;
$$;


select sm.new_sm_unit('{"MIF": "AEG washing machine", "SN": "12345", "Customer": "Gergana"}', 'Service call Gergana');
select sm.new_sm_unit('{"MIF": "Philips Hair dryer", "SN": "54321", "Customer": "Boryana"}', 'Service call Boryana');
select sm.new_sm_unit('{"MIF": "Plumbing", "Symptom": "leak", "SN": null, "Customer": "Stefan"}', 'Service call Stefan');

--create or replace function handle_signal(unit_id integer, signal_id integer, details jsonb) returns integer
create or replace function sm.handle_signal (
  arg_unit_id  integer,
  arg_signal_id integer,
  arg_details   jsonb
) returns integer
language plpgsql as
$$
declare
  cur_state   integer;
  out_state   integer;
  handler_fn  text;
begin
  select final_state_id
    into cur_state
  from sm.sm_log
  where unit_id = arg_unit_id
  order by ts desc
  limit 1;

  if cur_state is null then
    select id
      into cur_state
    from sm.state
    where state_name = 'neutral';
  end if;

  select out_state_id, transition_handler
    into out_state, handler_fn
  from sm.transition
  where signal_id    = arg_signal_id
    and in_state_id  = cur_state;

  if not found then
    raise exception 'no transition defined for signal % in state %',
      arg_signal_id, cur_state;
  end if;

  if handler_fn <> '' then
    execute format('select %I(%L, %L, %L)',
                   handler_fn,
                   arg_unit_id,
                   arg_signal_id,
                   arg_details::text);
  end if;

  insert into sm.sm_log(unit_id, initial_state_id, final_state_id, payload)
    values (arg_unit_id, cur_state, out_state, arg_details);

  return out_state;
end;
$$;


--create or replace function sm.unit_status(arg_unit_id integer) returns table (status_id integer, status_name text, details jsonb)
--language plpgsql
--as
--$$
--	declare
--		var_state integer;
--		var_payload jsonb;
--		INITIAL_STATE constant integer default 0;
--	begin
--		select final_state_id, payload into var_state, var_payload from sm.sm_log
--		where arg_unit_id=unit_id order by ts desc limit 1;
--		status_id := COALESCE(var_state, INITIAL_STATE);
--		status_name := (select state_name from sm.state where id=status_id);
--		details := COALESCE(var_payload,
--			(
--			select unit_details from sm.sm_unit where id=unit_id
--			)
--		);
--		return next;
--	end;
--$$;
create or replace function sm.unit_status(
  arg_unit_id INTEGER
) returns table (
  status_id   INTEGER,
  status_name TEXT,
  details     JSONB
)
language plpgsql as
$$
declare
  var_state   integer;
  var_payload jsonb;
  initial_state constant integer :=
    (select id from sm.state where state_name = 'neutral');
begin
  select final_state_id, payload
    into var_state, var_payload
  from sm.sm_log
  where unit_id = arg_unit_id
  order by ts desc
  limit 1;

  status_id   := coalesce(var_state, initial_state);
  status_name := (select state_name
                    from sm.state
                    where id = status_id);
  details     := coalesce(
                   var_payload,
                   (select unit_details
                      from sm.sm_unit
                      where id = arg_unit_id)
                 );
  return next;
end;
$$;


select sm.unit_status(1);
select sm.unit_status(2);
select sm.unit_status(3);
select sm.unit_status(4);
	
	
drop table if exists sm.sm_log;
create table if not exists sm.sm_log(
	unit_id integer not null references sm.sm_unit(id), 
	initial_state_id integer not null references sm.state(id), 
	final_state_id integer not null references sm.state(id), 
	payload jsonb,
	signal_id integer references sm.signal(id), 
	ts timestamptz not null default current_timestamp
);



