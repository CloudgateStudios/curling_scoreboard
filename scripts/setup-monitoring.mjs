#!/usr/bin/env node
/**
 * Puts the usage dashboard, and the alerts that email us, in a project's
 * Cloud Monitoring. What they watch is in monitoring.mjs.
 *
 * Safe to re-run: the dashboard, each alert and the email channel are found
 * by name and updated in place, so editing monitoring.mjs and running this
 * again brings the project up to date.
 *
 * Alerts cost about $0.10 a condition a month, so they go on prod, and on
 * dev only with --alerts. The dashboard is free and goes on both.
 *
 * Uses your gcloud sign in (`gcloud auth login`), not application default
 * credentials, and needs the Monitoring Editor role on the project.
 *
 *   node setup-monitoring.mjs you@example.com --dry-run      # print, change nothing
 *   node setup-monitoring.mjs you@example.com                # dev: dashboard only
 *   FIREBASE_PROJECT_ID=curling-scoreboard-prod node setup-monitoring.mjs you@example.com
 */

import { execFileSync } from 'node:child_process';
import { alertPolicies, dashboard } from './monitoring.mjs';

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'curling-scoreboard-dev';
const args = process.argv.slice(2);
const email = args.find((arg) => !arg.startsWith('--'));
const dryRun = args.includes('--dry-run');
const withAlerts = PROJECT_ID.endsWith('-prod') || args.includes('--alerts');

if (!email || !email.includes('@')) {
  console.error('Usage: node setup-monitoring.mjs <email for alerts> [--alerts] [--dry-run]');
  process.exit(1);
}

const V3 = `https://monitoring.googleapis.com/v3/projects/${PROJECT_ID}`;
const V1 = `https://monitoring.googleapis.com/v1/projects/${PROJECT_ID}`;

let token;
async function call(method, url, body) {
  token ??= execFileSync('gcloud', ['auth', 'print-access-token'], { encoding: 'utf8' }).trim();
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      // Bills the call to the project, not to whichever gcloud uses by default.
      'x-goog-user-project': PROJECT_ID,
      'Content-Type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${url}: ${res.status}\n${text}`);
  return text ? JSON.parse(text) : {};
}

/** Every page of a list call. */
async function listAll(url, key) {
  const items = [];
  let pageToken;
  do {
    const page = await call('GET', pageToken ? `${url}${url.includes('?') ? '&' : '?'}pageToken=${pageToken}` : url);
    items.push(...(page[key] ?? []));
    pageToken = page.nextPageToken;
  } while (pageToken);
  return items;
}

async function emailChannel() {
  const filter = encodeURIComponent('type="email"');
  const channels = await listAll(`${V3}/notificationChannels?filter=${filter}`, 'notificationChannels');
  const found = channels.find((channel) => channel.labels?.email_address === email);
  if (found) return found.name;
  const created = await call('POST', `${V3}/notificationChannels`, {
    type: 'email',
    displayName: `Curling scoreboard alerts: ${email}`,
    labels: { email_address: email },
  });
  console.log(`Created the email channel for ${email}.`);
  return created.name;
}

async function putAlerts() {
  const channel = await emailChannel();
  const existing = await listAll(`${V3}/alertPolicies`, 'alertPolicies');
  for (const policy of alertPolicies) {
    const body = { ...policy, notificationChannels: [channel] };
    const found = existing.find((p) => p.displayName === policy.displayName);
    if (found) {
      // With no update mask the whole policy is replaced by this one.
      await call('PATCH', `https://monitoring.googleapis.com/v3/${found.name}`, { ...body, name: found.name });
      console.log(`Updated the alert "${policy.displayName}".`);
    } else {
      await call('POST', `${V3}/alertPolicies`, body);
      console.log(`Created the alert "${policy.displayName}".`);
    }
  }
}

async function putDashboard() {
  const existing = await listAll(`${V1}/dashboards`, 'dashboards');
  const found = existing.find((d) => d.displayName === dashboard.displayName);
  if (found) {
    await call('PATCH', `https://monitoring.googleapis.com/v1/${found.name}`, {
      ...dashboard, name: found.name, etag: found.etag,
    });
    console.log(`Updated the dashboard "${dashboard.displayName}".`);
  } else {
    await call('POST', `${V1}/dashboards`, dashboard);
    console.log(`Created the dashboard "${dashboard.displayName}".`);
  }
}

async function main() {
  console.log(`Project ${PROJECT_ID}: the dashboard${withAlerts ? `, and ${alertPolicies.length} alerts to ${email}` : ''}.`);
  if (dryRun) {
    console.log(JSON.stringify({ dashboard, alertPolicies: withAlerts ? alertPolicies : [] }, null, 2));
    return;
  }
  await putDashboard();
  if (withAlerts) await putAlerts();
  console.log(`Open it at https://console.cloud.google.com/monitoring/dashboards?project=${PROJECT_ID}`);
}

main().catch((err) => {
  console.error(err.message);
  if (/SERVICE_DISABLED/.test(err.message)) {
    console.error(`Turn the API on first: gcloud services enable monitoring.googleapis.com --project ${PROJECT_ID}`);
  }
  process.exit(1);
});
