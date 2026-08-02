-- audit_log is APPEND-ONLY. Kill switches without an audit trail is a governance
-- failure, and retrofitting this after data exists is painful — which is why the
-- table and its enforcement are created in S0 despite being an S6 surface.
--
-- Two mechanisms, because neither alone is sufficient:
--   * the REVOKE stops any non-owner role, but a table owner bypasses grants;
--   * the trigger stops everyone who has not deliberately disabled it.
--
-- TRUNCATE is covered separately: it does not fire row-level triggers, so an
-- append-only table without a statement-level TRUNCATE guard can still be emptied
-- in one command.

REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "audit_log" FROM PUBLIC;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "audit_log_append_only"() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only: % is not permitted', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "audit_log_no_update_or_delete"
  BEFORE UPDATE OR DELETE ON "audit_log"
  FOR EACH ROW EXECUTE FUNCTION "audit_log_append_only"();
--> statement-breakpoint
CREATE TRIGGER "audit_log_no_truncate"
  BEFORE TRUNCATE ON "audit_log"
  FOR EACH STATEMENT EXECUTE FUNCTION "audit_log_append_only"();
