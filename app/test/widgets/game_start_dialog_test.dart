import 'package:curling_scoreboard/constants.dart';
import 'package:curling_scoreboard/l10n/app_localizations.dart';
import 'package:curling_scoreboard/models/models.dart';
import 'package:curling_scoreboard/src/version.dart';
import 'package:curling_scoreboard/widgets/game_start/game_start_dialog.dart';
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
  }

  bool startEnabled(WidgetTester tester) => tester
      .widget<ElevatedButton>(find.widgetWithText(ElevatedButton, 'Start Game'))
      .enabled;

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

  testWidgets('GameStartDialog only offers league games when there are '
      'leagues', (tester) async {
    await openDialog(tester);
    expect(find.text('Game Type:'), findsNothing);
    expect(find.text('League'), findsNothing);
  });

  testWidgets('GameStartDialog still starts an open game at a club with '
      'leagues', (tester) async {
    final started = await openDialog(
      tester,
      leagues: [mondayNight, thursdayDoubles],
      now: mondayEvening,
    );
    expect(find.text('Game Type:'), findsOneWidget);

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

    await tapAndSettle(tester, 'League');
    // The league playing now is already chosen.
    expect(find.text('Monday Night'), findsOneWidget);
    expect(startEnabled(tester), isFalse);

    await tapAndSettle(tester, 'Pick Red Team');
    expect(find.text('Red Team'), findsOneWidget);
    await tapAndSettle(tester, 'Team Smith');
    expect(startEnabled(tester), isFalse);

    await tapAndSettle(tester, 'Pick Yellow Team');
    // The team already throwing red cannot also throw yellow. Its name is
    // on the red button behind the list, and nowhere in the list.
    expect(find.text('Team Smith'), findsOneWidget);
    await tapAndSettle(tester, 'Team Jones');
    expect(startEnabled(tester), isTrue);

    await tapAndSettle(tester, 'Start Game');

    final game = started()!;
    expect(game.league?.id, 'monday');
    expect(game.league?.name, 'Monday Night');
    expect(game.team1.name, 'Team Smith');
    expect(game.team1.colorName, 'Red');
    expect(game.team1.teamId, 't1');
    expect(game.team1.externalId, '1042');
    expect(game.team1.color, Constants.redTeamColor);
    expect(game.team2.name, 'Team Jones');
    expect(game.team2.colorName, 'Yellow');
    expect(game.team2.teamId, 't2');
    expect(game.team2.externalId, isNull);
  });

  testWidgets('GameStartDialog asks for the league when none is playing', (
    tester,
  ) async {
    final started = await openDialog(
      tester,
      leagues: [mondayNight, thursdayDoubles],
      // A Wednesday, when neither league plays.
      now: () => DateTime(2026, 10, 7, 19),
    );

    await tapAndSettle(tester, 'League');
    expect(find.text('Pick a League'), findsOneWidget);
    // Teams cannot be picked before the league.
    expect(
      tester
          .widget<ElevatedButton>(
            find.widgetWithText(ElevatedButton, 'Pick Red Team'),
          )
          .enabled,
      isFalse,
    );

    await tapAndSettle(tester, 'Pick a League');
    await tapAndSettle(tester, 'Thursday Doubles');
    await tapAndSettle(tester, 'Pick Red Team');
    await tapAndSettle(tester, 'Stone Cold');
    await tapAndSettle(tester, 'Pick Yellow Team');
    await tapAndSettle(tester, 'Double Trouble');
    await tapAndSettle(tester, 'Start Game');

    expect(started()!.league?.id, 'thursday');
    expect(started()!.team2.name, 'Double Trouble');
  });

  testWidgets("GameStartDialog picks a club's only league, whatever the time", (
    tester,
  ) async {
    await openDialog(tester, leagues: [thursdayDoubles], now: mondayEvening);

    await tapAndSettle(tester, 'League');
    expect(find.text('Thursday Doubles'), findsOneWidget);
  });

  testWidgets('GameStartDialog clears the teams when the league changes', (
    tester,
  ) async {
    await openDialog(
      tester,
      leagues: [mondayNight, thursdayDoubles],
      now: mondayEvening,
    );

    await tapAndSettle(tester, 'League');
    await tapAndSettle(tester, 'Pick Red Team');
    await tapAndSettle(tester, 'Team Smith');

    await tapAndSettle(tester, 'Monday Night');
    await tapAndSettle(tester, 'Thursday Doubles');

    expect(find.text('Team Smith'), findsNothing);
    expect(find.text('Pick Red Team'), findsOneWidget);
  });

  testWidgets('GameStartDialog names league team buttons by the club rock '
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

    await tapAndSettle(tester, 'League');
    expect(find.text('Pick Blue Team'), findsOneWidget);
    expect(find.text('Pick Green Team'), findsOneWidget);
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
