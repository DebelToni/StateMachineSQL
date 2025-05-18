-- initial_data.sql
-- Populate state machine tables with initial lookup values and sample units/logs

BEGIN;

-- 1. States
INSERT INTO sm.state (state_name) VALUES
  ('neutral'),
  ('registered'),
  ('assigned'),
  ('dispatched'),
  ('start of service'),
  ('parts missing'),
  ('end of service'),
  ('reported');

-- 2. Signals
INSERT INTO sm.signal (signal_name) VALUES
  ('customer call'),
  ('assign'),
  ('dispatch'),
  ('arrive'),
  ('parts missing'),
  ('parts picked ok'),
  ('parts picked failed'),
  ('finished work ok'),
  ('finished work failed'),
  ('customer notification'),
  ('time interval');

-- 3. Transitions
-- lookup helper variables for clarity
WITH
  s AS (SELECT id, state_name FROM sm.state),
  g AS (SELECT id, signal_name FROM sm.signal)
INSERT INTO sm.transition (signal_id, in_state_id, out_state_id, transition_handler)
VALUES
  ((SELECT id FROM g WHERE signal_name='customer call'),   (SELECT id FROM s WHERE state_name='neutral'),           (SELECT id FROM s WHERE state_name='registered'),      ''),
  ((SELECT id FROM g WHERE signal_name='assign'),          (SELECT id FROM s WHERE state_name='registered'),        (SELECT id FROM s WHERE state_name='assigned'),        ''),
  ((SELECT id FROM g WHERE signal_name='dispatch'),        (SELECT id FROM s WHERE state_name='assigned'),          (SELECT id FROM s WHERE state_name='dispatched'),      ''),
  ((SELECT id FROM g WHERE signal_name='arrive'),          (SELECT id FROM s WHERE state_name='dispatched'),        (SELECT id FROM s WHERE state_name='start of service'), ''),
  ((SELECT id FROM g WHERE signal_name='parts missing'),   (SELECT id FROM s WHERE state_name='start of service'),  (SELECT id FROM s WHERE state_name='parts missing'),   ''),
  ((SELECT id FROM g WHERE signal_name='parts picked ok'), (SELECT id FROM s WHERE state_name='parts missing'),     (SELECT id FROM s WHERE state_name='start of service'), ''),
  ((SELECT id FROM g WHERE signal_name='parts picked failed'),
                                                          (SELECT id FROM s WHERE state_name='parts missing'),     (SELECT id FROM s WHERE state_name='assigned'),        ''),
  ((SELECT id FROM g WHERE signal_name='finished work ok'),
                                                          (SELECT id FROM s WHERE state_name='start of service'),  (SELECT id FROM s WHERE state_name='end of service'),   ''),
  ((SELECT id FROM g WHERE signal_name='finished work failed'),
                                                          (SELECT id FROM s WHERE state_name='start of service'),  (SELECT id FROM s WHERE state_name='parts missing'),   ''),
  ((SELECT id FROM g WHERE signal_name='customer notification'),
                                                          (SELECT id FROM s WHERE state_name='end of service'),    (SELECT id FROM s WHERE state_name='reported'),         ''),
  ((SELECT id FROM g WHERE signal_name='time interval'),   (SELECT id FROM s WHERE state_name='parts missing'),     (SELECT id FROM s WHERE state_name='assigned'),        '');

-- 4. Sample repair units (using new_sm_unit function)
SELECT sm.new_sm_unit(
  '{"MIF":"AEG Washing Machine","SN":"12345","Customer":"Gergana"}',
  'Service call Gergana'
) AS unit_id;

SELECT sm.new_sm_unit(
  '{"MIF":"Philips Hair Dryer","SN":"54321","Customer":"Boryana"}',
  'Service call Boryana'
) AS unit_id;

SELECT sm.new_sm_unit(
  '{"MIF":"Plumbing","Symptom":"Leak","SN":null,"Customer":"Stefan"}',
  'Service call Stefan'
) AS unit_id;

-- 5. Advance each sample unit through a few signals to generate logs
-- Example for first unit
WITH u AS (SELECT id FROM sm.sm_unit ORDER BY id LIMIT 1)
SELECT sm.handle_signal((SELECT id FROM u), (SELECT id FROM sm.signal WHERE signal_name='customer call'),   '{"note":"picked up"}');
SELECT sm.handle_signal((SELECT id FROM u), (SELECT id FROM sm.signal WHERE signal_name='assign'),          '{"tech":"A"}');
SELECT sm.handle_signal((SELECT id FROM u), (SELECT id FROM sm.signal WHERE signal_name='dispatch'),        '{}');
SELECT sm.handle_signal((SELECT id FROM u), (SELECT id FROM sm.signal WHERE signal_name='arrive'),          '{}');
SELECT sm.handle_signal((SELECT id FROM u), (SELECT id FROM sm.signal WHERE signal_name='finished work ok'),'{}');
SELECT sm.handle_signal((SELECT id FROM u), (SELECT id FROM sm.signal WHERE signal_name='customer notification'), '{}');

-- Example for second unit, simulate missing parts
WITH u AS (SELECT id FROM sm.sm_unit ORDER BY id OFFSET 1 LIMIT 1)
SELECT sm.handle_signal((SELECT id FROM u), (SELECT id FROM sm.signal WHERE signal_name='customer call'), '{}');
SELECT sm.handle_signal((SELECT id FROM u), (SELECT id FROM sm.signal WHERE signal_name='assign'),        '{}');
SELECT sm.handle_signal((SELECT id FROM u), (SELECT id FROM sm.signal WHERE signal_name='dispatch'),      '{}');
SELECT sm.handle_signal((SELECT id FROM u), (SELECT id FROM sm.signal WHERE signal_name='arrive'),        '{}');
SELECT sm.handle_signal((SELECT id FROM u), (SELECT id FROM sm.signal WHERE signal_name='parts missing'), '{}');
SELECT sm.handle_signal((SELECT id FROM u), (SELECT id FROM sm.signal WHERE signal_name='parts picked ok'), '{}');

COMMIT;

