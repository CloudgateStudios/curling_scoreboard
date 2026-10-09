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
    // Leaving the team picker holds the setup screen back for a moment.
    if (text == 'Done' || text == 'Cancel') {
      await tester.pump(GameStartDialog.pickerGuardDuration);
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
    expect(find.text('League'), findsNothing);
  });

  testWidgets('GameStartDialog still starts an open game in one tap at a '
      'club with leagues', (tester) async {
    final started = await openDialog(
      tester,
      leagues: [mondayNight, thursdayDoubles],
      now: mondayEvening,
    );
    // The bar names the league the clock points at.
    expect(find.text('Playing now'), findsOneWidget);
    expect(find.text('Monday Night'), findsOneWidget);

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
    // Straight to the teams of the league playing now.
    expect(find.byType(LeagueMatchupPicker), findsOneWidget);
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

  testWidgets('LeagueMatchupPicker is only teams, with its actions bottom '
      'right', (tester) async {
    await openDialog(
      tester,
      leagues: [mondayNight, thursdayDoubles],
      now: mondayEvening,
    );
    await tapAndSettle(tester, 'Pick teams');

    final picker = find.byType(LeagueMatchupPicker);
    Finder inPicker(String text) =>
        find.descendant(of: picker, matching: find.text(text));

    // No title and no league control: those are on the setup screen.
    expect(inPicker('Monday Night'), findsNothing);
    expect(inPicker('Change league'), findsNothing);

    final screen = tester.getRect(picker);
    final done = tester.getRect(find.widgetWithText(ElevatedButton, 'Done'));
    final cancel = tester.getRect(inPicker('Cancel'));
    final lastTeam = tester.getRect(
      find.widgetWithText(ElevatedButton, 'Team Smith'),
    );
    expect(done.top, greaterThan(lastTeam.bottom));
    expect(done.center.dx, greaterThan(screen.center.dx));
    expect(cancel.right, lessThan(done.left));
    expect(screen.bottom - done.bottom, lessThan(40));
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

    // Done and Start Game share a corner. The second tap of a double tap
    // lands on the setup screen as the picker closes.
    await tester.tap(find.text('Done'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Start Game'), warnIfMissed: false);
    await tester.pumpAndSettle();
    expect(started(), isNull);
    expect(find.byType(GameStartDialog), findsOneWidget);

    await tester.pump(GameStartDialog.pickerGuardDuration);
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

  testWidgets('GameStartDialog asks for the league before the teams when '
      'none is playing', (tester) async {
    final started = await openDialog(
      tester,
      leagues: [mondayNight, thursdayDoubles],
      // A Wednesday, when neither league plays.
      now: () => DateTime(2026, 10, 7, 19),
    );
    expect(find.text('Choose league'), findsOneWidget);
    expect(find.text('Playing now'), findsNothing);

    await tapAndSettle(tester, 'Pick teams');
    expect(find.text('Which league?'), findsOneWidget);
    expect(find.byType(LeagueMatchupPicker), findsNothing);

    // Choosing the league carries straight on to its teams.
    await tapAndSettle(tester, 'Thursday Doubles');
    expect(find.byType(LeagueMatchupPicker), findsOneWidget);
    await tapTeam(tester, 'Stone Cold');
    await tapTeam(tester, 'Double Trouble');
    await tapAndSettle(tester, 'Done');
    expect(find.text('Thursday Doubles'), findsOneWidget);
    await tapAndSettle(tester, 'Start Game');

    expect(started()!.league?.id, 'thursday');
    expect(started()!.team2.name, 'Double Trouble');
  });

  testWidgets('GameStartDialog changes league from the setup screen, '
      'listing the one playing now first', (tester) async {
    final started = await openDialog(
      tester,
      leagues: [thursdayDoubles, mondayNight],
      now: mondayEvening,
    );

    await tapAndSettle(tester, 'Monday Night');
    expect(find.text('Which league?'), findsOneWidget);
    final options = find.byType(LeagueChooserOption);
    expect(
      find.descendant(of: options.first, matching: find.text('Monday Night')),
      findsOneWidget,
    );
    expect(
      find.descendant(of: options.first, matching: find.text('Playing now')),
      findsOneWidget,
    );

    await tester.tap(
      find.descendant(of: options, matching: find.text('Thursday Doubles')),
    );
    await tester.pumpAndSettle();
    // Only the league changed: no team picker until it is asked for.
    expect(find.byType(LeagueMatchupPicker), findsNothing);
    expect(find.text('Thursday Doubles'), findsOneWidget);

    await tapAndSettle(tester, 'Pick teams');
    await tapTeam(tester, 'Stone Cold');
    await tapTeam(tester, 'Double Trouble');
    await tapAndSettle(tester, 'Done');
    await tapAndSettle(tester, 'Start Game');
    expect(started()!.league?.id, 'thursday');
  });

  testWidgets('League chooser shows ten leagues at once on the tablet', (
    tester,
  ) async {
    final leagues = [
      for (var i = 1; i <= 10; i++)
        League.tryParse('l$i', {
          'name': 'League number $i of the season',
          // The fourth is the one in a draw on a Monday evening.
          'draws': [
            {'day': i == 4 ? 1 : 3, 'start': '18:30', 'end': '20:30'},
          ],
          'teams': [
            {'id': 'a$i', 'name': 'Team A$i'},
            {'id': 'b$i', 'name': 'Team B$i'},
          ],
        })!,
    ];
    final started = await openDialog(
      tester,
      leagues: leagues,
      now: mondayEvening,
    );
    // The size of a Galaxy Tab A8 with Android's bars showing.
    tester.view.physicalSize = const Size(1280, 728);
    await tester.pumpAndSettle();

    await tapAndSettle(tester, 'League number 4 of the season');
    expect(tester.takeException(), isNull);

    final options = find.byType(LeagueChooserOption);
    expect(options, findsNWidgets(10));
    // Nothing scrolls: every league is on screen, at a size worth tapping.
    expect(
      find.descendant(
        of: find.byType(Dialog).last,
        matching: find.byType(Scrollable),
      ),
      findsNothing,
    );
    final screen = Offset.zero & const Size(1280, 728);
    for (final option in options.evaluate()) {
      final rect = tester.getRect(find.byWidget(option.widget));
      expect(screen.contains(rect.topLeft), isTrue);
      expect(screen.contains(rect.bottomRight), isTrue);
      expect(rect.height, greaterThan(60));
    }
    // The league playing now is first.
    expect(
      find.descendant(
        of: options.first,
        matching: find.text('League number 4 of the season'),
      ),
      findsOneWidget,
    );

    await tester.tap(
      find.descendant(
        of: options,
        matching: find.text('League number 9 of the season'),
      ),
    );
    await tester.pumpAndSettle();
    await tapAndSettle(tester, 'Pick teams');
    await tapTeam(tester, 'Team A9');
    await tapTeam(tester, 'Team B9');
    await tapAndSettle(tester, 'Done');
    await tapAndSettle(tester, 'Start Game');
    expect(started()!.league?.id, 'l9');
  });

  testWidgets('League chooser can be cancelled', (tester) async {
    await openDialog(
      tester,
      leagues: [mondayNight, thursdayDoubles],
      now: mondayEvening,
    );

    await tapAndSettle(tester, 'Monday Night');
    expect(find.text('Which league?'), findsOneWidget);
    await tester.tap(find.text('Cancel'));
    await tester.pumpAndSettle();

    expect(find.text('Which league?'), findsNothing);
    expect(find.text('Monday Night'), findsOneWidget);
  });

  testWidgets('GameStartDialog clears the teams when the league changes', (
    tester,
  ) async {
    await openDialog(
      tester,
      leagues: [mondayNight, thursdayDoubles],
      now: mondayEvening,
    );

    await tapAndSettle(tester, 'Pick teams');
    await tapTeam(tester, 'Team Smith');
    await tapTeam(tester, 'Team Jones');
    await tapAndSettle(tester, 'Done');

    await tapAndSettle(tester, 'Monday Night');
    await tapAndSettle(tester, 'Thursday Doubles');

    expect(find.text('Team Smith'), findsNothing);
    expect(find.text('Pick teams'), findsOneWidget);
    expect(find.text('Red'), findsOneWidget);
  });

  testWidgets('GameStartDialog keeps the teams when the same league is '
      'chosen again', (tester) async {
    await openDialog(
      tester,
      leagues: [mondayNight, thursdayDoubles],
      now: mondayEvening,
    );

    await tapAndSettle(tester, 'Pick teams');
    await tapTeam(tester, 'Team Smith');
    await tapTeam(tester, 'Team Jones');
    await tapAndSettle(tester, 'Done');

    await tapAndSettle(tester, 'Monday Night');
    await tester.tap(
      find.descendant(
        of: find.byType(LeagueChooserOption),
        matching: find.text('Monday Night'),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Team Smith'), findsNWidgets(2));
  });

  testWidgets("GameStartDialog shows a club's only league with nothing to "
      'change', (tester) async {
    await openDialog(tester, leagues: [thursdayDoubles], now: mondayEvening);

    expect(find.text('Thursday Doubles'), findsOneWidget);
    expect(find.byIcon(Icons.unfold_more), findsNothing);
    await tapAndSettle(tester, 'Thursday Doubles');
    expect(find.text('Which league?'), findsNothing);

    await tapAndSettle(tester, 'Pick teams');
    expect(find.text('Stone Cold'), findsOneWidget);
  });

  testWidgets('GameStartDialog follows the clock while it sits open', (
    tester,
  ) async {
    var now = DateTime(2026, 10, 7, 19);
    await openDialog(
      tester,
      leagues: [mondayNight, thursdayDoubles],
      now: () => now,
    );
    expect(find.text('Choose league'), findsOneWidget);

    // Left open until Thursday's draw.
    now = DateTime(2026, 10, 8, 19, 30);
    await tester.pump(const Duration(minutes: 1));

    expect(find.text('Thursday Doubles'), findsOneWidget);
    expect(find.text('Playing now'), findsOneWidget);
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
    await tester.tap(find.text('vs'));
    await tester.pumpAndSettle();
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
