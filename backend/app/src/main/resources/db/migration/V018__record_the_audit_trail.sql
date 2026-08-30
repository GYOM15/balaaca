-- audit_logs has existed since V012 and no line of Java has ever named it.
--
-- That mattered less when there was nothing to record. It matters now: V015 put
-- a privilege boundary in place - OWNER against STAFF, a suspended account, a
-- suspended business - and a boundary that does not write down its refusals
-- cannot be audited, cannot be debugged, and cannot answer the one question an
-- operator will actually ask, which is "who tried".
--
-- Two changes, both small, both needed before anything can write.

-- ---------------------------------------------------------------------------
-- 1. Resolution returns the account as well
-- ---------------------------------------------------------------------------
-- audit_logs.actor_user_id references users(id), and the membership carried the
-- staff row and not the account. Replaced rather than amended because the
-- return type changes; two functions answering the same question is how the
-- answers drift apart.
DROP FUNCTION IF EXISTS app_resolve_membership(varchar);

GRANT CREATE ON SCHEMA public TO balaaca_resolver;

CREATE OR REPLACE FUNCTION app_resolve_membership(p_subject varchar)
RETURNS TABLE (provider_id uuid, staff_id uuid, user_id uuid, staff_role varchar)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT ps.provider_id, ps.id, u.id, ps.role
      FROM provider_staff ps
      JOIN users u     ON u.id = ps.user_id
      JOIN providers p ON p.id = ps.provider_id
     WHERE u.keycloak_user_id = p_subject
       AND ps.status = 'ACTIVE'
       AND u.status  = 'ACTIVE'
       AND p.status IN ('PENDING', 'ACTIVE')
$$;
ALTER FUNCTION app_resolve_membership(varchar) OWNER TO balaaca_resolver;
REVOKE ALL ON FUNCTION app_resolve_membership(varchar) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_resolve_membership(varchar) TO balaaca_app;

REVOKE CREATE ON SCHEMA public FROM balaaca_resolver;

-- ---------------------------------------------------------------------------
-- 2. A refusal with no tenant still has to be recordable
-- ---------------------------------------------------------------------------
-- The most interesting refusal of all is the one where resolution found
-- nothing: a valid token belonging to no active provider. It has no tenant by
-- definition, and the previous WITH CHECK demanded provider_id =
-- app_current_provider(), so that row could not be written at all.
--
-- The asymmetry is deliberate. WITH CHECK admits a platform row only when NO
-- tenant is bound, so a provider cannot forge one while acting as itself, and
-- can never write into another tenant. USING stays strict: a platform row is
-- for the operator and is not readable by any provider, including the one whose
-- subject produced it.
DROP POLICY audit_logs_tenant ON audit_logs;
CREATE POLICY audit_logs_tenant ON audit_logs
    FOR ALL TO balaaca_app
    USING      (provider_id = app_current_provider())
    WITH CHECK (provider_id = app_current_provider()
                OR (provider_id IS NULL AND app_current_provider() IS NULL));

-- The trail is append-only for the application role: V013 revoked UPDATE and
-- DELETE, and this restates the grant it needs and nothing more.
GRANT USAGE, SELECT ON SEQUENCE audit_logs_id_seq TO balaaca_app;
