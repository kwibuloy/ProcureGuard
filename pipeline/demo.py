"""Fill the database with generated demonstration data for building the dashboard.

Run with: python -m pipeline.demo            (replace the demonstration data)
          python -m pipeline.demo --clear    (remove it)

Every entity, awardee, contract and score here is invented. Nothing describes a
real organization or a real contract, and the scores come from a formula in this
file, not from the anomaly detection model. The scoring run is marked is_demo so
the dashboard labels it. Remove it before loading real data.
"""

import argparse
import json
import random
import sys
from datetime import date, timedelta

from pipeline.db import connect

DEMO_SOURCE = "DEMO"
SEED = 2024
CONTRACTS = 640
FLAG_THRESHOLD = 0.6

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
    ("Construction of {n}-Storey Multi-Purpose Building", (3_000_000, 18_000_000), "building"),
    ("Concreting of Farm-to-Market Road, Section {n}", (2_000_000, 25_000_000), "road"),
    ("Rehabilitation of Drainage System, Phase {n}", (800_000, 9_000_000), "drainage"),
    ("Construction of Slope Protection Structure, Site {n}", (4_000_000, 48_000_000), "flood"),
    ("Repair of School Building, Cluster {n}", (400_000, 4_000_000), "building"),
    ("Installation of Solar Street Lights, Zone {n}", (300_000, 3_500_000), "electrical"),
    ("Construction of Level II Water System, Sitio {n}", (1_200_000, 12_000_000), "water"),
    ("Improvement of Covered Court, Barangay {n}", (900_000, 6_000_000), "building"),
]


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
                        # How strongly this entity's awards concentrate on one awardee.
                        "concentration": rng.choice([0.0, 0.0, 0.1, 0.25, 0.55, 0.8]),
                        "favourite": f"Demo Contractor {rng.randint(1, 90):03d}",
                    }
                )
    return entities


def generate(rng: random.Random) -> list[dict]:
    entities = _entities(rng)
    contracts = []
    for number in range(1, CONTRACTS + 1):
        entity = rng.choice(entities)
        pattern, (low, high), category = rng.choice(WORKS)
        budget = round(rng.uniform(low, high), -3)
        if rng.random() < entity["concentration"]:
            awardee = entity["favourite"]
        else:
            awardee = f"Demo Contractor {rng.randint(1, 90):03d}"
        published = date(2024, 1, 8) + timedelta(days=rng.randint(0, 320))
        closing = published + timedelta(days=rng.choice([7, 14, 20, 21, 21, 28]))
        award = closing + timedelta(days=rng.randint(6, 45))
        contracts.append(
            {
                "ref": f"DEMO-{number:04d}",
                "bid_ref": f"DEMO-B{number:04d}",
                "title": pattern.format(n=rng.randint(1, 9)) + f", {entity['city']}",
                "entity": entity,
                "category": category,
                "budget": budget,
                # Most awards land just under the budget; a few come in well below.
                "amount": round(
                    budget
                    * (
                        rng.uniform(0.62, 0.8)
                        if rng.random() < 0.035
                        else min(1.0, rng.gauss(0.975, 0.02))
                    ),
                    2,
                ),
                "awardee": awardee,
                "published": published,
                "closing": closing,
                "award": award,
                "ntp": award + timedelta(days=rng.randint(3, 20)),
                "requests": max(1, round(rng.lognormvariate(1.25, 0.6))),
                "size": rng.choice(["Micro", "Small", "Small", "Medium", "Large"]),
            }
        )
    return contracts


def _median(values: list[float]) -> float:
    ordered = sorted(values)
    middle = len(ordered) // 2
    return ordered[middle] if len(ordered) % 2 else (ordered[middle - 1] + ordered[middle]) / 2


def score(contracts: list[dict], rng: random.Random) -> None:
    """Attach indicator values, contributions and a 0-1 score to each contract."""
    by_entity: dict[str, list[dict]] = {}
    by_category: dict[str, list[float]] = {}
    for contract in contracts:
        by_entity.setdefault(contract["entity"]["name"], []).append(contract)
        by_category.setdefault(contract["category"], []).append(
            contract["amount"] / contract["budget"]
        )
    request_median = _median([c["requests"] for c in contracts])

    for contract in contracts:
        peers = by_entity[contract["entity"]["name"]]
        wins = sum(1 for peer in peers if peer["awardee"] == contract["awardee"])
        share = wins / len(peers)
        ratio = contract["amount"] / contract["budget"]
        category_median = _median(by_category[contract["category"]])
        deviation = ratio / category_median - 1

        pulls = {
            "single_requester": 0.3
            if contract["requests"] == 1
            else (0.08 if contract["requests"] == 2 else -0.05),
            "repeated_winner": (share - 0.2) * 0.42 if len(peers) >= 4 else -0.02,
            # A price far from comparable contracts is unusual in either direction.
            "price_deviation": min(0.36, abs(deviation) * 1.6 - 0.04) + rng.gauss(0, 0.06),
        }
        base = 0.3
        raw = base + sum(pulls.values())
        final = min(0.99, max(0.02, raw))
        # Keep contributions additive (base + contributions = score) when the score is clipped.
        adjust = (final - base) / (raw - base) if final != raw else 1.0
        contract["score"] = final
        contract["base"] = base
        contract["indicators"] = {
            "single_requester": (
                contract["requests"],
                pulls["single_requester"] * adjust,
                {"document_requests": contract["requests"], "typical_requests": request_median},
            ),
            "repeated_winner": (
                share,
                pulls["repeated_winner"] * adjust,
                {"wins": wins, "entity_awards": len(peers)},
            ),
            "price_deviation": (
                deviation,
                pulls["price_deviation"] * adjust,
                {
                    "comparable_median_ratio": category_median,
                    "comparable_count": len(by_category[contract["category"]]),
                    "amount_to_budget_ratio": ratio,
                },
            ),
        }
    for rank, contract in enumerate(sorted(contracts, key=lambda c: -c["score"]), start=1):
        contract["rank"] = rank


def clear(connection) -> None:
    connection.execute("DELETE FROM scoring_runs WHERE is_demo")
    connection.execute("DELETE FROM contracts WHERE source_file = %s", [DEMO_SOURCE])
    connection.execute("DELETE FROM bid_notices WHERE bid_reference_no LIKE 'DEMO-%'")


def load(connection, contracts: list[dict]) -> int:
    run_id = connection.execute(
        "INSERT INTO scoring_runs (model_name, parameters, random_seed, flag_threshold,"
        " base_value, is_demo, notes) VALUES (%s, %s, %s, %s, %s, TRUE, %s) RETURNING id",
        [
            "Demonstration data (not a model)",
            json.dumps({"generator": "pipeline.demo"}),
            SEED,
            FLAG_THRESHOLD,
            contracts[0]["base"],
            "Generated demonstration data. No real organization or contract is described.",
        ],
    ).fetchone()[0]
    for contract in contracts:
        entity = contract["entity"]
        contract_id = connection.execute(
            "INSERT INTO contracts (source_series, award_reference_no, bid_reference_no, title,"
            " procuring_entity, procuring_entity_raw, region, province, city_municipality,"
            " entity_type, entity_type_group, procurement_mode, business_category,"
            " funding_source, approved_budget, contract_amount, published_date, closing_date,"
            " award_date, notice_to_proceed_date, awardee, awardee_raw, awardee_region,"
            " awardee_size, source_file)"
            " VALUES ('legacy', %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 'Public Bidding',"
            " 'Construction Projects', 'Demonstration', %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)"
            " RETURNING id",
            [
                contract["ref"],
                contract["bid_ref"],
                contract["title"],
                entity["name"],
                entity["name"],
                entity["region"],
                entity["province"],
                entity["city"],
                entity["type"],
                entity["group"],
                contract["budget"],
                contract["amount"],
                contract["published"],
                contract["closing"],
                contract["award"],
                contract["ntp"],
                contract["awardee"],
                contract["awardee"],
                entity["region"],
                contract["size"],
                DEMO_SOURCE,
            ],
        ).fetchone()[0]
        connection.execute(
            "INSERT INTO bid_notices (source_series, bid_reference_no, fetch_status,"
            " document_request_count, bid_supplement_count, notice_status)"
            " VALUES ('legacy', %s, 'ok', %s, 0, 'Awarded')",
            [contract["bid_ref"], contract["requests"]],
        )
        connection.execute(
            "INSERT INTO contract_scores (run_id, contract_id, risk_score, score_rank, is_flagged)"
            " VALUES (%s, %s, %s, %s, %s)",
            [
                run_id,
                contract_id,
                contract["score"],
                contract["rank"],
                contract["score"] >= FLAG_THRESHOLD,
            ],
        )
        for indicator, (value, contribution, context) in contract["indicators"].items():
            connection.execute(
                "INSERT INTO contract_indicators (run_id, contract_id, indicator, value,"
                " contribution, context) VALUES (%s, %s, %s, %s, %s, %s)",
                [run_id, contract_id, indicator, value, contribution, json.dumps(context)],
            )
    return run_id


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--clear", action="store_true", help="remove the demonstration data")
    args = parser.parse_args(argv)

    with connect() as connection:
        with connection.transaction():
            clear(connection)
            if args.clear:
                print("Demonstration data removed.")
                return 0
            rng = random.Random(SEED)
            contracts = generate(rng)
            score(contracts, rng)
            run_id = load(connection, contracts)
    flagged = sum(1 for c in contracts if c["score"] >= FLAG_THRESHOLD)
    print(f"Demonstration run {run_id}: {len(contracts)} contracts, {flagged} flagged.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
