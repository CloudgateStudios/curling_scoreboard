import 'package:curling_scoreboard_flutter/models/curling_end.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('CurlingEnd', () {
    test('Constructor assigns properties correctly', () {
      final end = CurlingEnd(
        endNumber: 2,
        scoringTeamName: 'Red',
        score: 3,
        gameTimeInSeconds: 120,
      );
      expect(end.endNumber, 2);
      expect(end.scoringTeamName, 'Red');
      expect(end.score, 3);
      expect(end.gameTimeInSeconds, 120);
    });

    test('Default gameTimeInSeconds is -1', () {
      final end = CurlingEnd(
        endNumber: 1,
        scoringTeamName: 'Yellow',
        score: 2,
      );
      expect(end.gameTimeInSeconds, -1);
    });
  });
}
