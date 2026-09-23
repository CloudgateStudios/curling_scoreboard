import 'package:curling_scoreboard/models/curling_end.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('CurlingEnd', () {
    test('Constructor assigns properties correctly', () {
      final end = CurlingEnd(
        endNumber: 2,
        scoringTeam: ScoringTeam.team1,
        score: 3,
        gameTimeInSeconds: 120,
      );
      expect(end.endNumber, 2);
      expect(end.scoringTeam, ScoringTeam.team1);
      expect(end.score, 3);
      expect(end.gameTimeInSeconds, 120);
    });

    test('Default gameTimeInSeconds is -1', () {
      final end = CurlingEnd(
        endNumber: 1,
        scoringTeam: ScoringTeam.team2,
        score: 2,
      );
      expect(end.gameTimeInSeconds, -1);
    });

    test('round trips the scoring team through JSON', () {
      final end = CurlingEnd(
        endNumber: 4,
        scoringTeam: ScoringTeam.team2,
        score: 2,
        gameTimeInSeconds: 90,
      );

      final restored = CurlingEnd.fromJson(end.toJson());

      expect(restored.endNumber, 4);
      expect(restored.scoringTeam, ScoringTeam.team2);
      expect(restored.score, 2);
      expect(restored.gameTimeInSeconds, 90);
    });

    test('reads a blank end with no scoring team', () {
      final restored = CurlingEnd.fromJson({
        'endNumber': 5,
        'score': 0,
        'scoringTeam': null,
        'gameTimeInSeconds': 30,
      });

      expect(restored.scoringTeam, isNull);
    });

    test('older ends stored by team name decode without a scoring team', () {
      // Games written before ends were attributed by slot stored the display
      // name here. There is no way to map that back to a slot, so it decodes
      // to null rather than guessing.
      final restored = CurlingEnd.fromJson({
        'endNumber': 1,
        'score': 2,
        'scoringTeam': 'Red',
        'gameTimeInSeconds': 60,
      });

      expect(restored.scoringTeam, isNull);
    });
  });
}
