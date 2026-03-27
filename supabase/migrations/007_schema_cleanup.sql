-- Atica Ops — Schema Cleanup
-- Remove tables that were built prematurely.
-- They serve no business purpose today.
-- We'll add them back when they're needed, with proper design.

-- Tables being removed and WHY:
-- campaigns: no marketing module exists or is planned short-term
-- wholesale_accounts: no wholesale module exists
-- components / mp_components: not using component-level tracking
-- attachments: no file management feature
-- bin_locations: no bin-level warehouse management
-- external_connections / external_events: premature integration scaffolding

DROP TABLE IF EXISTS external_events CASCADE;
DROP TABLE IF EXISTS external_connections CASCADE;
DROP TABLE IF EXISTS attachments CASCADE;
DROP TABLE IF EXISTS bin_locations CASCADE;
DROP TABLE IF EXISTS mp_components CASCADE;
DROP TABLE IF EXISTS components CASCADE;
DROP TABLE IF EXISTS campaigns CASCADE;
DROP TABLE IF EXISTS wholesale_accounts CASCADE;
