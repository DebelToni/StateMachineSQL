-- 03_seed_data.sql
-- Inserts states, signals and transitions required by the workflow.
-- Safe to re-run (ON CONFLICT … DO NOTHING).

BEGIN;

---------------------------------------------------------------
-- 1. States
---------------------------------------------------------------
INSERT INTO sm.state(state_name, is_initial)
VALUES ('neutral', true)
ON CONFLICT (state_name) DO NOTHING;

INSERT INTO sm.state(state_name)
VALUES ('registered'),
       ('assigned'),
       ('dispatched'),
       ('start of service'),
       ('end of service'),
       ('reported'),
       ('parts missing')
ON CONFLICT (state_name) DO NOTHING;

UPDATE sm.state
SET    is_terminal = true
WHERE  state_name  = 'reported';

---------------------------------------------------------------
-- 2. Signals
---------------------------------------------------------------
INSERT INTO sm.signal(signal_name)
VALUES ('customer call'),
       ('assign'),
       ('dispatch'),
       ('arrive'),
       ('parts missing'),
       ('parts picked ok'),
       ('parts picked failed'),
       ('finished work ok'),
       ('finished work failed'),
       ('customer notification'),
       ('time interval')
ON CONFLICT (signal_name) DO NOTHING;

---------------------------------------------------------------
-- 3. Transitions
---------------------------------------------------------------
WITH
s AS (SELECT state_name, id FROM sm.state),
g AS (SELECT signal_name, id FROM sm.signal)

INSERT INTO sm.transition(signal_id, in_state_id, out_state_id)
SELECT g.id, s1.id, s2.id
FROM  (VALUES
       ('customer call','neutral','registered'),
       ('assign','registered','assigned'),
       ('dispatch','assigned','dispatched'),
       ('arrive','dispatched','start of service'),
       ('parts missing','start of service','parts missing'),
       ('parts picked ok','parts missing','start of service'),
       ('parts picked failed','parts missing','assigned'),
       ('finished work ok','start of service','end of service'),
       ('finished work failed','start of service','parts missing'),
       ('customer notification','end of service','reported'),
       ('time interval','parts missing','assigned')
      ) AS t(signal,in_state,out_state)
JOIN g      ON g.signal_name = t.signal
JOIN s s1   ON s1.state_name = t.in_state
JOIN s s2   ON s2.state_name = t.out_state
ON CONFLICT DO NOTHING;

COMMIT;

