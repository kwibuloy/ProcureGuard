"""Read cleaned contracts from PostgreSQL for scoring."""

from datetime import date

import pandas as pd

from pipeline.config import YEARS

QUERY = """
WITH repeated_line AS (
    -- Notices where one line item carries more than one award notice. PhilGEPS
    -- does not say which of them is the contract in force, so the notice's
    -- awarded total is not known.
    SELECT DISTINCT c.source_series, c.bid_reference_no
    FROM contracts c, unnest(c.line_items) AS line
    WHERE c.bid_reference_no IS NOT NULL
    GROUP BY c.source_series, c.bid_reference_no, line
    HAVING count(*) > 1
)
SELECT c.id,
       c.source_series,
       c.bid_reference_no,
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
       END::float8 AS notice_awarded_total,
       CASE WHEN c.bid_reference_no IS NULL THEN 1 ELSE count(*) OVER notice END
           AS notice_award_count,
       -- A notice awarded on only some of its line items is compared with the
       -- budget of those lines. Used only when the notice has several lines, every
       -- awarded line has a positive item budget, and their total is within the
       -- approved budget; otherwise the approved budget is used.
       CASE WHEN c.bid_reference_no IS NOT NULL
             AND sum(cardinality(c.line_items)) OVER notice > 1
             AND count(*) OVER notice = count(c.item_budget) OVER notice
             AND sum(c.item_budget) OVER notice <= c.approved_budget * 1.005
            THEN sum(c.item_budget) OVER notice
       END::float8 AS awarded_lines_budget,
       r.bid_reference_no IS NOT NULL AS repeated_line_award
FROM contracts c
LEFT JOIN repeated_line r
  ON r.source_series = c.source_series
 AND r.bid_reference_no = c.bid_reference_no
LEFT JOIN bid_notices n
  ON n.source_series = c.source_series
 AND n.bid_reference_no = c.bid_reference_no
 AND n.fetch_status = 'ok'
-- Awards dated before the study period (contracts loaded before load dropped them).
WHERE c.award_date IS NULL OR c.award_date >= %(study_start)s
WINDOW notice AS (PARTITION BY c.source_series, c.bid_reference_no)
ORDER BY c.id
"""


def load_contracts(connection) -> pd.DataFrame:
    with connection.cursor() as cursor:
        cursor.execute(QUERY, {"study_start": date(min(YEARS), 1, 1)})
        columns = [column.name for column in cursor.description]
        return pd.DataFrame(cursor.fetchall(), columns=columns)
