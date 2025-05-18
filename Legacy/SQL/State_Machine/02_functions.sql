-- 02_functions.sql
-- Behaviour of the state-machine.  All functions live in schema sm.

----------------------------------------------------------------
-- Helper: create a unit in the *initial* state
----------------------------------------------------------------
CREATE OR REPLACE FUNCTION sm.new_sm_unit (
    details       jsonb,
    arg_unit_name text
) RETURNS bigint
LANGUAGE plpgsql AS
$$
DECLARE
    running_id    bigint;
    init_state_id bigint;
BEGIN
    SELECT id INTO init_state_id
    FROM   sm.state
    WHERE  is_initial
    LIMIT  1;

    IF init_state_id IS NULL THEN
        RAISE EXCEPTION 'No initial state flagged in sm.state';
    END IF;

    INSERT INTO sm.sm_unit(unit_name, unit_details)
    VALUES (arg_unit_name, details)
    RETURNING id INTO running_id;

    INSERT INTO sm.sm_log(unit_id, initial_state_id, final_state_id, payload)
    VALUES (running_id, init_state_id, init_state_id, details);

    RETURN running_id;
END;
$$;

----------------------------------------------------------------
-- Main workflow: apply a signal to a unit
----------------------------------------------------------------
CREATE OR REPLACE FUNCTION sm.handle_signal (
    arg_unit_id   bigint,
    arg_signal_id bigint,
    arg_details   jsonb
) RETURNS bigint
LANGUAGE plpgsql AS
$$
DECLARE
    cur_state   bigint;
    out_state   bigint;
    handler_fn  regprocedure;
BEGIN
    SELECT final_state_id                       -- latest state
    INTO   cur_state
    FROM   sm.sm_log
    WHERE  unit_id = arg_unit_id
    ORDER  BY ts DESC
    LIMIT  1;

    IF cur_state IS NULL THEN
        SELECT id INTO cur_state
        FROM   sm.state
        WHERE  is_initial
        LIMIT  1;
    END IF;

    SELECT out_state_id, transition_handler
    INTO   out_state, handler_fn
    FROM   sm.transition
    WHERE  signal_id   = arg_signal_id
      AND  in_state_id = cur_state;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'No transition defined for signal % in state %',
                        arg_signal_id, cur_state;
    END IF;

    -- optional side-effects
    IF handler_fn IS NOT NULL THEN
        PERFORM handler_fn(arg_unit_id, arg_signal_id, arg_details);
    END IF;

    INSERT INTO sm.sm_log(unit_id, initial_state_id, final_state_id,
                          payload, signal_id)
    VALUES (arg_unit_id, cur_state, out_state,
            arg_details, arg_signal_id);

    RETURN out_state;
END;
$$;

----------------------------------------------------------------
-- Current status of a unit
----------------------------------------------------------------
CREATE OR REPLACE FUNCTION sm.unit_status (
    arg_unit_id bigint
) RETURNS TABLE (
    status_id   bigint,
    status_name text,
    details     jsonb
)
LANGUAGE plpgsql AS
$$
DECLARE
    var_state     bigint;
    var_payload   jsonb;
    init_state_id bigint;
BEGIN
    SELECT id INTO init_state_id
    FROM   sm.state
    WHERE  is_initial
    LIMIT  1;

    SELECT final_state_id, payload
    INTO   var_state, var_payload
    FROM   sm.sm_log
    WHERE  unit_id = arg_unit_id
    ORDER  BY ts DESC
    LIMIT  1;

    status_id := COALESCE(var_state, init_state_id);
    SELECT state_name INTO status_name
    FROM   sm.state
    WHERE  id = status_id;

    details   := COALESCE(
                   var_payload,
                   (SELECT unit_details
                    FROM   sm.sm_unit
                    WHERE  id = arg_unit_id)
                 );

    RETURN NEXT;
END;
$$;

----------------------------------------------------------------
-- Example no-op handler (can be referenced in sm.transition)
----------------------------------------------------------------
CREATE OR REPLACE FUNCTION sm.default_handler (
    arg_unit_id   bigint,
    arg_signal_id bigint,
    arg_payload   jsonb
) RETURNS void
LANGUAGE plpgsql AS
$$
BEGIN
    -- put custom side-effects here (e.g. notifications)
END;
$$;

