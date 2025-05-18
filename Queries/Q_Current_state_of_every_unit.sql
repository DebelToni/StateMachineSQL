SELECT u.id           AS unit_id,
       u.unit_name,
       s.state_name    AS current_state,
       l.ts            AS state_since,
       u.unit_details  AS details
FROM   sm.sm_unit u
JOIN   LATERAL (
        SELECT final_state_id AS state_id, ts
        FROM   sm.sm_log
        WHERE  unit_id = u.id
        ORDER  BY ts DESC
        LIMIT  1
       ) l ON true
JOIN   sm.state s ON s.id = l.state_id
ORDER  BY l.ts DESC;
