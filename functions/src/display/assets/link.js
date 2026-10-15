// A display link's own URL, /display/{clubId}#k=<token>. Signs in, reads the
// link's settings and moves to the page they name, which then follows any
// change to them. Shows nothing else, so it can sit in OBS or on a TV.

import { STATUS_MESSAGES, connect, el, followLink } from './display.js';

const status = el('p', 'status hidden');
document.getElementById('display').append(status);

function showStatus(message) {
  status.textContent = message ?? '';
  status.classList.toggle('hidden', !message);
}

connect({
  onLink: (settings) => {
    if (!settings) {
      showStatus(STATUS_MESSAGES['removed-link']);
      return;
    }
    followLink(settings);
  },
  onStatus: (next) => showStatus(STATUS_MESSAGES[next]),
});
