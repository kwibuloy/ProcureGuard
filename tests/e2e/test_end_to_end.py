"""One small dataset through every layer: clean, load, score, API (Objective 6).

Checks that each layer reads what the previous one wrote. It uses its own
database on the local PostgreSQL server and removes it afterwards, so the
working database is never touched. Skipped when PostgreSQL or Node is not
available.

Run with: python -m pytest tests/e2e
"""

import json
import os
import shutil
import subprocess
import sys
import time
import urllib.request

import psycopg
import pytest
from psycopg import sql

from ml.data import load_contracts
from ml.indicators import compute, model_features
from ml.models import MODELS
from ml.score import score_contracts, store
from ml.settings import Settings
from pipeline import config
from pipeline.db import connect
from pipeline.load import clean_files
from pipeline.load import store as store_contracts
from pipeline.migrate import migrate

DATABASE = "procureguard_e2e"
API_PORT = 3987
API = f"http://127.0.0.1:{API_PORT}/api"
HEADER = (
    "Procuring Entity (PE),Region,PE Organization Type (Grouped),Bid Reference No.,Notice Title,"
    "Classification,Procurement Mode,Approved Budget of the Contract,Published Date,Closing Date,"
    "Award Reference No.,Award Title,Award Date,Contract Amount,Award Notice Status,"
    "Awardee Organization Name"
)
# The one contract built to be unusual on every indicator.
PLANTED_AWARD = "9000"


def _rows() -> list[str]:
    """Sixty ordinary contracts across four entities, one planted outlier, and noise."""
    rows = []
    for number in range(60):
        entity = f"Entity {number % 4}"
        budget = 2_000_000 + number * 10_000
        rows.append(
            f"{entity},Region {number % 2},LGU,{1000 + number},Road {number},Civil Works,"
            f"Public Bidding,{budget}.00,05/02/2024,26/02/2024,{5000 + number},Road {number},"
            f"10/03/2024,{budget * (0.96 + (number % 5) * 0.005):.2f},Posted,Builder {number % 9}"
        )
    # Entity 9 gives all six of its contracts to one awardee; the last is the outlier.
    for number in range(5):
        rows.append(
            f"Entity 9,Region 0,LGU,{2000 + number},Bridge {number},Civil Works,Public Bidding,"
            f"3000000.00,05/02/2024,26/02/2024,{6000 + number},Bridge {number},10/03/2024,"
            f"2910000.00,Posted,Sole Builder Corp."
        )
    rows.append(
        f"Entity 9,Region 0,LGU,2999,Bridge 9,Civil Works,Public Bidding,3000000.00,05/02/2024,"
        f"26/02/2024,{PLANTED_AWARD},Bridge 9,10/03/2024,1500000.00,Posted,SOLE BUILDER CORPORATION"
    )
    # Rows the pipeline must leave out.
    rows.append(
        "Entity 0,Region 0,LGU,3000,Paper,Goods,Public Bidding,1000.00,05/02/2024,26/02/2024,"
        "7000,Paper,10/03/2024,900.00,Posted,Supplier"
    )
    rows.append(
        "Entity 0,Region 0,LGU,3001,Unawarded road,Civil Works,Public Bidding,1000000.00,"
        "05/02/2024,26/02/2024,NULL,NULL,NULL,NULL,NULL,NULL"
    )
    return rows


def _get(path: str):
    with urllib.request.urlopen(f"{API}{path}", timeout=10) as response:
        return json.loads(response.read())


@pytest.fixture(scope="module")
def database():
    """A fresh, migrated database that exists only for this test run."""
    try:
        admin = connect()
    except (psycopg.OperationalError, KeyError) as error:
        pytest.skip(f"PostgreSQL is not available: {error}")
    admin.autocommit = True
    name = sql.Identifier(DATABASE)
    admin.execute(sql.SQL("DROP DATABASE IF EXISTS {} WITH (FORCE)").format(name))
    admin.execute(sql.SQL("CREATE DATABASE {}").format(name))

    previous = os.environ.get("POSTGRES_DB")
    os.environ["POSTGRES_DB"] = DATABASE
    connection = connect()
    migrate(connection)
    connection.commit()
    try:
        yield connection
    finally:
        connection.close()
        if previous is None:
            os.environ.pop("POSTGRES_DB", None)
        else:
            os.environ["POSTGRES_DB"] = previous
        admin.execute(sql.SQL("DROP DATABASE IF EXISTS {} WITH (FORCE)").format(name))
        admin.close()


@pytest.fixture(scope="module")
def scored(database, tmp_path_factory):
    """Clean and load the fixture file, add document request counts, score with both models."""
    path = tmp_path_factory.mktemp("raw") / "legacy_2024_Q1.csv"
    path.write_text("\n".join([HEADER, *_rows()]) + "\n", encoding="utf-8-sig")

    contracts, stats = clean_files([path])
    store_contracts(database, contracts, stats, [path.name])
    for contract in contracts:
        requests = 1 if contract.award_reference_no == PLANTED_AWARD else 4
        database.execute(
            "INSERT INTO bid_notices (source_series, bid_reference_no, fetch_status,"
            " document_request_count) VALUES ('legacy', %s, 'ok', %s)",
            [contract.bid_reference_no, requests],
        )

    settings = Settings(isolation_forest_trees=50, clusters=3, min_comparable_contracts=10)
    frame = load_contracts(database)
    indicators = compute(frame, settings)
    features = model_features(indicators)
    runs = {}
    for key in MODELS:
        result = score_contracts(features, key, settings)
        runs[key] = store(database, frame, indicators, result, settings)
    database.commit()
    return {"stats": stats, "runs": runs, "contracts": len(contracts)}


@pytest.fixture(scope="module")
def api(scored):
    """The real Express API, started against the test database."""
    if shutil.which("npx") is None or not (config.ROOT / "api" / "node_modules").exists():
        pytest.skip("Node dependencies for api/ are not installed")
    environment = {**os.environ, "POSTGRES_DB": DATABASE, "API_PORT": str(API_PORT)}
    process = subprocess.Popen(
        "npx tsx src/server.ts",
        cwd=config.ROOT / "api",
        env=environment,
        shell=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    try:
        for _ in range(60):
            try:
                _get("/health")
                break
            except OSError:
                time.sleep(0.5)
        else:
            pytest.fail("The API did not start within 30 seconds")
        yield
    finally:
        if sys.platform == "win32":
            subprocess.run(
                ["taskkill", "/PID", str(process.pid), "/T", "/F"], capture_output=True, check=False
            )
        else:
            process.terminate()
        process.wait(timeout=10)


def test_pipeline_keeps_only_awarded_civil_works_contracts(scored):
    stats = scored["stats"]

    assert scored["contracts"] == 66
    assert stats["not_civil_works"] == 1
    assert stats["not_awarded"] == 1


def test_names_written_two_ways_are_one_awardee(database, scored):
    awardees = database.execute(
        "SELECT count(DISTINCT awardee), count(DISTINCT awardee_raw) FROM contracts"
        " WHERE procuring_entity = 'ENTITY 9'"
    ).fetchone()

    assert awardees == (1, 2)


def test_api_serves_what_the_engine_stored(database, scored, api):
    for run_id in scored["runs"].values():
        overview = _get(f"/overview?run={run_id}")
        stored = database.execute(
            "SELECT count(*), count(*) FILTER (WHERE is_flagged) FROM contract_scores"
            " WHERE run_id = %s",
            [run_id],
        ).fetchone()

        assert overview["totals"]["contracts"] == stored[0] == 66
        assert overview["totals"]["flagged"] == stored[1]
        assert sum(band["count"] for band in overview["histogram"]) == 66


def test_the_planted_contract_ranks_first_in_both_models(scored, api):
    for run_id in scored["runs"].values():
        top = _get(f"/contracts?run={run_id}&flagged=true&pageSize=1")["items"][0]

        assert top["awardReference"] == PLANTED_AWARD
        assert top["rank"] == 1
        assert top["flagged"] is True


def test_the_explanation_adds_up_and_states_the_figures(scored, api):
    run_id = scored["runs"]["isolation-forest"]
    listed = _get(f"/contracts?run={run_id}&flagged=true&pageSize=1")["items"][0]
    detail = _get(f"/contracts/{listed['id']}?run={run_id}")
    base = _get(f"/overview?run={run_id}")["run"]["baseValue"]
    by_name = {item["indicator"]: item for item in detail["indicators"]}

    total = base + sum(item["contribution"] for item in detail["indicators"])
    assert total == pytest.approx(detail["score"], abs=1e-9)
    assert detail["documentRequests"] == 1
    assert by_name["single_requester"]["context"]["document_requests"] == 1
    assert by_name["repeated_winner"]["context"] == {"wins": 6, "entity_awards": 6}
    assert by_name["price_deviation"]["context"]["amount_to_budget_ratio"] == pytest.approx(0.5)
    # The other model's verdict on the same contract comes along.
    assert [other["runId"] for other in detail["otherRuns"]] == [scored["runs"]["clustering"]]


def test_profile_comparison_and_quality_endpoints_agree_with_the_data(scored, api):
    forest, clustering = scored["runs"]["isolation-forest"], scored["runs"]["clustering"]

    profile = _get(f"/profile?kind=entity&name=ENTITY%209&run={forest}")
    assert profile["contracts"] == 6
    assert profile["top"][0]["contracts"] == 6

    comparison = _get(f"/compare?a={forest}&b={clustering}")
    assert comparison["contracts"] == 66
    assert comparison["flaggedByBoth"] >= 1

    quality = _get("/data-quality")
    assert quality["contracts"] == 66
    assert quality["documentRequests"] == {"wanted": 66, "collected": 66}
    assert quality["load"]["intake"]["rows_read"] == 68
