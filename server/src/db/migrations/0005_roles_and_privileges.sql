-- ============================================================================
-- PHARMADESK DATABASE MIGRATION 0005: ROLES, PERMISSIONS & LEAST PRIVILEGE
-- Engine: PostgreSQL 16+ on Google Cloud SQL (asia-south1)
-- Standards: Strict Separation of DDL Migrator vs DML Runtime Role (No BYPASSRLS for App)
-- ============================================================================

-- 5.1 Ensure Database Roles Exist (Conditionally create if running on dedicated PG cluster)
DO $$
BEGIN
    -- Runtime Application Role (Used exclusively by Node.js Express server)
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pharmadesk_app') THEN
        CREATE ROLE pharmadesk_app WITH LOGIN NOBYPASSRLS NOSUPERUSER NOCREATEDB NOCREATEROLE;
    ELSE
        ALTER ROLE pharmadesk_app WITH NOBYPASSRLS NOSUPERUSER;
    END IF;

    -- Migration Role (Used strictly by CI/CD pipeline and migration runner)
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pharmadesk_migrator') THEN
        CREATE ROLE pharmadesk_migrator WITH LOGIN BYPASSRLS CREATEDB;
    ELSE
        ALTER ROLE pharmadesk_migrator WITH BYPASSRLS;
    END IF;
END $$;

-- 5.2 Grant Schema & Table Access to Runtime Application Role
GRANT USAGE ON SCHEMA public TO pharmadesk_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO pharmadesk_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO pharmadesk_app;

-- 5.3 Configure Future Table Defaults so newly added tables automatically inherit grants
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO pharmadesk_app;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT USAGE, SELECT ON SEQUENCES TO pharmadesk_app;
