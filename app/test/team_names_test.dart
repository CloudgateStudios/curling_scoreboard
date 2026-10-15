import 'package:curling_scoreboard/main.dart';
import 'package:curling_scoreboard/models/models.dart';
import 'package:curling_scoreboard/services/league_service.dart';
import 'package:curling_scoreboard/services/registration_service.dart';
import 'package:curling_scoreboard/widgets/game_start/league_matchup_picker.dart';
import 'package:curling_scoreboard/widgets/widgets.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'helpers/pump_app.dart';

const _league = League(
  id: 'monday',
  name: 'Monday Night',
  teams: [
    LeagueTeam(id: 't1', name: 'Team Smith'),
    LeagueTeam(id: 't2', name: 'Team Jones'),
  ],
);

/// Pumps the app with a club that has [leagues], and starts an open game.
Future<void> _startOpenGame(
  WidgetTester tester, {
  List<League> leagues = const [_league],
}) async {
  tester.view.physicalSize = scoreboardTestSurfaceSize;
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);

  SharedPreferences.setMockInitialValues({});
  final prefs = await SharedPreferences.getInstance();
  final registration = RegistrationService(prefs);
  final leagueService = LeagueService(prefs, registration);
  leagueService.leagues.value = leagues;

  await tester.pumpWidget(
    CurlingScoreboardApp(
      registrationService: registration,
      leagueService: leagueService,
    ),
  );
  await tester.pumpAndSettle();
  await tester.tap(find.text('Start Game'));
  await tester.pumpAndSettle();
}

/// Picks Team Smith for the first rock color and Team Jones for the second,
/// from the league chooser on.
Future<void> _pickTeams(WidgetTester tester) async {
  await tester.tap(find.text('Monday Night'));
  await tester.pumpAndSettle();
  await tester.tap(find.text('Team Smith'));
  await tester.pump();
  await tester.tap(find.text('Team Jones'));
  await tester.pump();
  await tester.tap(find.text('Done'));
  await tester.pumpAndSettle();
}

/// The font size of a team's total score on the scoreboard.
double _scoreSize(WidgetTester tester) => tester
    .widget<Text>(
      find.descendant(
        of: find.byType(TeamTotalScoreWidget).first,
        matching: find.text('0'),
      ),
    )
    .style!
    .fontSize!;

void main() {
  testWidgets('an open game shows no team names under the scores', (
    tester,
  ) async {
    await _startOpenGame(tester);

    final scores = find.byType(TeamTotalScoreWidget);
    for (final name in ['Red', 'Yellow']) {
      expect(
        find.descendant(of: scores, matching: find.text(name)),
        findsNothing,
      );
    }
  });

  testWidgets('teams picked during a game are named under their scores', (
    tester,
  ) async {
    await _startOpenGame(tester);
    final scoreSize = _scoreSize(tester);

    await tester.tap(find.text('Teams'));
    await tester.pumpAndSettle();
    await _pickTeams(tester);

    final scores = find.byType(TeamTotalScoreWidget);
    for (final (index, name) in ['Team Smith', 'Team Jones'].indexed) {
      final score = scores.at(index);
      final nameText = find.descendant(of: score, matching: find.text(name));
      expect(nameText, findsOneWidget);
      // Under the score, on its rock color.
      expect(
        tester.getTopLeft(nameText).dy,
        greaterThan(tester.getCenter(score).dy),
      );
    }
    // The names take no room from the scores.
    expect(_scoreSize(tester), scoreSize);
  });

  testWidgets('tapping a team name changes the teams', (tester) async {
    await _startOpenGame(tester);
    await tester.tap(find.text('Teams'));
    await tester.pumpAndSettle();
    await _pickTeams(tester);

    await tester.tap(find.text('Team Jones'));
    await tester.pumpAndSettle();

    expect(find.byType(LeagueMatchupPicker), findsOneWidget);
  });

  testWidgets('teams cannot be changed without leagues', (tester) async {
    await _startOpenGame(tester, leagues: const []);

    expect(find.text('Teams'), findsNothing);
  });
}
