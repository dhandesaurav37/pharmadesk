-- ============================================================================
-- PHARMADESK DATABASE MIGRATION 0005: ROLES, PERMISSIONS & LEAST PRIVILEGE
-- Engine: PostgreSQL 16+ on Google Cloud SQL (asia-south1)
-- Standards: Strict Separation of DDL Migrator vs DML Runtime Role (No BYPASSRLS for App)
-- ============================================================================

-- 5.1 Ensure Database Roles Exist
DO $$
BEGIN
    -- Runtime Application Role (Used exclusively by Node.js Express server)
    -- Must have NOBYPASSRLS, NOSUPERUSER, NOCREATEDB
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pharmadesk_app') THEN
        BEGIN
            CREATE ROLE pharmadesk_app WITH LOGIN NOBYPASSRLS NOSUPERUSER NOCREATEDB NOCREATEROLE;
        EXCEPTION WHEN insufficient_privilege THEN
            RAISE NOTICE 'Role pharmadesk_app creation requires superuser/CREATEROLE; skipping creation';
        END;
    ELSE
        BEGIN
            ALTER ROLE pharmadesk_app WITH NOBYPASSRLS NOSUPERUSER;
        EXCEPTION WHEN insufficient_privilege THEN
            RAISE NOTICE 'Altering role pharmadesk_app requires superuser; skipping alter';
        END;
    END IF;

    -- Migration Role (Used strictly by CI/CD pipeline and migration runner)
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pharmadesk_migrator') THEN
        BEGIN
            CREATE ROLE pharmadesk_migrator WITH LOGIN BYPASSRLS CREATEDB;
        EXCEPTION WHEN insufficient_privilege THEN
            RAISE NOTICE 'Role pharmadesk_migrator creation requires superuser; skipping creation';
        END;
    ELSE
        BEGIN
            ALTER ROLE pharmadesk_migrator WITH BYPASSRLS;
        EXCEPTION WHEN insufficient_privilege THEN
            RAISE NOTICE 'Altering role pharmadesk_migrator requires superuser; skipping alter';
        END;
    END IF;
END $$;

-- 5.2 Grant Schema & Table Access to Runtime Application Role
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pharmadesk_app') THEN
        -- Allow usage of public schema
        GRANT USAGE ON SCHEMA public TO pharmadesk_app;
        
        -- Prevent DDL execution from runtime app
        REVOKE CREATE ON SCHEMA public FROM pharmadesk_app;

        -- Grant DML privileges on all existing tables and sequences
        GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO pharmadesk_app;
        GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO pharmadesk_app;

        -- Ensure future tables created by the migration user automatically inherit DML
        ALTER DEFAULT PRIVILEGES IN SCHEMA public
            GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO pharmadesk_app;

        ALTER DEFAULT PRIVILEGES IN SCHEMA public
            GRANT USAGE, SELECT ON SEQUENCES TO pharmadesk_app;
    ELSE
        RAISE NOTICE 'pharmadesk_app role not present; grant statements deferred to environment provisioning';
    END IF;
END $$;
