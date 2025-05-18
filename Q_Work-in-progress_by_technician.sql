SELECT l.payload->>'tech'          AS technician,
       s.state_name                AS state,
       COUNT(*)                    AS cnt
FROM   sm.sm_log l
JOIN   sm.state s ON s.id = l.final_state_id
JOIN  (               -- keep only the latest row per unit
       SELECT DISTINCT ON (unit_id) id
       FROM   sm.sm_log
       ORDER  BY unit_id, ts DESC
      ) last ON last.id = l.id
GROUP  BY technician, state
ORDER  BY technician, state;
