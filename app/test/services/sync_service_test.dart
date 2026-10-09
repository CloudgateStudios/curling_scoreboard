import 'package:curling_scoreboard/models/models.dart';
import 'package:curling_scoreboard/services/sync_service.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('SyncService.isPairingLostError', () {
    FirebaseException firestoreError(String code) =>
        FirebaseException(plugin: 'cloud_firestore', code: code);

    test('a refused write means the pairing is gone', () {
      expect(
        SyncService.isPairingLostError(firestoreError('permission-denied')),
        isTrue,
      );
      expect(
        SyncService.isPairingLostError(firestoreError('not-found')),
        isTrue,
      );
    });

    test('a connection problem does not', () {
      expect(
        SyncService.isPairingLostError(firestoreError('unavailable')),
        isFalse,
      );
      expect(SyncService.isPairingLostError(Exception('offline')), isFalse);
    });
  });

  group('SyncService.liveGameFields', () {
    CurlingGame game({GameLeague? league}) => CurlingGame(
      team1: CurlingTeam(
        name: league == null ? 'Blue' : 'Team Smith',
        colorName: 'Blue',
        color: const Color(0xFF2196F3),
        textColor: Colors.white,
        hasHammer: false,
        hadLastStoneFirstEnd: true,
        teamId: league == null ? null : 't1',
        externalId: league == null ? null : '1042',
      ),
      team2: CurlingTeam(
        name: league == null ? 'Green' : 'Team Jones',
        colorName: 'Green',
        color: const Color(0xFF4CAF50),
        textColor: Colors.white,
        hasHammer: true,
        teamId: league == null ? null : 't2',
      ),
      numberOfEnds: 8,
      numberOfPlayersPerTeam: 4,
      currentPlayingEnd: 2,
      league: league,
      ends: [
        CurlingEnd(endNumber: 1, scoringTeam: ScoringTeam.team1, score: 3),
      ],
    );

    test('an open game names each team by its rock color', () {
      expect(SyncService.liveGameFields(game()), {
        'currentEnd': 2,
        'team1': {
          'name': 'Blue',
          'color': {'name': 'Blue', 'hex': '#2196F3'},
          'score': 3,
          'hasHammer': false,
          'hadLastStoneFirstEnd': true,
        },
        'team2': {
          'name': 'Green',
          'color': {'name': 'Green', 'hex': '#4CAF50'},
          'score': 0,
          'hasHammer': true,
          'hadLastStoneFirstEnd': false,
        },
      });
    });

    test('a league game carries the league, team names and team IDs', () {
      final fields = SyncService.liveGameFields(
        game(
          league: const GameLeague(id: 'monday', name: 'Monday Night'),
        ),
      );
      expect(fields['league'], {'id': 'monday', 'name': 'Monday Night'});
      expect(fields['team1'], {
        'name': 'Team Smith',
        'color': {'name': 'Blue', 'hex': '#2196F3'},
        'teamId': 't1',
        'externalId': '1042',
        'score': 3,
        'hasHammer': false,
        'hadLastStoneFirstEnd': true,
      });
      // No external ID was supplied for this team, so none is sent.
      expect((fields['team2'] as Map).containsKey('externalId'), isFalse);
      expect((fields['team2'] as Map)['teamId'], 't2');
    });

    test('last stone in the first end stays put as the hammer moves', () {
      final played = game()
        ..team1.hasHammer = true
        ..team2.hasHammer = false;
      final fields = SyncService.liveGameFields(played);
      expect((fields['team1'] as Map)['hasHammer'], isTrue);
      expect((fields['team1'] as Map)['hadLastStoneFirstEnd'], isTrue);
      expect((fields['team2'] as Map)['hadLastStoneFirstEnd'], isFalse);
    });
  });
}
