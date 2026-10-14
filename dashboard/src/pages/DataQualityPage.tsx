import { useApi, type DataQuality } from '../api';
import { BarList } from '../components/BarList';
import { Notice, PageHeader, Tile } from '../components/States';
import { formatCount, formatDate, formatPercent } from '../format';

/** Rows left out on the way from published rows to contracts, in the order it happens. */
const EXCLUSIONS: [string, string][] = [
  ['not_civil_works', 'Not civil works (goods, consulting and other classes)'],
  ['malformed_rows', 'Wrong number of columns, so the row could not be read'],
  ['not_awarded', 'Civil works with no award recorded'],
  ['award_cancelled', 'Award was cancelled'],
  ['no_procuring_entity', 'No procuring entity named'],
  ['extra_line_item_rows', 'Further line items of an award already counted'],
  ['repeated_in_another_file', 'Award already seen in another file'],
];

/** What the published data contained, what was left out, and what is missing. */
export function DataQualityPage() {
  const quality = useApi<DataQuality>('/api/data-quality');

  const header = (
    <PageHeader eyebrow="Data quality" title="What the scores are built on">
      Every score depends on records that procuring entities publish themselves. This page shows how
      many rows were read, which were left out and why, and how complete the remaining fields are.
      Nothing missing is filled in.
    </PageHeader>
  );

  if (quality.error) {
    return (
      <>
        {header}
        <div className="card">
          <Notice
            title="The data quality figures could not be loaded"
            icon="info"
            action={{ label: 'Try again', onClick: quality.reload }}
          />
        </div>
      </>
    );
  }
  if (!quality.data) {
    return (
      <>
        {header}
        <div className="card skeleton skeleton-block" aria-busy="true" />
      </>
    );
  }

  const data = quality.data;
  if (!data.contracts) {
    return (
      <>
        {header}
        <div className="card">
          <Notice title="No contracts have been loaded yet">
            Download the PhilGEPS files and run the loading step.
          </Notice>
        </div>
      </>
    );
  }

  const intake = data.load?.intake ?? {};
  const rowsRead = intake.rows_read ?? 0;
  const requests = data.documentRequests;
  const unreadable = Object.entries(intake).filter(([key]) => key.startsWith('unreadable'));
  const fields = [...data.fields].sort((first, second) => first.present - second.present);
  const names = [
    ['Procuring entities', intake.entity_names_published, intake.entity_names_standardized],
    ['Awardees', intake.awardee_names_published, intake.awardee_names_standardized],
  ] as const;

  return (
    <>
      {header}

      <dl className="tiles tiles-4">
        <Tile
          label="Contracts available for scoring"
          value={formatCount(data.contracts)}
          note={rowsRead ? `from ${formatCount(rowsRead)} published rows` : undefined}
        />
        <Tile
          label="Notices published"
          value={data.firstPublished ? formatDate(data.firstPublished) : 'Not published'}
          note={data.lastPublished ? `to ${formatDate(data.lastPublished)}` : undefined}
        />
        <Tile
          label="Document request counts collected"
          value={formatPercent(requests.wanted ? requests.collected / requests.wanted : 0)}
          note={`${formatCount(requests.collected)} of ${formatCount(requests.wanted)} public bidding contracts`}
          share={requests.wanted ? requests.collected / requests.wanted : 0}
        />
        <Tile
          label="Procured through public bidding"
          value={formatPercent(data.publicBidding / data.contracts)}
          note={`${formatCount(data.publicBidding)} contracts`}
          share={data.publicBidding / data.contracts}
        />
      </dl>

      <section className="quality-grid">
        <div className="card">
          <h2>From published rows to contracts</h2>
          <p className="card-note">
            A published row is one line item, so a contract usually spans several rows. Only awarded
            civil works contracts are kept.
          </p>
          {rowsRead ? (
            <>
              <BarList
                max={rowsRead}
                items={[
                  {
                    key: 'read',
                    label: 'Rows read',
                    value: rowsRead,
                    display: formatCount(rowsRead),
                  },
                  {
                    key: 'civil',
                    label: 'Civil works rows',
                    value: intake.civil_works_rows ?? 0,
                    display: formatCount(intake.civil_works_rows ?? 0),
                  },
                  {
                    key: 'contracts',
                    label: 'Contracts kept',
                    value: intake.contracts ?? data.contracts,
                    display: formatCount(intake.contracts ?? data.contracts),
                  },
                ]}
              />
              <h3 className="subhead">Rows left out</h3>
              <table className="plain-table">
                <tbody>
                  {EXCLUSIONS.filter(([key]) => intake[key]).map(([key, label]) => (
                    <tr key={key}>
                      <th scope="row">{label}</th>
                      <td>{formatCount(intake[key]!)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          ) : (
            <Notice title="No load report is stored" />
          )}
        </div>

        <div className="card">
          <h2>How complete each field is</h2>
          <p className="card-note">
            Share of contracts where the field is published, least complete first. An indicator that
            needs a missing field is not computed for that contract.
          </p>
          <BarList
            max={data.contracts}
            items={fields.map((field) => ({
              key: field.field,
              label: field.label,
              value: field.present,
              display: formatPercent(field.present / data.contracts, 1),
              note: `${formatCount(data.contracts - field.present)} missing · needed for ${field.usedFor.toLowerCase()}`,
            }))}
          />
        </div>
      </section>

      <section className="quality-grid">
        <div className="card">
          <h2>Names written more than one way</h2>
          <p className="card-note">
            The same organization is often published under several spellings. Names are standardized
            so its contracts are counted together; the published spelling is kept.
          </p>
          <table className="plain-table">
            <thead>
              <tr>
                <th scope="col" />
                <th scope="col">Spellings published</th>
                <th scope="col">After standardizing</th>
              </tr>
            </thead>
            <tbody>
              {names.map(([label, published, standardized]) => (
                <tr key={label}>
                  <th scope="row">{label}</th>
                  <td>{published === undefined ? 'n/a' : formatCount(published)}</td>
                  <td>{standardized === undefined ? 'n/a' : formatCount(standardized)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card">
          <h2>Values that cannot be right</h2>
          <p className="card-note">
            These are kept as published and counted here. They point to entry errors a reviewer
            should expect to meet.
          </p>
          <table className="plain-table">
            <tbody>
              <tr>
                <th scope="row">Contracts awarded before the notice was published</th>
                <td>{formatCount(data.awardedBeforePublished)}</td>
              </tr>
              <tr>
                <th scope="row">Contract amount above the approved budget</th>
                <td>{formatCount(data.amountAboveBudget)}</td>
              </tr>
              {unreadable.map(([key, count]) => (
                <tr key={key}>
                  <th scope="row">Unreadable value in “{key.split(': ')[1]}”</th>
                  <td>{formatCount(count)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {data.load && (
        <p className="page-foot">
          Loaded {formatDate(data.load.loadedAt)} from {data.load.sourceFiles.join(', ')}.
        </p>
      )}
    </>
  );
}
