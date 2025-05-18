-- 04_views.sql
-- Window-function view: 1 line per time a unit *entered* a state,
-- plus the timestamp it *left* that state (NULL = still there).

CREATE OR REPLACE VIEW sm.v_state_durations AS
SELECT  unit_id,
        initial_state_id AS state_id,
        ts                           AS entered_at,
        lead(ts) OVER (PARTITION BY unit_id ORDER BY ts)
                                   AS left_at
FROM    sm.sm_log;

