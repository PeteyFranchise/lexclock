-- LexClock — email-scanning migration (Phase 1). Run AFTER schema.sql + auth.sql.
-- Adds 'gmail' and 'outlook' to the source_connections source whitelist so the
-- email pipeline can store OAuth refresh tokens in the existing table.
--
-- Safe to run more than once.

alter table source_connections
  drop constraint if exists source_connections_source_check;

alter table source_connections
  add constraint source_connections_source_check
  check (source in ('notion','workspace','calendar','phone','gmail','outlook'));
