// cspell:ignore DXCUM VDBJ DKWD FGUK Mrhl
// The Firebase web config the display pages sign in and listen with. These
// values are not secrets. They match admin/src/lib/firebase.ts, which uses
// the same web apps.

export interface WebConfig {
  apiKey: string;
  authDomain?: string;
  projectId: string;
  appId?: string;
}

const CONFIGS: Record<string, WebConfig> = {
  'curling-scoreboard-dev': {
    apiKey: 'AIzaSyDXCUM2AxKD73rQIy53ArxDspVYbVDBJ68',
    authDomain: 'curling-scoreboard-dev.firebaseapp.com',
    projectId: 'curling-scoreboard-dev',
    appId: '1:233388384349:web:089c4df4fd9230c9076db4',
  },
  'curling-scoreboard-prod': {
    apiKey: 'AIzaSyDKWdlQbyMrhlVd7IvzXlFGukUHeGgHZh4',
    authDomain: 'curling-scoreboard-prod.firebaseapp.com',
    projectId: 'curling-scoreboard-prod',
    appId: '1:513864345938:web:38ea0259c2b9099002b28b',
  },
};

/** The project the functions run in, as both the runtime and emulator set. */
export function currentProjectId(): string {
  return process.env['GCLOUD_PROJECT'] ?? process.env['GOOGLE_CLOUD_PROJECT'] ?? '';
}

/** The web config for [projectId]. The emulators accept any API key. */
export function webConfig(projectId: string): WebConfig {
  return CONFIGS[projectId] ?? { apiKey: 'fake-api-key', projectId };
}
