import 'package:curling_scoreboard/main.dart';
import 'package:curling_scoreboard/models/models.dart';
import 'package:curling_scoreboard/services/league_service.dart';
import 'package:curling_scoreboard/services/registration_service.dart';
import 'package:curling_scoreboard/widgets/widgets.dart';
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

void main() {
  testWidgets('an open game shows no team names under the scores', (
    tester,
  ) async {
    await _startOpenGame(tester);

    expect(find.byType(TeamNamesRow), findsNothing);
  });

  testWidgets('teams picked during a game are named under their scores', (
    tester,
  ) async {
    await _startOpenGame(tester);

    await tester.tap(find.text('Teams'));
    await tester.pumpAndSettle();
    await _pickTeams(tester);

    final names = find.byType(TeamNamesRow);
    expect(names, findsOneWidget);
    expect(
      find.descendant(of: names, matching: find.text('Team Smith')),
      findsOneWidget,
    );
    expect(
      find.descendant(of: names, matching: find.text('Team Jones')),
      findsOneWidget,
    );
  });

  testWidgets('the teams can be picked on the game report', (tester) async {
    await _startOpenGame(tester);

    await tester.tap(find.text('Finish Game'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Yes'));
    await tester.pumpAndSettle();
    expect(find.byType(GameEndDialog), findsOneWidget);

    await tester.tap(find.text('Change Teams'));
    await tester.pumpAndSettle();
    await _pickTeams(tester);

    expect(
      find.descendant(
        of: find.byType(GameEndDialog),
        matching: find.text('Team Smith'),
      ),
      findsWidgets,
    );

    // Dismissing submits the game and goes on to the next one.
    await tester.pump(GameEndDialog.changeTeamsGuardDuration);
    await tester.tap(find.text('Dismiss'));
    await tester.pumpAndSettle();
    expect(find.byType(GameEndDialog), findsNothing);
    expect(find.byType(GameStartDialog), findsOneWidget);
  });

  testWidgets('teams cannot be changed without leagues', (tester) async {
    await _startOpenGame(tester, leagues: const []);

    expect(find.text('Teams'), findsNothing);
  });
}
