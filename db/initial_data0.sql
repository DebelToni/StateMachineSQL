-- 05_example_data.sql
-- Populates the state machine with example units and their lifecycles.

BEGIN;

-- Declare variables to hold the IDs of the units we create
DO $$
DECLARE
    unit_alpha_id bigint;
    unit_beta_id bigint;

    -- Signal IDs (fetched for clarity and to avoid magic numbers)
    s_customer_call bigint := (SELECT id FROM sm.signal WHERE signal_name = 'customer call');
    s_assign bigint := (SELECT id FROM sm.signal WHERE signal_name = 'assign');
    s_dispatch bigint := (SELECT id FROM sm.signal WHERE signal_name = 'dispatch');
    s_arrive bigint := (SELECT id FROM sm.signal WHERE signal_name = 'arrive');
    s_parts_missing bigint := (SELECT id FROM sm.signal WHERE signal_name = 'parts missing');
    s_parts_picked_ok bigint := (SELECT id FROM sm.signal WHERE signal_name = 'parts picked ok');
    s_finished_work_ok bigint := (SELECT id FROM sm.signal WHERE signal_name = 'finished work ok');
    s_finished_work_failed bigint := (SELECT id FROM sm.signal WHERE signal_name = 'finished work failed');
    s_customer_notification bigint := (SELECT id FROM sm.signal WHERE signal_name = 'customer notification');
    s_time_interval bigint := (SELECT id FROM sm.signal WHERE signal_name = 'time interval');

BEGIN
    RAISE NOTICE 'Populating example data...';

    ----------------------------------------------------------------
    -- Unit 1: "Repair Job Alpha" - Full successful lifecycle
    ----------------------------------------------------------------
    RAISE NOTICE 'Creating Unit Alpha...';
    unit_alpha_id := sm.new_sm_unit(
        arg_unit_name := 'Repair Job Alpha',
        details       := '{"customer_name": "Alice Wonderland", "device_type": "Laptop Pro", "issue_reported": "Does not turn on"}'::jsonb
    );
    RAISE NOTICE 'Unit Alpha created with ID: %', unit_alpha_id;
    -- Initial state is 'neutral', sm.new_sm_unit logs this (neutral -> neutral)

    -- Customer Call: neutral -> registered
    RAISE NOTICE 'Unit Alpha: Handling signal ''customer call''...';
    PERFORM sm.handle_signal(
        arg_unit_id   := unit_alpha_id,
        arg_signal_id := s_customer_call,
        arg_details   := '{"call_reference": "CALL-001", "caller_phone": "555-1234"}'::jsonb
    );

    -- Assign: registered -> assigned
    RAISE NOTICE 'Unit Alpha: Handling signal ''assign''...';
    PERFORM sm.handle_signal(
        arg_unit_id   := unit_alpha_id,
        arg_signal_id := s_assign,
        arg_details   := '{"technician_id": "TECH-007", "assignment_notes": "Priority task"}'::jsonb
    );

    -- Dispatch: assigned -> dispatched
    RAISE NOTICE 'Unit Alpha: Handling signal ''dispatch''...';
    PERFORM sm.handle_signal(
        arg_unit_id   := unit_alpha_id,
        arg_signal_id := s_dispatch,
        arg_details   := '{"dispatch_vehicle": "VAN-A", "eta": "30 minutes"}'::jsonb
    );

    -- Arrive: dispatched -> start of service
    RAISE NOTICE 'Unit Alpha: Handling signal ''arrive''...';
    PERFORM sm.handle_signal(
        arg_unit_id   := unit_alpha_id,
        arg_signal_id := s_arrive,
        arg_details   := '{"arrival_confirmation_by": "Technician"}'::jsonb
    );

    -- Finished Work OK: start of service -> end of service
    RAISE NOTICE 'Unit Alpha: Handling signal ''finished work ok''...';
    PERFORM sm.handle_signal(
        arg_unit_id   := unit_alpha_id,
        arg_signal_id := s_finished_work_ok,
        arg_details   := '{"work_summary": "Replaced faulty power supply.", "parts_used": ["PSU-XYZ123"]}'::jsonb
    );

    -- Customer Notification: end of service -> reported (terminal state)
    RAISE NOTICE 'Unit Alpha: Handling signal ''customer notification''...';
    PERFORM sm.handle_signal(
        arg_unit_id   := unit_alpha_id,
        arg_signal_id := s_customer_notification,
        arg_details   := '{"notification_method": "SMS", "message_sent": "Your Laptop Pro repair is complete."}'::jsonb
    );
    RAISE NOTICE 'Unit Alpha processing complete. Final state should be ''reported''.';

    ----------------------------------------------------------------
    -- Unit 2: "Repair Job Beta" - Lifecycle with parts issue
    ----------------------------------------------------------------
    RAISE NOTICE 'Creating Unit Beta...';
    unit_beta_id := sm.new_sm_unit(
        arg_unit_name := 'Repair Job Beta',
        details       := '{"customer_name": "Bob The Builder", "device_type": "Smartphone X", "issue_reported": "Cracked screen"}'::jsonb
    );
    RAISE NOTICE 'Unit Beta created with ID: %', unit_beta_id;

    -- Customer Call: neutral -> registered
    RAISE NOTICE 'Unit Beta: Handling signal ''customer call''...';
    PERFORM sm.handle_signal(
        arg_unit_id   := unit_beta_id,
        arg_signal_id := s_customer_call,
        arg_details   := '{"call_reference": "CALL-002"}'::jsonb
    );

    -- Assign: registered -> assigned
    RAISE NOTICE 'Unit Beta: Handling signal ''assign''...';
    PERFORM sm.handle_signal(
        arg_unit_id   := unit_beta_id,
        arg_signal_id := s_assign,
        arg_details   := '{"technician_id": "TECH-008"}'::jsonb
    );

    -- Dispatch: assigned -> dispatched
    RAISE NOTICE 'Unit Beta: Handling signal ''dispatch''...';
    PERFORM sm.handle_signal(
        arg_unit_id   := unit_beta_id,
        arg_signal_id := s_dispatch,
        arg_details   := '{"dispatch_vehicle": "VAN-B"}'::jsonb
    );

    -- Arrive: dispatched -> start of service
    RAISE NOTICE 'Unit Beta: Handling signal ''arrive''...';
    PERFORM sm.handle_signal(
        arg_unit_id   := unit_beta_id,
        arg_signal_id := s_arrive,
        arg_details   := '{}'::jsonb
    );

    -- Parts Missing: start of service -> parts missing
    RAISE NOTICE 'Unit Beta: Handling signal ''parts missing''...';
    PERFORM sm.handle_signal(
        arg_unit_id   := unit_beta_id,
        arg_signal_id := s_parts_missing,
        arg_details   := '{"missing_part_sku": "SCREEN-SPX", "reason": "Not in stock"}'::jsonb
    );

    -- Parts Picked OK: parts missing -> start of service
    RAISE NOTICE 'Unit Beta: Handling signal ''parts picked ok''...';
    PERFORM sm.handle_signal(
        arg_unit_id   := unit_beta_id,
        arg_signal_id := s_parts_picked_ok,
        arg_details   := '{"part_received_sku": "SCREEN-SPX"}'::jsonb
    );

    -- Finished Work Failed: start of service -> parts missing
    RAISE NOTICE 'Unit Beta: Handling signal ''finished work failed''...';
    PERFORM sm.handle_signal(
        arg_unit_id   := unit_beta_id,
        arg_signal_id := s_finished_work_failed,
        arg_details   := '{"reason": "Replacement screen also faulty", "next_step": "Re-order part"}'::jsonb
    );

    -- Time Interval (e.g. daily check): parts missing -> assigned
    RAISE NOTICE 'Unit Beta: Handling signal ''time interval''...';
    PERFORM sm.handle_signal(
        arg_unit_id   := unit_beta_id,
        arg_signal_id := s_time_interval,
        arg_details   := '{"check_type": "Daily re-assessment of parts missing items"}'::jsonb
    );
    RAISE NOTICE 'Unit Beta processing complete for now. Final state should be ''assigned''.';

    RAISE NOTICE 'Example data population finished.';
END;
$$;

COMMIT;