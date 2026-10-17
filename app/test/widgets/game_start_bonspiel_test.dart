import 'package:curling_scoreboard/l10n/app_localizations.dart';
import 'package:curling_scoreboard/models/models.dart';
import 'package:curling_scoreboard/widgets/game_start/game_start_dialog.dart';
import 'package:curling_scoreboard/widgets/game_start/league_matchup_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

// Two A event games on Friday evening, then the A final and a B game for
// their losers on Saturday morning. Two more teams are entered but not
// placed.
final Bonspiel _fallSpiel = Bonspiel.tryParse('fall', {
  'name': 'Fall Spiel',
  'active': true,
  'startDate': '2026-11-06',
  'endDate': '2026-11-08',
  'numberOfEnds': 8,
  'events': [
    {'id': 'a', 'name': 'A Event'},
    {'id': 'b', 'name': 'B Event', 'numberOfEnds': 6},
  ],
  'teams': [
    {'id': 't1', 'name': 'Smith'},
    {'id': 't2', 'name': 'Jones', 'externalId': 'J-7'},
    {'id': 't3', 'name': 'Brown'},
    {'id': 't4', 'name': 'Lee'},
    {'id': 't5', 'name': 'Nguyen'},
    {'id': 't6', 'name': 'Garcia'},
  ],
  'draws': [
    {'id': 'd1', 'label': 'Draw 1', 'start': '2026-11-06T19:00'},
    {'id': 'd2', 'label': 'Draw 2', 'start': '2026-11-07T09:00'},
  ],
  'games': [
    _game('a1', 'A1', 'd1', 's1', 'a', {'teamId': 't1'}, {'teamId': 't2'}),
    _game('a2', 'A2', 'd1', 's2', 'a', {'teamId': 't3'}, {'teamId': 't4'}),
    _game('a3', 'A Final', 'd2', 's1', 'a', _from('a1'), _from('a2')),
    _game(
      'b1',
      'B1',
      'd2',
      's2',
      'b',
      _from('a1', winner: false),
      _from('a2', winner: false),
    ),
  ],
})!;

Map<String, dynamic> _game(
  String id,
  String label,
  String drawId,
  String sheetId,
  String eventId,
  Object team1,
  Object team2,
) => {
  'id': id,
  'label': label,
  'drawId': drawId,
  'sheetId': sheetId,
  'eventId': eventId,
  'team1': team1,
  'team2': team2,
};

Map<String, dynamic> _from(String game, {bool winner = true}) => {
  'from': game,
  'result': winner ? 'winner' : 'loser',
};

final League _mondayNight = League.tryParse('monday', {
  'name': 'Monday Night',
  'teams': [
    {'id': 'm1', 'name': 'Team Smith'},
    {'id': 'm2', 'name': 'Team Jones'},
  ],
})!;

DateTime _fridayEvening() => DateTime(2026, 11, 6, 18, 45);
DateTime _saturdayMorning() => DateTime(2026, 11, 7, 8, 50);

void main() {
  /// Opens the setup screen on [sheetId] and returns a function giving the
  /// game it started, once Start Game has been tapped.
  Future<CurlingGame? Function()> openDialog(
    WidgetTester tester, {
    required DateTime Function() now,
    String sheetId = 's1',
    List<Bonspiel>? bonspiels,
    List<League> leagues = const [],
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
                  bonspiels: bonspiels ?? [_fallSpiel],
                  leagues: leagues,
                  sheetId: sheetId,
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

  Future<void> tapAndSettle(WidgetTester tester, String text) async {
    await tester.tap(find.text(text).last);
    await tester.pumpAndSettle();
  }

  Future<void> tapTeam(WidgetTester tester, String name) async {
    await tester.tap(find.widgetWithText(ElevatedButton, name));
    await tester.pumpAndSettle();
  }

  testWidgets("offers this sheet's game in the draw and starts it in one tap", (
    tester,
  ) async {
    final started = await openDialog(tester, now: _fridayEvening);

    expect(find.text('Fall Spiel'), findsOneWidget);
    expect(find.text('A1'), findsOneWidget);
    expect(find.textContaining('Draw 1 · Fri'), findsOneWidget);
    // On the bar, and on the hammer choice.
    expect(find.text('Smith'), findsNWidgets(2));
    expect(find.text('Jones'), findsNWidgets(2));

    await tapAndSettle(tester, 'Start Game');

    final game = started()!;
    expect(game.bonspiel?.id, 'fall');
    expect(game.bonspiel?.gameId, 'a1');
    expect(game.league, isNull);
    expect(game.numberOfEnds, 8);
    expect(game.team1.name, 'Smith');
    expect(game.team1.colorName, 'Red');
    expect(game.team1.teamId, 't1');
    expect(game.team2.teamId, 't2');
    expect(game.team2.externalId, 'J-7');
  });

  testWidgets('asks for the teams not known yet, offering likely ones first', (
    tester,
  ) async {
    final started = await openDialog(
      tester,
      now: _saturdayMorning,
      sheetId: 's2',
    );

    // B1, played to the B event's six ends.
    expect(find.text('B1'), findsOneWidget);
    expect(find.text('Loser of A1'), findsOneWidget);
    expect(find.text('Loser of A2'), findsOneWidget);
    expect(
      find.widgetWithText(GameStartSegmentControlText, '6'),
      findsOneWidget,
    );

    await tapAndSettle(tester, 'Start Game');

    // The teams of the games it comes from, with the rest a tap away.
    expect(find.byType(LeagueMatchupPicker), findsOneWidget);
    for (final name in ['Smith', 'Jones', 'Brown', 'Lee']) {
      expect(find.widgetWithText(ElevatedButton, name), findsOneWidget);
    }
    expect(find.widgetWithText(ElevatedButton, 'Nguyen'), findsNothing);
    await tapAndSettle(tester, 'All 6 teams');
    expect(find.widgetWithText(ElevatedButton, 'Nguyen'), findsOneWidget);
    await tapAndSettle(tester, 'Likely teams');

    await tapTeam(tester, 'Jones');
    await tapTeam(tester, 'Lee');
    await tapAndSettle(tester, 'Done');
    // Out of the way of a double tap, then the game starts.
    await tester.pump(GameStartDialog.pickerGuardDuration);
    await tester.pumpAndSettle();

    final game = started()!;
    expect(game.bonspiel?.gameId, 'b1');
    expect(game.numberOfEnds, 6);
    expect(game.team1.name, 'Jones');
    expect(game.team2.name, 'Lee');
  });

  testWidgets('starts nothing when the teams are not picked', (tester) async {
    final started = await openDialog(
      tester,
      now: _saturdayMorning,
      sheetId: 's2',
    );

    await tapAndSettle(tester, 'Start Game');
    await tapAndSettle(tester, 'Cancel');
    await tester.pump(GameStartDialog.pickerGuardDuration);
    await tester.pumpAndSettle();

    expect(started(), isNull);
    expect(find.text('B1'), findsOneWidget);
  });

  testWidgets('uses the teams the functions worked out', (tester) async {
    final played = Bonspiel.tryParse('fall', _fallSpiel.toJson()['plan'], {
      'a3': {
        'status': 'ready',
        'team1': {'teamId': 't2', 'name': 'Jones'},
        'team2': {'teamId': 't3', 'name': 'Brown'},
      },
    })!;
    final started = await openDialog(
      tester,
      now: _saturdayMorning,
      bonspiels: [played],
    );

    expect(find.text('A Final'), findsOneWidget);
    await tapAndSettle(tester, 'Start Game');

    final game = started()!;
    expect(game.bonspiel?.gameId, 'a3');
    expect(game.team1.externalId, 'J-7');
    expect(game.team2.name, 'Brown');
  });

  testWidgets('starts another game of the bonspiel, chosen by hand', (
    tester,
  ) async {
    final started = await openDialog(tester, now: _fridayEvening);

    await tapAndSettle(tester, 'A1');
    expect(find.text('Which game?'), findsOneWidget);
    expect(find.text('This sheet'), findsOneWidget);
    expect(find.text('Other sheets this draw'), findsOneWidget);
    // A2 was moved to this sheet at the last minute.
    await tapAndSettle(tester, 'Brown vs Lee');

    expect(find.text('A2'), findsOneWidget);
    await tapAndSettle(tester, 'Start Game');
    expect(started()!.bonspiel?.gameId, 'a2');
  });

  testWidgets('sets the bonspiel aside for an open game', (tester) async {
    final started = await openDialog(tester, now: _fridayEvening);

    await tester.tap(find.byTooltip('Play an open game'));
    await tester.pumpAndSettle();
    expect(find.text('No game on this sheet'), findsOneWidget);

    await tapAndSettle(tester, 'Start Game');
    final game = started()!;
    expect(game.bonspiel, isNull);
    expect(game.team1.name, 'Red');
    expect(game.team1.teamId, isNull);
    expect(game.numberOfEnds, 8);
  });

  testWidgets('offers league games instead, and goes back to the bonspiel', (
    tester,
  ) async {
    await openDialog(tester, now: _fridayEvening, leagues: [_mondayNight]);

    await tapAndSettle(tester, 'A1');
    await tapAndSettle(tester, 'League game');
    expect(find.text('Fall Spiel'), findsNothing);
    expect(find.text('Monday Night'), findsOneWidget);

    await tapAndSettle(tester, 'Monday Night');
    await tapAndSettle(tester, 'Back to Fall Spiel');
    expect(find.text('Fall Spiel'), findsOneWidget);
    expect(find.text('A1'), findsOneWidget);
  });

  testWidgets('leaves league games as they were outside the bonspiel', (
    tester,
  ) async {
    await openDialog(
      tester,
      now: () => DateTime(2026, 11, 12, 19),
      leagues: [_mondayNight],
    );

    expect(find.text('Fall Spiel'), findsNothing);
    expect(find.text('Monday Night'), findsOneWidget);
    expect(find.text('Pick teams'), findsOneWidget);
  });
}
