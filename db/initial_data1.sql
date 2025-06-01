-- 06_extended_example_data.sql
-- Populates the state machine with more diverse and realistic repair job data
-- This creates various scenarios including stuck jobs, different technicians, and edge cases

BEGIN;

DO $$
DECLARE
    -- Unit IDs for tracking
    unit_gamma_id bigint;
    unit_delta_id bigint;
    unit_epsilon_id bigint;
    unit_zeta_id bigint;
    unit_eta_id bigint;
    unit_theta_id bigint;
    unit_iota_id bigint;
    unit_kappa_id bigint;

    -- Signal IDs (fetched for clarity)
    s_customer_call bigint := (SELECT id FROM sm.signal WHERE signal_name = 'customer call');
    s_assign bigint := (SELECT id FROM sm.signal WHERE signal_name = 'assign');
    s_dispatch bigint := (SELECT id FROM sm.signal WHERE signal_name = 'dispatch');
    s_arrive bigint := (SELECT id FROM sm.signal WHERE signal_name = 'arrive');
    s_parts_missing bigint := (SELECT id FROM sm.signal WHERE signal_name = 'parts missing');
    s_parts_picked_ok bigint := (SELECT id FROM sm.signal WHERE signal_name = 'parts picked ok');
    s_parts_picked_failed bigint := (SELECT id FROM sm.signal WHERE signal_name = 'parts picked failed');
    s_finished_work_ok bigint := (SELECT id FROM sm.signal WHERE signal_name = 'finished work ok');
    s_finished_work_failed bigint := (SELECT id FROM sm.signal WHERE signal_name = 'finished work failed');
    s_customer_notification bigint := (SELECT id FROM sm.signal WHERE signal_name = 'customer notification');
    s_time_interval bigint := (SELECT id FROM sm.signal WHERE signal_name = 'time interval');

BEGIN
    RAISE NOTICE 'Populating extended example data...';

    ----------------------------------------------------------------
    -- Unit 3: "Gamma" - Stuck in Parts Missing (SLA Breach)
    ----------------------------------------------------------------
    RAISE NOTICE 'Creating Unit Gamma (stuck in parts missing)...';
    unit_gamma_id := sm.new_sm_unit(
        arg_unit_name := 'Repair Job Gamma',
        details := '{"customer_name": "Charlie Tech", "device_type": "Gaming Desktop", "issue_reported": "Graphics card failure", "priority": "high"}'::jsonb
    );

    -- Fast progression to parts missing, then stuck there
    PERFORM sm.handle_signal(unit_gamma_id, s_customer_call, '{"call_reference": "CALL-003", "tech": "Sarah"}'::jsonb);
    PERFORM sm.handle_signal(unit_gamma_id, s_assign, '{"tech": "Mike Wilson", "technician_id": "TECH-001"}'::jsonb);
    PERFORM sm.handle_signal(unit_gamma_id, s_dispatch, '{"tech": "Mike Wilson", "dispatch_vehicle": "VAN-C"}'::jsonb);
    PERFORM sm.handle_signal(unit_gamma_id, s_arrive, '{"tech": "Mike Wilson"}'::jsonb);
    PERFORM sm.handle_signal(unit_gamma_id, s_parts_missing, '{"tech": "Mike Wilson", "missing_part_sku": "GPU-RTX4080", "reason": "Special order required"}'::jsonb);

    -- Simulate this happened 3 days ago by backdating the last entry
    UPDATE sm.sm_log
    SET ts = ts - interval '3 days'
    WHERE unit_id = unit_gamma_id;

    ----------------------------------------------------------------
    -- Unit 4: "Delta" - Stuck in Assigned (SLA Breach)
    ----------------------------------------------------------------
    RAISE NOTICE 'Creating Unit Delta (stuck in assigned)...';
    unit_delta_id := sm.new_sm_unit(
        arg_unit_name := 'Repair Job Delta',
        details := '{"customer_name": "Diana Prince", "device_type": "Tablet Pro", "issue_reported": "Screen not responding to touch"}'::jsonb
    );

    PERFORM sm.handle_signal(unit_delta_id, s_customer_call, '{"call_reference": "CALL-004", "tech": "Reception"}'::jsonb);
    PERFORM sm.handle_signal(unit_delta_id, s_assign, '{"tech": "Lisa Chen", "technician_id": "TECH-002"}'::jsonb);

    -- Backdate to simulate assignment 2 days ago
    UPDATE sm.sm_log
    SET ts = ts - interval '2 days'
    WHERE unit_id = unit_delta_id AND final_state_id = (SELECT id FROM sm.state WHERE state_name = 'assigned');

    ----------------------------------------------------------------
    -- Unit 5: "Epsilon" - Multiple Failed Parts Attempts
    ----------------------------------------------------------------
    RAISE NOTICE 'Creating Unit Epsilon (multiple parts failures)...';
    unit_epsilon_id := sm.new_sm_unit(
        arg_unit_name := 'Repair Job Epsilon',
        details := '{"customer_name": "Edward Norton", "device_type": "Smart TV", "issue_reported": "Power supply issues"}'::jsonb
    );

    PERFORM sm.handle_signal(unit_epsilon_id, s_customer_call, '{"call_reference": "CALL-005"}'::jsonb);
    PERFORM sm.handle_signal(unit_epsilon_id, s_assign, '{"tech": "James Rodriguez", "technician_id": "TECH-003"}'::jsonb);
    PERFORM sm.handle_signal(unit_epsilon_id, s_dispatch, '{"tech": "James Rodriguez"}'::jsonb);
    PERFORM sm.handle_signal(unit_epsilon_id, s_arrive, '{"tech": "James Rodriguez"}'::jsonb);
    PERFORM sm.handle_signal(unit_epsilon_id, s_parts_missing, '{"tech": "James Rodriguez", "missing_part_sku": "PSU-TV42"}'::jsonb);
    PERFORM sm.handle_signal(unit_epsilon_id, s_parts_picked_failed, '{"tech": "James Rodriguez", "reason": "Wrong voltage spec"}'::jsonb);
    -- Now back to assigned, waiting for correct part

    ----------------------------------------------------------------
    -- Unit 6: "Zeta" - Quick Success Job
    ----------------------------------------------------------------
    RAISE NOTICE 'Creating Unit Zeta (quick success)...';
    unit_zeta_id := sm.new_sm_unit(
        arg_unit_name := 'Repair Job Zeta',
        details := '{"customer_name": "Zoe Anderson", "device_type": "Wireless Router", "issue_reported": "No internet connection"}'::jsonb
    );

    -- Complete successful workflow
    PERFORM sm.handle_signal(unit_zeta_id, s_customer_call, '{"call_reference": "CALL-006"}'::jsonb);
    PERFORM sm.handle_signal(unit_zeta_id, s_assign, '{"tech": "Alex Kim", "technician_id": "TECH-004"}'::jsonb);
    PERFORM sm.handle_signal(unit_zeta_id, s_dispatch, '{"tech": "Alex Kim"}'::jsonb);
    PERFORM sm.handle_signal(unit_zeta_id, s_arrive, '{"tech": "Alex Kim"}'::jsonb);
    PERFORM sm.handle_signal(unit_zeta_id, s_finished_work_ok, '{"tech": "Alex Kim", "work_summary": "Reset configuration and updated firmware"}'::jsonb);
    PERFORM sm.handle_signal(unit_zeta_id, s_customer_notification, '{"notification_method": "Email", "message_sent": "Router repair completed"}'::jsonb);

    ----------------------------------------------------------------
    -- Unit 7: "Eta" - Failed Job (Terminal State via different path)
    ----------------------------------------------------------------
    RAISE NOTICE 'Creating Unit Eta (work failed, escalated)...';
    unit_eta_id := sm.new_sm_unit(
        arg_unit_name := 'Repair Job Eta',
        details := '{"customer_name": "Henry Ford", "device_type": "Vintage Radio", "issue_reported": "No sound output"}'::jsonb
    );

    PERFORM sm.handle_signal(unit_eta_id, s_customer_call, '{"call_reference": "CALL-007"}'::jsonb);
    PERFORM sm.handle_signal(unit_eta_id, s_assign, '{"tech": "Maria Santos", "technician_id": "TECH-005"}'::jsonb);
    PERFORM sm.handle_signal(unit_eta_id, s_dispatch, '{"tech": "Maria Santos"}'::jsonb);
    PERFORM sm.handle_signal(unit_eta_id, s_arrive, '{"tech": "Maria Santos"}'::jsonb);
    PERFORM sm.handle_signal(unit_eta_id, s_finished_work_failed, '{"tech": "Maria Santos", "reason": "Vintage parts no longer available"}'::jsonb);
    -- Now in parts missing, needs escalation
    PERFORM sm.handle_signal(unit_eta_id, s_time_interval, '{"check_type": "Escalation review"}'::jsonb);
    -- Back to assigned for specialist consultation

    ----------------------------------------------------------------
    -- Unit 8: "Theta" - Currently Dispatched
    ----------------------------------------------------------------
    RAISE NOTICE 'Creating Unit Theta (currently dispatched)...';
    unit_theta_id := sm.new_sm_unit(
        arg_unit_name := 'Repair Job Theta',
        details := '{"customer_name": "Thomas Edison", "device_type": "Home Security Camera", "issue_reported": "Night vision not working"}'::jsonb
    );

    PERFORM sm.handle_signal(unit_theta_id, s_customer_call, '{"call_reference": "CALL-008"}'::jsonb);
    PERFORM sm.handle_signal(unit_theta_id, s_assign, '{"tech": "Nina Patel", "technician_id": "TECH-006"}'::jsonb);
    PERFORM sm.handle_signal(unit_theta_id, s_dispatch, '{"tech": "Nina Patel", "eta": "45 minutes"}'::jsonb);
    -- Currently dispatched - tech is on the way

    ----------------------------------------------------------------
    -- Unit 9: "Iota" - In Service (Active Work)
    ----------------------------------------------------------------
    RAISE NOTICE 'Creating Unit Iota (actively being serviced)...';
    unit_iota_id := sm.new_sm_unit(
        arg_unit_name := 'Repair Job Iota',
        details := '{"customer_name": "Iris Chang", "device_type": "Coffee Machine", "issue_reported": "Not heating water properly"}'::jsonb
    );

    PERFORM sm.handle_signal(unit_iota_id, s_customer_call, '{"call_reference": "CALL-009"}'::jsonb);
    PERFORM sm.handle_signal(unit_iota_id, s_assign, '{"tech": "Oliver Chen", "technician_id": "TECH-007"}'::jsonb);
    PERFORM sm.handle_signal(unit_iota_id, s_dispatch, '{"tech": "Oliver Chen"}'::jsonb);
    PERFORM sm.handle_signal(unit_iota_id, s_arrive, '{"tech": "Oliver Chen"}'::jsonb);
    -- Currently in "start of service" - actively being worked on

    ----------------------------------------------------------------
    -- Unit 10: "Kappa" - Complex Journey with Multiple State Changes
    ----------------------------------------------------------------
    RAISE NOTICE 'Creating Unit Kappa (complex journey)...';
    unit_kappa_id := sm.new_sm_unit(
        arg_unit_name := 'Repair Job Kappa',
        details := '{"customer_name": "Kevin Spacey", "device_type": "Industrial Printer", "issue_reported": "Paper jams constantly"}'::jsonb
    );

    PERFORM sm.handle_signal(unit_kappa_id, s_customer_call, '{"call_reference": "CALL-010"}'::jsonb);
    PERFORM sm.handle_signal(unit_kappa_id, s_assign, '{"tech": "Rachel Green", "technician_id": "TECH-008"}'::jsonb);
    PERFORM sm.handle_signal(unit_kappa_id, s_dispatch, '{"tech": "Rachel Green"}'::jsonb);
    PERFORM sm.handle_signal(unit_kappa_id, s_arrive, '{"tech": "Rachel Green"}'::jsonb);
    PERFORM sm.handle_signal(unit_kappa_id, s_parts_missing, '{"tech": "Rachel Green", "missing_part_sku": "ROLLER-IP200"}'::jsonb);
    PERFORM sm.handle_signal(unit_kappa_id, s_parts_picked_ok, '{"tech": "Rachel Green", "part_received_sku": "ROLLER-IP200"}'::jsonb);
    PERFORM sm.handle_signal(unit_kappa_id, s_parts_missing, '{"tech": "Rachel Green", "missing_part_sku": "SENSOR-JAM", "reason": "Additional part needed after inspection"}'::jsonb);
    PERFORM sm.handle_signal(unit_kappa_id, s_parts_picked_ok, '{"tech": "Rachel Green", "part_received_sku": "SENSOR-JAM"}'::jsonb);
    PERFORM sm.handle_signal(unit_kappa_id, s_finished_work_ok, '{"tech": "Rachel Green", "work_summary": "Replaced roller and jam sensor"}'::jsonb);
    PERFORM sm.handle_signal(unit_kappa_id, s_customer_notification, '{"notification_method": "Phone", "message_sent": "Printer repair completed successfully"}'::jsonb);

    ----------------------------------------------------------------
    -- Add some historical data by backdating completed jobs
    ----------------------------------------------------------------
    RAISE NOTICE 'Adding historical data...';

    -- Backdate Unit Zeta completion to yesterday
    UPDATE sm.sm_log
    SET ts = ts - interval '1 day'
    WHERE unit_id = unit_zeta_id;

    -- Backdate Unit Kappa to 5 days ago
    UPDATE sm.sm_log
    SET ts = ts - interval '5 days'
    WHERE unit_id = unit_kappa_id;

    RAISE NOTICE 'Extended example data population finished.';
    RAISE NOTICE 'Current state summary:';
    RAISE NOTICE '- Units stuck in parts missing (SLA breach): Gamma';
    RAISE NOTICE '- Units stuck in assigned (SLA breach): Delta, Eta';
    RAISE NOTICE '- Units dispatched: Theta';
    RAISE NOTICE '- Units in active service: Iota';
    RAISE NOTICE '- Completed units: Alpha, Zeta, Kappa';
    RAISE NOTICE '- Units with parts issues: Beta (assigned), Epsilon (assigned)';
END;
$$;

----------------------------------------------------------------
-- Create additional historical jobs with simpler approach
----------------------------------------------------------------
DO $$
DECLARE
    s_customer_call bigint := (SELECT id FROM sm.signal WHERE signal_name = 'customer call');
    s_assign bigint := (SELECT id FROM sm.signal WHERE signal_name = 'assign');
    s_dispatch bigint := (SELECT id FROM sm.signal WHERE signal_name = 'dispatch');
    s_arrive bigint := (SELECT id FROM sm.signal WHERE signal_name = 'arrive');
    s_finished_work_ok bigint := (SELECT id FROM sm.signal WHERE signal_name = 'finished work ok');
    s_finished_work_failed bigint := (SELECT id FROM sm.signal WHERE signal_name = 'finished work failed');
    s_customer_notification bigint := (SELECT id FROM sm.signal WHERE signal_name = 'customer notification');

    temp_unit_id bigint;
BEGIN
    RAISE NOTICE 'Adding historical quick jobs...';

    -- Quick Job 1 (Success) - 1 day ago
    temp_unit_id := sm.new_sm_unit(
        arg_unit_name := 'Quick Job 1',
        details := '{"customer_name": "Customer 1", "device_type": "Quick Fix"}'::jsonb
    );
    PERFORM sm.handle_signal(temp_unit_id, s_customer_call, '{"call_reference": "QUICK-1"}'::jsonb);
    PERFORM sm.handle_signal(temp_unit_id, s_assign, '{"tech": "Quick Tech"}'::jsonb);
    PERFORM sm.handle_signal(temp_unit_id, s_dispatch, '{"tech": "Quick Tech"}'::jsonb);
    PERFORM sm.handle_signal(temp_unit_id, s_arrive, '{"tech": "Quick Tech"}'::jsonb);
    PERFORM sm.handle_signal(temp_unit_id, s_finished_work_ok, '{"tech": "Quick Tech"}'::jsonb);
    PERFORM sm.handle_signal(temp_unit_id, s_customer_notification, '{"notification_method": "SMS"}'::jsonb);
    UPDATE sm.sm_log SET ts = ts - interval '1 day' WHERE unit_id = temp_unit_id;

    -- Quick Job 2 (Failed) - 2 days ago
    temp_unit_id := sm.new_sm_unit(
        arg_unit_name := 'Quick Job 2',
        details := '{"customer_name": "Customer 2", "device_type": "Quick Fix"}'::jsonb
    );
    PERFORM sm.handle_signal(temp_unit_id, s_customer_call, '{"call_reference": "QUICK-2"}'::jsonb);
    PERFORM sm.handle_signal(temp_unit_id, s_assign, '{"tech": "Quick Tech"}'::jsonb);
    PERFORM sm.handle_signal(temp_unit_id, s_dispatch, '{"tech": "Quick Tech"}'::jsonb);
    PERFORM sm.handle_signal(temp_unit_id, s_arrive, '{"tech": "Quick Tech"}'::jsonb);
    PERFORM sm.handle_signal(temp_unit_id, s_finished_work_failed, '{"tech": "Quick Tech"}'::jsonb);
    UPDATE sm.sm_log SET ts = ts - interval '2 days' WHERE unit_id = temp_unit_id;

    -- Quick Job 3 (Success) - 3 days ago
    temp_unit_id := sm.new_sm_unit(
        arg_unit_name := 'Quick Job 3',
        details := '{"customer_name": "Customer 3", "device_type": "Quick Fix"}'::jsonb
    );
    PERFORM sm.handle_signal(temp_unit_id, s_customer_call, '{"call_reference": "QUICK-3"}'::jsonb);
    PERFORM sm.handle_signal(temp_unit_id, s_assign, '{"tech": "Quick Tech"}'::jsonb);
    PERFORM sm.handle_signal(temp_unit_id, s_dispatch, '{"tech": "Quick Tech"}'::jsonb);
    PERFORM sm.handle_signal(temp_unit_id, s_arrive, '{"tech": "Quick Tech"}'::jsonb);
    PERFORM sm.handle_signal(temp_unit_id, s_finished_work_ok, '{"tech": "Quick Tech"}'::jsonb);
    PERFORM sm.handle_signal(temp_unit_id, s_customer_notification, '{"notification_method": "SMS"}'::jsonb);
    UPDATE sm.sm_log SET ts = ts - interval '3 days' WHERE unit_id = temp_unit_id;

    RAISE NOTICE 'Added 3 historical quick jobs for throughput data.';
END;
$$;

----------------------------------------------------------------
-- Add some units that are just registered
----------------------------------------------------------------
DO $$
DECLARE
    s_customer_call bigint := (SELECT id FROM sm.signal WHERE signal_name = 'customer call');
    temp_unit_id bigint;
BEGIN
    RAISE NOTICE 'Adding newly registered units...';

    -- Incoming Job 1
    temp_unit_id := sm.new_sm_unit(
        arg_unit_name := 'Incoming Job 1',
        details := '{"customer_name": "New Customer 1", "device_type": "Pending Assessment"}'::jsonb
    );
    PERFORM sm.handle_signal(temp_unit_id, s_customer_call, '{"call_reference": "NEW-1"}'::jsonb);

    -- Incoming Job 2
    temp_unit_id := sm.new_sm_unit(
        arg_unit_name := 'Incoming Job 2',
        details := '{"customer_name": "New Customer 2", "device_type": "Pending Assessment"}'::jsonb
    );
    PERFORM sm.handle_signal(temp_unit_id, s_customer_call, '{"call_reference": "NEW-2"}'::jsonb);

    -- Incoming Job 3
    temp_unit_id := sm.new_sm_unit(
        arg_unit_name := 'Incoming Job 3',
        details := '{"customer_name": "New Customer 3", "device_type": "Pending Assessment"}'::jsonb
    );
    PERFORM sm.handle_signal(temp_unit_id, s_customer_call, '{"call_reference": "NEW-3"}'::jsonb);

    RAISE NOTICE 'Added 3 newly registered units awaiting assignment.';
END;
$$;

COMMIT;

----------------------------------------------------------------
-- Verification queries to check the populated data
----------------------------------------------------------------

-- Check current state distribution
SELECT s.state_name, COUNT(*) as unit_count
FROM sm.sm_unit u
JOIN LATERAL (
    SELECT final_state_id
    FROM sm.sm_log l
    WHERE l.unit_id = u.id
    ORDER BY ts DESC
    LIMIT 1
) latest ON true
JOIN sm.state s ON s.id = latest.final_state_id
GROUP BY s.state_name
ORDER BY unit_count DESC;

-- Check technician workload
SELECT
    l.payload ->> 'tech' AS technician,
    s.state_name,
    COUNT(*) as workload
FROM sm.sm_log l
JOIN sm.state s ON s.id = l.final_state_id
JOIN (
    SELECT DISTINCT ON (unit_id) id
    FROM sm.sm_log
    ORDER BY unit_id, ts DESC
) last_entries ON last_entries.id = l.id
WHERE l.payload ->> 'tech' IS NOT NULL
GROUP BY technician, s.state_name
ORDER BY technician, workload DESC;