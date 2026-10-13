# PhilGEPS data source

What was verified about the PhilGEPS Open Data Portal on 2026-10-13. Re-check before relying on it; the portal changes.

## Where the data is

1. `https://philgeps.gov.ph/CmsHomePages/open-data` links to seven public Power BI reports. There is no API.
2. The **Datasets** report is a page of links to Google Drive files: one CSV per quarter, in two series.
   - **PhilGEPS 1.5** (legacy system): 260 to 373 MB per quarter. Nearly all records are here.
   - **Modernized PhilGEPS 2.0**: 180 to 790 KB per quarter (397 rows for 2024 Q4).
3. A public Drive file downloads from `https://drive.usercontent.google.com/download?id=<FILE_ID>&export=download&confirm=t`. A restricted one redirects to a Google sign-in page instead; check the response is not HTML.

Download speed measured here was about 280 KB/s, roughly 20 minutes per legacy file.

## Which quarters are public

| Year | Legacy 1.5 |
|---|---|
| 2021 | All four quarters |
| 2022 | Q2, Q3, Q4 public; Q1 restricted |
| 2023 | None |
| 2024 | All four quarters |
| 2025 | None; Q4 has no link |

Restricted files answer "The organization that owns this item doesn't allow you to access it" even when signed in. Restricted quarters were matched to links by their order on the Datasets page; public ones are confirmed by file name.

### 2024 file IDs

| Quarter | Legacy 1.5 | Modernized 2.0 |
|---|---|---|
| Q1 Jan-Mar | `12giiBfKdKXEJN5ADJqsTzujtJEX2tdop` | `16PQO-RlUARu8Yh7zxel4b3Tet-S1r3js` |
| Q2 Apr-Jun | `1fRDMW5myhn_1JHthpmeijsGzKqj7NGtL` | same ID as Q1 on the portal; contents not checked |
| Q3 Jul-Sep | `13LI2GC9VWNXi1zow93xNYzekuU3FyLua` | `1Hgjk994GVu6rWeO6jUcNZ_wK2G7mKLK0` |
| Q4 Oct-Dec | `1y4-jcz_SmUiNd_oqyjtK9yWu1W1QCvHt` | `1n71MlwYuZzghSEbAhs6KGW4aSLtK_wVy` |

## CSV columns (legacy 1.5, 46 columns)

Procuring Entity (PE), Region, Province, City/Municipality, Government Branch, PE Organization Type, PE Organization Type (Grouped), Bid Reference No., Notice Title, Classification, Procurement Mode, Business Category, Funding Source, Funding Instrument, Trade Agreement, Approved Budget of the Contract, Published Date, Closing Date, Area of Delivery, Contract Duration, Calendar Type, Line Item No, Item Name, Item Description, Quantity, UOM, Item Budget, Bid Notice Status, Award Reference No., Award Title, UNSPSC Code, UNSPSC Description, Published Date(Award), Award Date, Contract Amount, Award Notice Status, Notice to Proceed Date, Contract Effectivity Date, Contract End Date, Awardee Organization Name, Country of Awardee, Region of Awardee, Province of Awardee, City/Municipality of Awardee, Awardee Size, Awardee Joint Venture.

The 2.0 series also has 46 columns but they differ: `Procuring Entity`, `Source of Funds` (no Funding Source/Instrument), `Approved Budget of the Contract (ABC)`, `Lot Type`, `Item Code`, `Item/Lot Name`, `Item/Lot Description`, `Unit of Measure`, `Published Date (Award)`.

**There is no number-of-bidders column, bidder list or losing-bid data in either series.**

## Things the pipeline must handle

Observed in the first 78 MB of the 2024 Q4 legacy file (104,709 rows, about a fifth of the file):

- Encoding is UTF-8 with a BOM.
- Missing values are the literal text `NULL`.
- Dates are `DD/MM/YYYY` in the legacy series and `YYYY-MM-DD` in 2.0.
- One row is a line item, not a contract. Collapse to contract level using `Bid Reference No.` and `Award Reference No.`.
- `Bid Reference No.` is `0` for some awards made without a posted bid notice (alternative modes).
- Infrastructure records are `Classification = Civil Works` (about 11% of sampled rows). The 2.0 site's own label is "Civil Works - Infra Project"; confirm the value used in 2.0 files.
- About a third of civil works rows had no awardee, award date or contract amount.
- `Business Category` is "Construction Projects" for 92% of civil works rows, so it cannot define comparable contracts.
- Median contract amount was 99.0% of the approved budget; 44% of awarded rows were at 99% or above.
- Some 2.0 rows have fewer columns than the header, with values shifted out of place.

## Document request count (proxy for the single-bidder indicator)

The legacy notice site has a public page per bid notice, no login needed:

`https://notices.philgeps.gov.ph/GEPSNONPILOT/Tender/PrintableBidNoticeAbstractUI.aspx?refID=<Bid Reference No.>`

The field **Document Request List** (HTML element id `lblDisplayDocReqList`) holds a count. Checked on three 2024 Q4 civil works notices: 4, 5 and 2. The same page has `lblDisplayBidSupplements` and `lblDisplayStatus`.

Limits of this number:

- By its label it counts suppliers who requested the bidding documents through PhilGEPS. No official definition has been found.
- It is not the number of bids submitted. A supplier can request documents and not bid, and documents can also be obtained from the agency directly.
- Notices with `Bid Reference No.` of `0` have no page, so no count.
- It needs one page request per notice. `pipeline/notices.py` fetches slowly and stores the parsed counts (not the page itself) in `bid_notices`, so a notice is never fetched twice.
- A reference with no notice redirects to `ErrorPage/ErrorPage.aspx` with HTTP 200. The site may answer its own errors the same way, so a long run of missing pages stops the scraper.

Not verified: whether award notice pages are public or list bidders (the addresses tried returned a generic page), and whether notices from the 2.0 system have an equivalent page.
