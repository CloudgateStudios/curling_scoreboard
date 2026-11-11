// Run with `npm test`. Node strips the types from the .ts imports itself.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { clubPath, landingSection, sectionFromOldQuery } from './clubPaths.ts';

describe('clubPath', () => {
  test('is the club itself without a section', () => {
    assert.equal(clubPath('granite'), '/clubs/granite');
  });

  test('adds the section', () => {
    assert.equal(clubPath('granite', 'settings/club'), '/clubs/granite/settings/club');
  });
});

describe('landingSection', () => {
  test('opens bonspiel admins on bonspiels', () => {
    assert.equal(landingSection('bonspieladmin'), 'bonspiels');
  });

  test('opens everyone else on sheets', () => {
    assert.equal(landingSection('clubadmin'), 'sheets');
    assert.equal(landingSection('superadmin'), 'sheets');
  });
});

describe('sectionFromOldQuery', () => {
  test('is null without a tab', () => {
    assert.equal(sectionFromOldQuery(''), null);
    assert.equal(sectionFromOldQuery('?view=brackets'), null);
  });

  test('maps each old tab', () => {
    assert.equal(sectionFromOldQuery('?tab=sheets'), 'sheets');
    assert.equal(sectionFromOldQuery('?tab=leagues'), 'leagues');
    assert.equal(sectionFromOldQuery('?tab=bonspiels'), 'bonspiels');
    assert.equal(sectionFromOldQuery('?tab=displays'), 'displays');
  });

  test('maps each old settings group, defaulting to scoreboards as before', () => {
    assert.equal(sectionFromOldQuery('?tab=settings'), 'settings/scoreboards');
    assert.equal(sectionFromOldQuery('?tab=settings&section=integrations'), 'settings/integrations');
    assert.equal(sectionFromOldQuery('?tab=settings&section=admins'), 'users');
  });

  test('ignores a tab it does not know', () => {
    assert.equal(sectionFromOldQuery('?tab=nope'), null);
  });
});
