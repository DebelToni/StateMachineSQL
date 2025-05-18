SELECT s_in.state_name  AS from_state,
       sig.signal_name,
       s_out.state_name AS to_state,
       COUNT(*)         AS cnt
FROM   sm.sm_log l
JOIN   sm.state  s_in  ON s_in.id  = l.initial_state_id
JOIN   sm.state  s_out ON s_out.id = l.final_state_id
JOIN   sm.signal sig   ON sig.id   = l.signal_id
GROUP  BY 1,2,3
ORDER  BY cnt DESC;
