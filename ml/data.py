"""Read cleaned contracts from PostgreSQL for scoring."""

import pandas as pd

QUERY = """
SELECT c.id,
       c.procuring_entity,
       c.awardee,
       c.region,
       c.procurement_mode,
       c.approved_budget::float8 AS approved_budget,
       c.contract_amount::float8 AS contract_amount,
       c.source_file,
       n.document_request_count::float8 AS document_requests,
       -- A notice can be awarded in several lots that share one approved budget,
       -- so price is compared at notice level.
       CASE WHEN c.bid_reference_no IS NULL THEN c.contract_amount
            ELSE sum(c.contract_amount) OVER (PARTITION BY c.source_series, c.bid_reference_no)
       END::float8 AS notice_awarded_total
FROM contracts c
LEFT JOIN bid_notices n
  ON n.source_series = c.source_series
 AND n.bid_reference_no = c.bid_reference_no
 AND n.fetch_status = 'ok'
ORDER BY c.id
"""


def load_contracts(connection) -> pd.DataFrame:
    with connection.cursor() as cursor:
        cursor.execute(QUERY)
        columns = [column.name for column in cursor.description]
        return pd.DataFrame(cursor.fetchall(), columns=columns)
