-- 01_schema.sql
-- Schema & physical objects for the repair-shop state-machine
-- • Idempotent: can be executed many times
-- • Uses BIGSERIAL (64-bit) and modern ‘identity’ features
-- • Builds all indexes needed for fast dashboards

BEGIN;

CREATE SCHEMA IF NOT EXISTS sm;

----------------------------------------------------------------
-- 1. Reference tables
----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sm.state (
    id           bigserial PRIMARY KEY,
    state_name   text      NOT NULL,
    is_initial   boolean   NOT NULL DEFAULT false,
    is_terminal  boolean   NOT NULL DEFAULT false,
    details      jsonb     NOT NULL DEFAULT '{}'::jsonb
);

ALTER TABLE sm.state
      ADD CONSTRAINT state_name_uq UNIQUE(state_name);

-- guarantee exactly one initial state
CREATE UNIQUE INDEX IF NOT EXISTS state_single_initial
      ON sm.state((is_initial))
      WHERE is_initial;

CREATE TABLE IF NOT EXISTS sm.signal (
    id           bigserial PRIMARY KEY,
    signal_name  text   NOT NULL,
    details      jsonb  NOT NULL DEFAULT '{}'::jsonb
);

ALTER TABLE sm.signal
      ADD CONSTRAINT signal_name_uq UNIQUE(signal_name);

----------------------------------------------------------------
-- 2. Transition table  (signal + in_state ⇒ out_state)
----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sm.transition (
    signal_id          bigint        NOT NULL
                      REFERENCES sm.signal(id)  ON DELETE RESTRICT,
    in_state_id        bigint        NOT NULL
                      REFERENCES sm.state(id)   ON DELETE RESTRICT,
    out_state_id       bigint        NOT NULL
                      REFERENCES sm.state(id)   ON DELETE RESTRICT,
    transition_handler regprocedure,            -- optional side-effect
    details            jsonb         NOT NULL DEFAULT '{}'::jsonb,
    PRIMARY KEY(signal_id, in_state_id)
);

----------------------------------------------------------------
-- 3. Units that travel through the state-machine
----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sm.sm_unit (
    id            bigserial PRIMARY KEY,
    unit_name     text   NOT NULL,
    unit_details  jsonb  NOT NULL DEFAULT '{}'::jsonb
);

----------------------------------------------------------------
-- 4. Event log  (immutable)
----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sm.sm_log (
    id                bigserial PRIMARY KEY,
    unit_id           bigint NOT NULL
                      REFERENCES sm.sm_unit(id) ON DELETE CASCADE,
    initial_state_id  bigint NOT NULL
                      REFERENCES sm.state(id)   ON DELETE RESTRICT,
    final_state_id    bigint NOT NULL
                      REFERENCES sm.state(id)   ON DELETE RESTRICT,
    payload           jsonb,
    signal_id         bigint
                      REFERENCES sm.signal(id)  ON DELETE RESTRICT,
    ts                timestamptz NOT NULL DEFAULT clock_timestamp()
);

----------------------------------------------------------------
-- 5. Indexes
----------------------------------------------------------------
CREATE INDEX IF NOT EXISTS sm_log_unit_ts_desc
    ON sm.sm_log(unit_id, ts DESC);

CREATE INDEX IF NOT EXISTS sm_unit_details_gin
    ON sm.sm_unit USING gin(unit_details jsonb_path_ops);

CREATE INDEX IF NOT EXISTS sm_log_payload_gin
    ON sm.sm_log  USING gin(payload     jsonb_path_ops);

COMMIT;

