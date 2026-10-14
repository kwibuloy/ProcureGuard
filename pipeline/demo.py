"""Fill the database with generated demonstration contracts.

Run with: python -m pipeline.demo            (replace the demonstration data)
          python -m pipeline.demo --clear    (remove it)

Every entity, awardee and contract here is invented; nothing describes a real
organization or a real contract. Score them with `python -m ml.score` to see the
dashboard working. Scoring runs over these contracts are marked is_demo, and the
dashboard labels them. Remove them before loading real data.
"""

import argparse
import json
import random
import sys
from datetime import date, timedelta

from pipeline.db import connect

DEMO_SOURCE = "DEMO"
SEED = 2024
CONTRACTS = 900

REGIONS = {
    "Demo Region North": ["Alondra", "Bantayog", "Casilagan"],
    "Demo Region Central": ["Dalisay", "Esperanza Hills", "Florante"],
    "Demo Region South": ["Guinhawa", "Halina", "Ilawod"],
    "Demo Region Islands": ["Jasmin Cove", "Kawayan", "Lualhati"],
}
ENTITY_KINDS = [
    ("Municipality of {place}", "Municipal Government", "Local Government Units (LGU)"),
    ("Province of {place}", "Provincial Government", "Local Government Units (LGU)"),
    ("Public Works District Office, {place}", "National Agency", "National Government Agencies"),
    ("{place} State College", "State College", "State Universities and Colleges (SUC)"),
]
WORKS = [
    ("Construction of {n}-Storey Multi-Purpose Building", (3_000_000, 18_000_000)),
    ("Concreting of Farm-to-Market Road, Section {n}", (2_000_000, 25_000_000)),
    ("Rehabilitation of Drainage System, Phase {n}", (800_000, 9_000_000)),
    ("Construction of Slope Protection Structure, Site {n}", (4_000_000, 60_000_000)),
    ("Repair of School Building, Cluster {n}", (400_000, 4_000_000)),
    ("Installation of Solar Street Lights, Zone {n}", (300_000, 3_500_000)),
    ("Construction of Level II Water System, Sitio {n}", (1_200_000, 12_000_000)),
    ("Improvement of Covered Court, Barangay {n}", (900_000, 6_000_000)),
]
NEGOTIATED = "Negotiated Procurement - Small Value Procurement (Sec. 53.9)"


def _entities(rng: random.Random) -> list[dict]:
    entities = []
    for region, places in REGIONS.items():
        for place in places:
            for pattern, kind, group in rng.sample(ENTITY_KINDS, 2):
                entities.append(
                    {
                        "name": f"Demo {pattern.format(place=place)}",
                        "region": region,
                        "province": f"Demo Province of {places[0]}",
                        "city": place,
                        "type": kind,
                        "group": group,
                        # How strongly this entity's awards go to one awardee.
                        "concentration": rng.choice([0.0, 0.0, 0.0, 0.1, 0.2, 0.6, 0.9]),
                        "favourite": f"Demo Contractor {rng.randint(1, 120):03d}",
                        # Some entities draw little interest in their tenders.
                        "few_requests": rng.random() < 0.2,
                        # A few entities award only a handful of contracts.
                        "weight": rng.choice([0.08, 1, 1, 1, 2, 3]),
                    }
                )
    return entities


def generate(rng: random.Random) -> list[dict]:
    entities = _entities(rng)
    weights = [entity["weight"] for entity in entities]
    contracts = []
    for number in range(1, CONTRACTS + 1):
        entity = rng.choices(entities, weights)[0]
        pattern, (low, high) = rng.choice(WORKS)
        budget = round(rng.uniform(low, high), -3)
        if rng.random() < entity["concentration"]:
            awardee = entity["favourite"]
        else:
            awardee = f"Demo Contractor {rng.randint(1, 120):03d}"
        # Most awards land just under the budget; a few come in well below.
        share = rng.uniform(0.6, 0.82) if rng.random() < 0.03 else min(1.0, rng.gauss(0.972, 0.02))
        public_bidding = rng.random() < 0.88
        requests = max(1, round(rng.lognormvariate(1.3, 0.55)))
        if entity["few_requests"] and rng.random() < 0.5:
            requests = rng.choice([1, 1, 2])
        published = date(2024, 1, 8) + timedelta(days=rng.randint(0, 340))
        closing = published + timedelta(days=rng.choice([7, 14, 20, 21, 21, 28]))
        award = closing + timedelta(days=rng.randint(6, 60))
        contracts.append(
            {
                "ref": f"DEMO-{number:04d}",
                "bid_ref": f"DEMO-B{number:04d}",
                "title": pattern.format(n=rng.randint(1, 9)) + f", {entity['city']}",
                "entity": entity,
                "mode": "Public Bidding" if public_bidding else NEGOTIATED,
                "budget": budget,
                # A small share of records are published without an amount.
                "amount": None if rng.random() < 0.015 else round(budget * share, 2),
                "awardee": awardee,
                "published": None if rng.random() < 0.02 else published,
                "closing": closing,
                "award": award,
                "ntp": None if rng.random() < 0.25 else award + timedelta(days=rng.randint(3, 20)),
                # Counts exist for public bidding notices, minus a few not yet collected.
                "requests": requests if public_bidding and rng.random() > 0.05 else None,
                "size": rng.choice(["Micro", "Small", "Small", "Medium", "Large"]),
            }
        )
    return contracts


def clear(connection) -> None:
    connection.execute("DELETE FROM scoring_runs WHERE is_demo")
    connection.execute("DELETE FROM load_reports WHERE is_demo")
    connection.execute("DELETE FROM contracts WHERE source_file = %s", [DEMO_SOURCE])
    connection.execute("DELETE FROM bid_notices WHERE bid_reference_no LIKE 'DEMO-%'")


def load(connection, contracts: list[dict]) -> None:
    for contract in contracts:
        entity = contract["entity"]
        connection.execute(
            "INSERT INTO contracts (source_series, award_reference_no, bid_reference_no, title,"
            " procuring_entity, procuring_entity_raw, region, province, city_municipality,"
            " entity_type, entity_type_group, procurement_mode, business_category,"
            " funding_source, approved_budget, contract_amount, published_date, closing_date,"
            " award_date, notice_to_proceed_date, awardee, awardee_raw, awardee_region,"
            " awardee_size, source_file)"
            " VALUES ('legacy', %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s,"
            " 'Construction Projects', 'Demonstration',"
            " %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)",
            [
                contract["ref"],
                contract["bid_ref"],
                contract["title"],
                entity["name"].upper(),
                entity["name"],
                entity["region"],
                entity["province"],
                entity["city"],
                entity["type"],
                entity["group"],
                contract["mode"],
                contract["budget"],
                contract["amount"],
                contract["published"],
                contract["closing"],
                contract["award"],
                contract["ntp"],
                contract["awardee"].upper(),
                contract["awardee"],
                entity["region"],
                contract["size"],
                DEMO_SOURCE,
            ],
        )
        if contract["requests"] is not None:
            connection.execute(
                "INSERT INTO bid_notices (source_series, bid_reference_no, fetch_status,"
                " document_request_count, bid_supplement_count, notice_status)"
                " VALUES ('legacy', %s, 'ok', %s, 0, 'Awarded')",
                [contract["bid_ref"], contract["requests"]],
            )
    # Invented intake figures in realistic proportions, so the data quality page has content.
    count = len(contracts)
    intake = {
        "rows_read": count * 46,
        "malformed_rows": count // 40,
        "not_civil_works": count * 46 - count * 5 - count // 40,
        "civil_works_rows": count * 5,
        "not_awarded": count * 2,
        "award_cancelled": count // 75,
        "extra_line_item_rows": count * 2 - count // 75,
        "contracts": count,
        "entity_names_published": 31,
        "entity_names_standardized": 24,
        "awardee_names_published": 137,
        "awardee_names_standardized": 120,
        "unreadable: Approved Budget of the Contract": 3,
    }
    connection.execute(
        "INSERT INTO load_reports (is_demo, source_files, intake) VALUES (TRUE, %s, %s)",
        [json.dumps(["demonstration data"]), json.dumps(intake)],
    )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--clear", action="store_true", help="remove the demonstration data")
    args = parser.parse_args(argv)

    with connect() as connection:
        real = connection.execute(
            "SELECT count(*) FROM contracts WHERE source_file <> %s", [DEMO_SOURCE]
        ).fetchone()[0]
        if real and not args.clear:
            print(f"{real:,} real contracts are stored. Demonstration data must not be mixed in.")
            return 1
        with connection.transaction():
            clear(connection)
            if args.clear:
                print("Demonstration data removed.")
                return 0
            contracts = generate(random.Random(SEED))
            load(connection, contracts)
    print(f"{len(contracts)} demonstration contracts loaded. Score them: python -m ml.score")
    return 0


if __name__ == "__main__":
    sys.exit(main())
