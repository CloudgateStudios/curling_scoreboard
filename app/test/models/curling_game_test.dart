import 'package:curling_scoreboard_flutter/constants.dart';
import 'package:curling_scoreboard_flutter/models/curling_end.dart';
import 'package:curling_scoreboard_flutter/models/curling_game.dart';
import 'package:curling_scoreboard_flutter/models/curling_team.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('CurlingGame', () {
    late CurlingTeam team1;
    late CurlingTeam team2;
    late CurlingGame game;

    setUp(() {
      team1 = CurlingTeam(
        name: 'Red',
        color: Constants.redTeamColor,
        textColor: Constants.textHighContrastColor,
        hasHammer: true,
      );
      team2 = CurlingTeam(
        name: 'Yellow',
        color: Constants.yellowTeamColor,
        textColor: Constants.textDefaultColor,
        hasHammer: false,
      );
      game = CurlingGame(
        team1: team1,
        team2: team2,
        numberOfEnds: 8,
        numberOfPlayersPerTeam: 4,
      );
    });

    test('Initial state', () {
      expect(game.team1.name, 'Red');
      expect(game.team2.name, 'Yellow');
      expect(game.numberOfEnds, 8);
      expect(game.numberOfPlayersPerTeam, 4);
      expect(game.ends, isEmpty);
      expect(game.currentPlayingEnd, 1);
      expect(game.isGameComplete, isFalse);
    });

    test('currentPlayingEndForDisplay returns correct value', () {
      expect(game.currentPlayingEndForDisplay, '1');
      game.currentPlayingEnd = 9;
      expect(game.currentPlayingEndForDisplay, 'E');
    });

    test('minutesPerEnd returns correct value', () {
      expect(game.minutesPerEnd, Constants.minutesPerEndFourPlayers);
      game.numberOfPlayersPerTeam = 2;
      expect(game.minutesPerEnd, Constants.minutesPerEndTwoPlayers);
    });

    test('team1TotalScore and team2TotalScore calculate correctly', () {
      game.ends = [
        CurlingEnd(endNumber: 1, scoringTeamName: 'Red', score: 2),
        CurlingEnd(endNumber: 2, scoringTeamName: 'Yellow', score: 1),
        CurlingEnd(endNumber: 3, scoringTeamName: 'Red', score: 3),
      ];
      expect(game.team1TotalScore, 5);
      expect(game.team2TotalScore, 1);
    });

    test('team1ScoresByEnd and team2ScoresByEnd return correct lists', () {
      game.ends = [
        CurlingEnd(endNumber: 1, scoringTeamName: 'Red', score: 2),
        CurlingEnd(endNumber: 2, scoringTeamName: 'Yellow', score: 1),
        CurlingEnd(endNumber: 3, scoringTeamName: 'Red', score: 3),
      ];
      expect(game.team1ScoresByEnd, [2, 0, 3]);
      expect(game.team2ScoresByEnd, [0, 1, 0]);
    });

    test(
      'isGameComplete is true when ends are filled and scores are not tied',
      () {
        game
          ..numberOfEnds = 2
          ..ends = [
            CurlingEnd(endNumber: 1, scoringTeamName: 'Red', score: 2),
            CurlingEnd(endNumber: 2, scoringTeamName: 'Yellow', score: 1),
          ];
        expect(game.isGameComplete, isTrue);
        game.ends = [
          CurlingEnd(endNumber: 1, scoringTeamName: 'Red', score: 2),
          CurlingEnd(endNumber: 2, scoringTeamName: 'Yellow', score: 2),
        ];
        expect(game.isGameComplete, isFalse);
      },
    );

    test(
      'evaluateHammer switches hammer correctly for normal and doubles games',
      () {
        // Normal game
        game.ends = [
          CurlingEnd(endNumber: 1, scoringTeamName: 'Red', score: 2),
        ];
        team1.hasHammer = true;
        team2.hasHammer = false;
        game.evaluateHammer();
        expect(team1.hasHammer, isFalse);
        expect(team2.hasHammer, isTrue);

        // Next end, Yellow scores
        game.ends.add(
          CurlingEnd(endNumber: 2, scoringTeamName: 'Yellow', score: 1),
        );
        game.evaluateHammer();
        expect(team1.hasHammer, isTrue);
        expect(team2.hasHammer, isFalse);

        // Doubles game, blank end
        game.numberOfPlayersPerTeam = 2;
        game.ends.add(
          CurlingEnd(endNumber: 3, scoringTeamName: 'Red', score: 0),
        );
        team1.hasHammer = true;
        team2.hasHammer = false;
        game.evaluateHammer();
        expect(team1.hasHammer, isFalse);
        expect(team2.hasHammer, isTrue);
      },
    );
  });
}
