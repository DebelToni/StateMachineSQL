WITH latest AS (
  SELECT unit_id, final_state_id AS state_id, ts AS entered_at
  FROM   (
          SELECT unit_id, final_state_id, ts,
                 ROW_NUMBER() OVER (PARTITION BY unit_id ORDER BY ts DESC) AS rn
          FROM   sm.sm_log
        ) t
  WHERE  rn = 1
)
SELECT u.id, u.unit_name, s.state_name, latest.entered_at,
       EXTRACT(EPOCH FROM (clock_timestamp() - latest.entered_at))/3600 AS hours_in_state
FROM   latest
JOIN   sm.sm_unit u ON u.id = latest.unit_id
JOIN   sm.state   s ON s.id = latest.state_id
WHERE  s.state_name IN ('parts missing','assigned')      -- customise
  AND  clock_timestamp() - latest.entered_at > INTERVAL '24 hours'      -- SLA
ORDER  BY hours_in_state DESC;
