#!/usr/bin/env python3
"""Populate capybara-test.sensitive_client_data with realistic fake data."""

from __future__ import annotations

import os
import random
from datetime import date

import psycopg2
from faker import Faker
from psycopg2.extras import execute_batch

DB_DSN = os.getenv(
    "CAPYBARA_TEST_DSN",
    "postgres://postgres:postgres@localhost:5432/capybara-test",
)
TARGET_SCHEMA = "sensitive_client_data"
CLIENT_COUNT = int(os.getenv("CLIENT_COUNT", "200"))

fake = Faker("en_US")
Faker.seed(42)
random.seed(42)


def random_dob(min_age: int = 18, max_age: int = 85) -> date:
    return fake.date_of_birth(minimum_age=min_age, maximum_age=max_age)


def random_gender() -> str:
    return random.choice(["Male", "Female", "Non-binary"])


def maybe_end_date(start_date: date) -> date | None:
    if random.random() < 0.6:
        return None
    return fake.date_between_dates(date_start=start_date, date_end=date.today())


def build_clients(count: int) -> list[tuple]:
    clients = []
    for _ in range(count):
        clients.append(
            (
                fake.first_name(),
                fake.last_name(),
                random_dob(),
                random_gender(),
                fake.unique.email(),
                fake.phone_number(),
                fake.unique.ssn(),
            )
        )
    return clients


def main() -> None:
    conn = psycopg2.connect(DB_DSN)
    conn.autocommit = False

    profile_count = 0
    address_count = 0
    identification_count = 0
    account_count = 0
    preference_count = 0
    employment_count = 0

    try:
        with conn.cursor() as cur:
            cur.execute(f"SET search_path TO {TARGET_SCHEMA}, public")

            clients = build_clients(CLIENT_COUNT)
            execute_batch(
                cur,
                """
                INSERT INTO client_profile (
                  first_name, last_name, date_of_birth, gender, email, phone_number, ssn
                ) VALUES (%s, %s, %s, %s, %s, %s, %s)
                """,
                clients,
                page_size=200,
            )
            cur.execute("SELECT client_id FROM client_profile ORDER BY client_id")
            client_ids = [row[0] for row in cur.fetchall()]
            profile_count = len(client_ids)

            addresses = []
            identifications = []
            accounts = []
            preferences = []
            employments = []

            for client_id in client_ids:
                address_total = random.randint(1, 3)
                for idx in range(address_total):
                    addresses.append(
                        (
                            client_id,
                            random.choice(["home", "work", "mailing"]),
                            fake.street_address(),
                            fake.city(),
                            fake.state(),
                            fake.postcode(),
                            "USA",
                            idx == 0,
                        )
                    )

                id_total = random.randint(1, 2)
                for _ in range(id_total):
                    issue_date = fake.date_between(start_date="-10y", end_date="-1y")
                    expiry_date = fake.date_between_dates(
                        date_start=issue_date,
                        date_end=fake.date_between(start_date="+1y", end_date="+10y"),
                    )
                    id_type = random.choice(["passport", "drivers_license", "national_id"])
                    if id_type == "passport":
                        id_number = fake.bothify(text="#########")
                    elif id_type == "drivers_license":
                        id_number = fake.bothify(text="?########")
                    else:
                        id_number = fake.bothify(text="##########")
                    identifications.append(
                        (client_id, id_type, id_number, issue_date, expiry_date, "USA")
                    )

                account_total = random.randint(1, 3)
                for _ in range(account_total):
                    account_type = random.choice(
                        ["checking", "savings", "credit_card", "investment"]
                    )
                    accounts.append(
                        (
                            client_id,
                            account_type,
                            fake.unique.bothify(text="############"),
                            fake.bothify(text="#########"),
                            random.choice(
                                [
                                    "Wells Fargo",
                                    "Bank of America",
                                    "Chase",
                                    "Citi",
                                    "Capital One",
                                    "US Bank",
                                ]
                            ),
                            round(random.uniform(100.0, 250000.0), 2),
                            "USD",
                            fake.date_between(start_date="-15y", end_date="-1m"),
                        )
                    )

                for method in random.sample(
                    ["email", "sms", "phone", "mail"], k=random.randint(2, 4)
                ):
                    preferences.append((client_id, method, random.random() < 0.8))

                employment_total = random.randint(1, 3)
                employment_rows = []
                for _ in range(employment_total):
                    start_date = fake.date_between(start_date="-20y", end_date="-6m")
                    end_date = maybe_end_date(start_date)
                    employment_rows.append(
                        (
                            client_id,
                            fake.company(),
                            fake.job(),
                            start_date,
                            end_date,
                            round(random.uniform(35000.0, 260000.0), 2),
                            end_date is None,
                        )
                    )
                if all(row[6] is False for row in employment_rows):
                    latest_idx = max(range(len(employment_rows)), key=lambda i: employment_rows[i][3])
                    row = list(employment_rows[latest_idx])
                    row[4] = None
                    row[6] = True
                    employment_rows[latest_idx] = tuple(row)
                employments.extend(employment_rows)

            execute_batch(
                cur,
                """
                INSERT INTO client_address (
                  client_id, address_type, street_address, city, state, postal_code, country, is_primary
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                """,
                addresses,
                page_size=500,
            )
            address_count = len(addresses)

            execute_batch(
                cur,
                """
                INSERT INTO client_identification (
                  client_id, id_type, id_number, issue_date, expiry_date, issuing_country
                ) VALUES (%s, %s, %s, %s, %s, %s)
                """,
                identifications,
                page_size=500,
            )
            identification_count = len(identifications)

            execute_batch(
                cur,
                """
                INSERT INTO client_financial_account (
                  client_id, account_type, account_number, routing_number, bank_name, balance, currency, opened_date
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                """,
                accounts,
                page_size=500,
            )
            account_count = len(accounts)

            execute_batch(
                cur,
                """
                INSERT INTO client_contact_preference (
                  client_id, contact_method, is_opted_in
                ) VALUES (%s, %s, %s)
                """,
                preferences,
                page_size=500,
            )
            preference_count = len(preferences)

            execute_batch(
                cur,
                """
                INSERT INTO client_employment (
                  client_id, employer_name, job_title, start_date, end_date, annual_income, is_current
                ) VALUES (%s, %s, %s, %s, %s, %s, %s)
                """,
                employments,
                page_size=500,
            )
            employment_count = len(employments)

        conn.commit()

    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()

    print("Fake data generation complete.")
    print(f"client_profile: {profile_count}")
    print(f"client_address: {address_count}")
    print(f"client_identification: {identification_count}")
    print(f"client_financial_account: {account_count}")
    print(f"client_contact_preference: {preference_count}")
    print(f"client_employment: {employment_count}")


if __name__ == "__main__":
    main()
