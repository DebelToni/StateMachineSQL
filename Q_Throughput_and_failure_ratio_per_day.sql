SELECT date_trunc('day', ts) AS day,
       COUNT(*) FILTER (WHERE sig.signal_name = 'finished work ok')     AS ok_jobs,
       COUNT(*) FILTER (WHERE sig.signal_name = 'finished work failed') AS failed_jobs
FROM   sm.sm_log l
JOIN   sm.signal sig ON sig.id = l.signal_id
GROUP  BY 1
ORDER  BY 1 DESC;
