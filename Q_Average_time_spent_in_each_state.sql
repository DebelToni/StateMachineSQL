SELECT st.state_name,
       ROUND(AVG(EXTRACT(EPOCH FROM (d.left_at - d.entered_at)))/60) AS avg_minutes
FROM   sm.v_state_durations d
JOIN   sm.state st ON st.id = d.state_id
WHERE  d.left_at IS NOT NULL       -- still open rows have NULL
GROUP  BY st.state_name
ORDER  BY avg_minutes DESC;
