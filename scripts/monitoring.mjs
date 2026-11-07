/**
 * The alerts and the dashboard that setup-monitoring.mjs puts in a project.
 * They watch the things that cost money or show that something is wrong:
 * Firestore reads and writes against the daily free allowance, function
 * requests, requests turned away or failing, and errors in the functions'
 * logs.
 *
 * Each alert condition costs about $0.10 a month, so there are few of them,
 * and only prod gets them unless asked. The dashboard is free.
 */

// The free allowances these are set against. See the "Staying in the free
// tier" section of docs/RATE_LIMITING_PROPOSAL.md.
const FREE_READS_A_DAY = 50_000;
const FREE_WRITES_A_DAY = 20_000;

const DAY = '86400s';
const HOUR = '3600s';

const READS = 'metric.type="firestore.googleapis.com/document/read_count" AND resource.type="firestore_instance"';
const WRITES = 'metric.type="firestore.googleapis.com/document/write_count" AND resource.type="firestore_instance"';
const DELETES = 'metric.type="firestore.googleapis.com/document/delete_count" AND resource.type="firestore_instance"';
const REQUESTS = 'metric.type="run.googleapis.com/request_count" AND resource.type="cloud_run_revision"';
const TURNED_AWAY_OR_FAILED =
  `${REQUESTS} AND (metric.label.response_code="429" OR metric.label.response_code_class="5xx")`;
const INSTANCES = 'metric.type="run.googleapis.com/container/instance_count" AND resource.type="cloud_run_revision"';

const WHAT_TO_DO = `
See docs/architecture/monitoring.md for what to do. In short: find the
function and the caller in Logs Explorer, then use the switch that fits,
such as rotating a club's API key, turning off its scores page or
resetting a display link.`.trim();

/** A condition that fires when the sum of a counter over [window] passes [over]. */
function sumOver(displayName, filter, window, over) {
  return {
    displayName,
    conditionThreshold: {
      filter,
      aggregations: [{
        alignmentPeriod: window,
        perSeriesAligner: 'ALIGN_SUM',
        crossSeriesReducer: 'REDUCE_SUM',
      }],
      comparison: 'COMPARISON_GT',
      thresholdValue: over,
      duration: '0s',
      trigger: { count: 1 },
    },
  };
}

function policy(displayName, condition, summary, extra = {}) {
  return {
    displayName: `Curling scoreboard: ${displayName}`,
    combiner: 'OR',
    enabled: true,
    conditions: [condition],
    documentation: { mimeType: 'text/markdown', content: `${summary}\n\n${WHAT_TO_DO}` },
    alertStrategy: { autoClose: '86400s' },
    ...extra,
  };
}

export const alertPolicies = [
  policy(
    'Firestore reads',
    sumOver('Reads in the last day', READS, DAY, FREE_READS_A_DAY / 2),
    'Firestore has read more than half of its free daily allowance in the last 24 hours.',
  ),
  policy(
    'Firestore writes',
    sumOver('Writes in the last day', WRITES, DAY, FREE_WRITES_A_DAY / 2),
    'Firestore has written more than half of its free daily allowance in the last 24 hours.',
  ),
  policy(
    'Function requests',
    // About a third of the month's allowance spread over its days.
    sumOver('Requests in the last day', REQUESTS, DAY, 20_000),
    'The functions have had more requests in the last 24 hours than a third of the free allowance allows for a day. Dev and prod share that allowance.',
  ),
  policy(
    'Requests turned away or failing',
    sumOver('429s and 5xx in the last hour', TURNED_AWAY_OR_FAILED, HOUR, 20),
    'More than 20 requests in the last hour were turned away (429: a rate limit, or a function at its instance ceiling) or failed (5xx). Rate limits each log a "Rate limited" line naming the limit and the caller.',
  ),
  policy(
    'Errors in the function logs',
    {
      displayName: 'An error was logged',
      conditionMatchedLog: { filter: 'resource.type="cloud_run_revision" AND severity>=ERROR' },
    },
    'A function logged an error. Further errors in the next hour are not sent again.',
    // A log condition must say how often it may notify.
    { alertStrategy: { autoClose: '86400s', notificationRateLimit: { period: HOUR } } },
  ),
];

/** One chart, summed by the hour, with a line or bars for each filter,
 *  each split by [groupBy]. */
function chart(title, filters, { groupBy = [], aligner = 'ALIGN_SUM', reducer = 'REDUCE_SUM', plot = 'STACKED_BAR' } = {}) {
  return {
    title,
    xyChart: {
      dataSets: filters.map((filter) => ({
        plotType: plot,
        timeSeriesQuery: {
          timeSeriesFilter: {
            filter,
            aggregation: {
              alignmentPeriod: HOUR,
              perSeriesAligner: aligner,
              crossSeriesReducer: reducer,
              groupByFields: groupBy,
            },
          },
        },
      })),
    },
  };
}

const byService = ['resource.label.service_name'];
const widgets = [
  chart('Firestore reads an hour', [READS]),
  chart('Firestore writes and deletes an hour', [WRITES, DELETES]),
  chart('Function requests an hour, by function', [REQUESTS], { groupBy: byService }),
  chart('Requests turned away (429) or failing (5xx), by function', [TURNED_AWAY_OR_FAILED], {
    groupBy: [...byService, 'metric.label.response_code'],
  }),
  chart('Most instances running, by function', [INSTANCES], {
    groupBy: byService, aligner: 'ALIGN_MAX', reducer: 'REDUCE_SUM', plot: 'LINE',
  }),
];

export const dashboard = {
  displayName: 'Curling scoreboard usage',
  mosaicLayout: {
    columns: 12,
    tiles: widgets.map((widget, i) => ({
      xPos: (i % 2) * 6,
      yPos: Math.floor(i / 2) * 4,
      width: 6,
      height: 4,
      widget,
    })),
  },
};
