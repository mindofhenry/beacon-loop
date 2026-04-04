-- 007_reps_table.sql
-- Creates the reps table and adds rep_id to step_performance.
-- 8 reps: 6 SDR, 1 AE, 1 manager — uneven sequence distribution for coaching queue demo.

CREATE TABLE reps (
    id             integer  PRIMARY KEY,
    name           text     NOT NULL,
    email          text     NOT NULL,
    role           text     NOT NULL CHECK (role IN ('sdr', 'ae', 'manager')),
    team           text     NOT NULL,
    source_user_id text     NOT NULL
);

ALTER TABLE step_performance
    ADD COLUMN rep_id integer REFERENCES reps(id);
