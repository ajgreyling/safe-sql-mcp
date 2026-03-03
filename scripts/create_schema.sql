-- Creates normalized fake-client schema objects in capybara-test.
-- Run after database creation:
--   psql -U postgres -d capybara-test -f scripts/create_schema.sql

CREATE SCHEMA IF NOT EXISTS sensitive_client_data;

SET search_path TO sensitive_client_data, public;

DROP TABLE IF EXISTS client_contact_preference CASCADE;
DROP TABLE IF EXISTS client_employment CASCADE;
DROP TABLE IF EXISTS client_financial_account CASCADE;
DROP TABLE IF EXISTS client_identification CASCADE;
DROP TABLE IF EXISTS client_address CASCADE;
DROP TABLE IF EXISTS client_profile CASCADE;

CREATE TABLE client_profile (
  client_id BIGSERIAL PRIMARY KEY,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  date_of_birth DATE NOT NULL,
  gender VARCHAR(20),
  email VARCHAR(255) NOT NULL UNIQUE,
  phone_number VARCHAR(30) NOT NULL,
  ssn VARCHAR(15) NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE client_address (
  address_id BIGSERIAL PRIMARY KEY,
  client_id BIGINT NOT NULL REFERENCES client_profile(client_id) ON DELETE CASCADE,
  address_type VARCHAR(30) NOT NULL,
  street_address VARCHAR(255) NOT NULL,
  city VARCHAR(120) NOT NULL,
  state VARCHAR(120) NOT NULL,
  postal_code VARCHAR(20) NOT NULL,
  country VARCHAR(100) NOT NULL DEFAULT 'USA',
  is_primary BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE client_identification (
  identification_id BIGSERIAL PRIMARY KEY,
  client_id BIGINT NOT NULL REFERENCES client_profile(client_id) ON DELETE CASCADE,
  id_type VARCHAR(40) NOT NULL,
  id_number VARCHAR(80) NOT NULL,
  issue_date DATE NOT NULL,
  expiry_date DATE,
  issuing_country VARCHAR(100) NOT NULL DEFAULT 'USA',
  UNIQUE (id_type, id_number)
);

CREATE TABLE client_financial_account (
  account_id BIGSERIAL PRIMARY KEY,
  client_id BIGINT NOT NULL REFERENCES client_profile(client_id) ON DELETE CASCADE,
  account_type VARCHAR(40) NOT NULL,
  account_number VARCHAR(40) NOT NULL UNIQUE,
  routing_number VARCHAR(20),
  bank_name VARCHAR(180) NOT NULL,
  balance NUMERIC(14, 2) NOT NULL DEFAULT 0,
  currency VARCHAR(10) NOT NULL DEFAULT 'USD',
  opened_date DATE NOT NULL
);

CREATE TABLE client_contact_preference (
  preference_id BIGSERIAL PRIMARY KEY,
  client_id BIGINT NOT NULL REFERENCES client_profile(client_id) ON DELETE CASCADE,
  contact_method VARCHAR(40) NOT NULL,
  is_opted_in BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE client_employment (
  employment_id BIGSERIAL PRIMARY KEY,
  client_id BIGINT NOT NULL REFERENCES client_profile(client_id) ON DELETE CASCADE,
  employer_name VARCHAR(180) NOT NULL,
  job_title VARCHAR(120) NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE,
  annual_income NUMERIC(14, 2) NOT NULL,
  is_current BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_client_address_client_id ON client_address (client_id);
CREATE INDEX IF NOT EXISTS idx_client_identification_client_id ON client_identification (client_id);
CREATE INDEX IF NOT EXISTS idx_client_financial_account_client_id ON client_financial_account (client_id);
CREATE INDEX IF NOT EXISTS idx_client_contact_preference_client_id ON client_contact_preference (client_id);
CREATE INDEX IF NOT EXISTS idx_client_employment_client_id ON client_employment (client_id);
