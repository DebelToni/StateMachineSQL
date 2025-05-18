WITH seq AS (
  SELECT unit_id,
         final_state_id,
         COUNT(*) AS occurrences
  FROM   sm.sm_log
  GROUP  BY unit_id, final_state_id
)
SELECT u.unit_name,
       s.state_name,
       seq.occurrences
FROM   seq
JOIN   sm.state s   ON s.id = seq.final_state_id
JOIN   sm.sm_unit u ON u.id = seq.unit_id
WHERE  seq.occurrences >= 3
ORDER  BY seq.occurrences DESC;
