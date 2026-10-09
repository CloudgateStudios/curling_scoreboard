import 'package:curling_scoreboard/constants.dart';
import 'package:curling_scoreboard/l10n/app_localizations.dart';
import 'package:curling_scoreboard/models/models.dart';
import 'package:curling_scoreboard/src/version.dart';
import 'package:curling_scoreboard/widgets/game_start/game_start_dialog.dart';
import 'package:curling_scoreboard/widgets/game_start/league_matchup_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets('GameStartDialog displays version number', (tester) async {
    tester.view.physicalSize = const Size(3000, 1000);
    tester.view.devicePixelRatio = 1.0;

    await tester.pumpWidget(
      const MaterialApp(
        localizationsDelegates: [
          AppLocalizations.delegate,
          GlobalMaterialLocalizations.delegate,
          GlobalWidgetsLocalizations.delegate,
          GlobalCupertinoLocalizations.delegate,
        ],
        supportedLocales: [Locale('en', '')],
        home: GameStartDialog(),
      ),
    );

    expect(find.text('v$packageVersion'), findsOneWidget);

    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
  });

  /// Opens the dialog and returns a function giving the game it started,
  /// once Start Game has been tapped.
  Future<CurlingGame? Function()> openDialog(
    WidgetTester tester, {
    RockColors? rockColors,
    List<League> leagues = const [],
    DateTime Function() now = DateTime.now,
  }) async {
    tester.view.physicalSize = const Size(3000, 1000);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);

    CurlingGame? started;
    await tester.pumpWidget(
      MaterialApp(
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        supportedLocales: AppLocalizations.supportedLocales,
        home: Builder(
          builder: (context) => TextButton(
            onPressed: () async {
              started = await showDialog<CurlingGame>(
                context: context,
                builder: (_) => GameStartDialog(
                  rockColors: rockColors,
                  leagues: leagues,
                  now: now,
                ),
              );
            },
            child: const Text('open'),
          ),
        ),
      ),
    );
    await tester.tap(find.text('open'));
    await tester.pumpAndSettle();
    return () => started;
  }

  Future<CurlingGame?> startGameWith(
    WidgetTester tester,
    RockColors? rockColors,
  ) async {
    final started = await openDialog(tester, rockColors: rockColors);
    await tester.tap(find.text('Start Game'));
    await tester.pumpAndSettle();
    return started();
  }

  Future<void> tapAndSettle(WidgetTester tester, String text) async {
    await tester.tap(find.text(text));
    await tester.pumpAndSettle();
    // Leaving the team picker holds Start Game back for a moment.
    if (text == 'Done' || text == 'Cancel') {
      await tester.pump(GameStartDialog.startGuardDuration);
    }
  }

  final mondayNight = League.tryParse('monday', {
    'name': 'Monday Night',
    'draws': [
      {'day': 1, 'start': '18:30', 'end': '20:30'},
    ],
    'teams': [
      {'id': 't1', 'name': 'Team Smith', 'externalId': '1042'},
      {'id': 't2', 'name': 'Team Jones'},
      {'id': 't3', 'name': 'Rock Stars'},
    ],
  })!;
  final thursdayDoubles = League.tryParse('thursday', {
    'name': 'Thursday Doubles',
    'draws': [
      {'day': 4, 'start': '19:00', 'end': '21:00'},
    ],
    'teams': [
      {'id': 't8', 'name': 'Stone Cold'},
      {'id': 't9', 'name': 'Double Trouble'},
    ],
  })!;
  // A Monday evening, during Monday Night's draw.
  DateTime mondayEvening() => DateTime(2026, 10, 5, 19);

  Future<void> tapTeam(WidgetTester tester, String name) async {
    await tester.tap(find.widgetWithText(ElevatedButton, name));
    await tester.pumpAndSettle();
  }

  bool doneEnabled(WidgetTester tester) => tester
      .widget<ElevatedButton>(find.widgetWithText(ElevatedButton, 'Done'))
      .enabled;

  testWidgets('GameStartDialog only offers league games when there are '
      'leagues', (tester) async {
    await openDialog(tester);
    expect(find.text('Pick teams'), findsNothing);
    expect(find.text('League game'), findsNothing);
  });

  testWidgets('GameStartDialog still starts an open game in one tap at a '
      'club with leagues', (tester) async {
    final started = await openDialog(
      tester,
      leagues: [mondayNight, thursdayDoubles],
      now: mondayEvening,
    );
    expect(find.text('Monday Night is playing'), findsOneWidget);

    await tapAndSettle(tester, 'Start Game');

    final game = started()!;
    expect(game.league, isNull);
    expect(game.team1.name, 'Red');
    expect(game.team1.teamId, isNull);
  });

  testWidgets('GameStartDialog starts a league game between two picked '
      'teams', (tester) async {
    final started = await openDialog(
      tester,
      leagues: [mondayNight, thursdayDoubles],
      now: mondayEvening,
    );

    await tapAndSettle(tester, 'Pick teams');
    // The picker opens on the league playing now, with every team shown.
    expect(find.byType(LeagueMatchupPicker), findsOneWidget);
    expect(find.text('Monday Night'), findsOneWidget);
    expect(find.text('Tap a team'), findsNWidgets(2));
    expect(doneEnabled(tester), isFalse);

    // The first tap is red, the second yellow.
    await tapTeam(tester, 'Team Smith');
    expect(doneEnabled(tester), isFalse);
    await tapTeam(tester, 'Team Jones');
    expect(find.text('Tap a team'), findsNothing);
    await tapAndSettle(tester, 'Done');

    // Back on the setup screen, the bar and the hammer choice name the
    // teams.
    expect(find.byType(LeagueMatchupPicker), findsNothing);
    expect(find.text('Team Smith'), findsNWidgets(2));
    expect(
      find.widgetWithText(GameStartSegmentControlText, 'Team Jones'),
      findsOneWidget,
    );
    expect(find.text('Red'), findsNothing);

    await tapAndSettle(tester, 'Start Game');

    final game = started()!;
    expect(game.league?.id, 'monday');
    expect(game.league?.name, 'Monday Night');
    expect(game.team1.name, 'Team Smith');
    expect(game.team1.colorName, 'Red');
    expect(game.team1.teamId, 't1');
    expect(game.team1.externalId, '1042');
    expect(game.team1.color, Constants.redTeamColor);
    expect(game.team1.hasHammer, isTrue);
    expect(game.team2.name, 'Team Jones');
    expect(game.team2.colorName, 'Yellow');
    expect(game.team2.teamId, 't2');
    expect(game.team2.externalId, isNull);
  });

  testWidgets('GameStartDialog does not start the game on a double tap of '
      'Done', (tester) async {
    final started = await openDialog(
      tester,
      leagues: [mondayNight],
      now: mondayEvening,
    );

    await tapAndSettle(tester, 'Pick teams');
    await tapTeam(tester, 'Team Smith');
    await tapTeam(tester, 'Team Jones');

    // Done and Start Game are in the same corner. The second tap of a
    // double tap lands on Start Game as the picker closes.
    await tester.tap(find.text('Done'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Start Game'), warnIfMissed: false);
    await tester.pumpAndSettle();
    expect(started(), isNull);
    expect(find.byType(GameStartDialog), findsOneWidget);

    await tester.pump(GameStartDialog.startGuardDuration);
    await tapAndSettle(tester, 'Start Game');
    expect(started()!.team1.name, 'Team Smith');
  });

  testWidgets('GameStartDialog gives the hammer to a team by name', (
    tester,
  ) async {
    final started = await openDialog(
      tester,
      leagues: [mondayNight],
      now: mondayEvening,
    );

    await tapAndSettle(tester, 'Pick teams');
    await tapTeam(tester, 'Team Smith');
    await tapTeam(tester, 'Team Jones');
    await tapAndSettle(tester, 'Done');

    await tester.tap(
      find.widgetWithText(GameStartSegmentControlText, 'Team Jones'),
    );
    await tester.pumpAndSettle();
    await tapAndSettle(tester, 'Start Game');

    expect(started()!.team1.hasHammer, isFalse);
    expect(started()!.team2.hasHammer, isTrue);
    expect(started()!.team2.hadLastStoneFirstEnd, isTrue);
  });

  testWidgets('LeagueMatchupPicker swaps colors, clears a slot and replaces '
      'the second team', (tester) async {
    final started = await openDialog(
      tester,
      leagues: [mondayNight],
      now: mondayEvening,
    );

    await tapAndSettle(tester, 'Pick teams');
    await tapTeam(tester, 'Team Smith');
    await tapTeam(tester, 'Team Jones');

    // A third tap is taken as a correction to the second.
    await tapTeam(tester, 'Rock Stars');
    expect(find.text('Team Jones'), findsOneWidget);
    expect(find.text('Rock Stars'), findsNWidgets(2));

    await tester.tap(find.byTooltip('Swap colors'));
    await tester.pumpAndSettle();

    // Tapping a picked team takes it back out, leaving its color open.
    await tapTeam(tester, 'Team Smith');
    expect(find.text('Tap a team'), findsOneWidget);
    expect(doneEnabled(tester), isFalse);
    await tapTeam(tester, 'Team Jones');

    await tapAndSettle(tester, 'Done');
    await tapAndSettle(tester, 'Start Game');

    expect(started()!.team1.name, 'Rock Stars');
    expect(started()!.team2.name, 'Team Jones');
  });

  testWidgets('LeagueMatchupPicker asks for the league when none is '
      'playing', (tester) async {
    final started = await openDialog(
      tester,
      leagues: [mondayNight, thursdayDoubles],
      // A Wednesday, when neither league plays.
      now: () => DateTime(2026, 10, 7, 19),
    );
    expect(find.text('League game'), findsOneWidget);

    await tapAndSettle(tester, 'Pick teams');
    expect(find.text('Which league?'), findsOneWidget);

    await tapTeam(tester, 'Thursday Doubles');
    await tapTeam(tester, 'Stone Cold');
    await tapTeam(tester, 'Double Trouble');
    await tapAndSettle(tester, 'Done');
    await tapAndSettle(tester, 'Start Game');

    expect(started()!.league?.id, 'thursday');
    expect(started()!.team2.name, 'Double Trouble');
  });

  testWidgets("LeagueMatchupPicker opens on a club's only league, whatever "
      'the time', (tester) async {
    await openDialog(tester, leagues: [thursdayDoubles], now: mondayEvening);

    await tapAndSettle(tester, 'Pick teams');
    expect(find.text('Thursday Doubles'), findsOneWidget);
    expect(find.text('Stone Cold'), findsOneWidget);
    // With one league there is nothing to change to.
    expect(find.text('Change league'), findsNothing);
  });

  testWidgets('LeagueMatchupPicker clears the teams when the league '
      'changes', (tester) async {
    await openDialog(
      tester,
      leagues: [mondayNight, thursdayDoubles],
      now: mondayEvening,
    );

    await tapAndSettle(tester, 'Pick teams');
    await tapTeam(tester, 'Team Smith');
    await tapAndSettle(tester, 'Change league');
    await tapTeam(tester, 'Thursday Doubles');

    expect(find.text('Team Smith'), findsNothing);
    expect(find.text('Tap a team'), findsNWidgets(2));
  });

  testWidgets('GameStartDialog keeps the teams when the picker is '
      'cancelled, and drops them when cleared', (tester) async {
    final started = await openDialog(
      tester,
      leagues: [mondayNight],
      now: mondayEvening,
    );

    await tapAndSettle(tester, 'Pick teams');
    await tapTeam(tester, 'Team Smith');
    await tapTeam(tester, 'Team Jones');
    await tapAndSettle(tester, 'Done');

    // Reopening starts from the teams already picked.
    await tapAndSettle(tester, 'Monday Night');
    expect(find.text('Tap a team'), findsNothing);
    await tapTeam(tester, 'Team Jones');
    await tapAndSettle(tester, 'Cancel');
    expect(
      find.widgetWithText(GameStartSegmentControlText, 'Team Jones'),
      findsOneWidget,
    );

    await tester.tap(find.byTooltip('Clear teams'));
    await tester.pumpAndSettle();
    expect(find.text('Team Smith'), findsNothing);
    expect(find.text('Red'), findsOneWidget);

    await tapAndSettle(tester, 'Start Game');
    expect(started()!.league, isNull);
    expect(started()!.team1.name, 'Red');
  });

  testWidgets('LeagueMatchupPicker labels its slots with the club rock '
      'colors', (tester) async {
    await openDialog(
      tester,
      rockColors: const RockColors(
        team1: RockColor(name: 'Blue', color: Color(0xFF2196F3)),
        team2: RockColor(name: 'Green', color: Color(0xFF4CAF50)),
      ),
      leagues: [mondayNight],
      now: mondayEvening,
    );

    await tapAndSettle(tester, 'Pick teams');
    final picker = find.byType(LeagueMatchupPicker);
    expect(
      find.descendant(of: picker, matching: find.text('Blue')),
      findsOneWidget,
    );
    expect(
      find.descendant(of: picker, matching: find.text('Green')),
      findsOneWidget,
    );
  });

  testWidgets('GameStartDialog starts a red and yellow game by default', (
    tester,
  ) async {
    final game = await startGameWith(tester, null);

    expect(game!.team1.name, 'Red');
    expect(game.team1.colorName, 'Red');
    expect(game.team1.color, Constants.redTeamColor);
    expect(game.team1.textColor, Constants.textHighContrastColor);
    expect(game.team2.name, 'Yellow');
    expect(game.team2.color, Constants.yellowTeamColor);
    expect(game.team2.textColor, Constants.textDefaultColor);
  });

  testWidgets('GameStartDialog starts a game in the club rock colors', (
    tester,
  ) async {
    final game = await startGameWith(
      tester,
      const RockColors(
        team1: RockColor(name: 'Blue', color: Color(0xFF2196F3)),
        team2: RockColor(name: 'Green', color: Color(0xFF4CAF50)),
      ),
    );

    expect(game!.team1.name, 'Blue');
    expect(game.team1.color, const Color(0xFF2196F3));
    expect(game.team2.name, 'Green');
    expect(game.team2.color, const Color(0xFF4CAF50));
    // The hammer choice is offered by color too.
    expect(game.team1.hasHammer, isTrue);
  });
}
