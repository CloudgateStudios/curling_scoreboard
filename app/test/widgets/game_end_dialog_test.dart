import 'package:curling_scoreboard/constants.dart';
import 'package:curling_scoreboard/l10n/app_localizations.dart';
import 'package:curling_scoreboard/models/curling_end.dart';
import 'package:curling_scoreboard/models/curling_game.dart';
import 'package:curling_scoreboard/models/curling_team.dart';
import 'package:curling_scoreboard/widgets/game_end/game_end_dialog.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

Widget wrapWithMaterialApp(Widget child) {
  return MaterialApp(
    localizationsDelegates: AppLocalizations.localizationsDelegates,
    supportedLocales: AppLocalizations.supportedLocales,
    home: Scaffold(body: child),
  );
}

CurlingGame _game({
  String team1 = 'Red',
  String team2 = 'Yellow',
  int ends = 2,
}) => CurlingGame(
  team1: CurlingTeam(
    name: team1,
    color: Constants.redTeamColor,
    textColor: Constants.textHighContrastColor,
    hasHammer: true,
  ),
  team2: CurlingTeam(
    name: team2,
    color: Constants.yellowTeamColor,
    textColor: Constants.textDefaultColor,
    hasHammer: false,
  ),
  numberOfEnds: ends,
  numberOfPlayersPerTeam: 4,
  ends: [
    for (var i = 1; i <= ends; i++)
      CurlingEnd(
        endNumber: i,
        scoringTeam: i.isOdd ? ScoringTeam.team1 : ScoringTeam.team2,
        score: i.isOdd ? 2 : 1,
        gameTimeInSeconds: i * 900,
      ),
  ],
);

void main() {
  testWidgets('GameEndDialog shows the final score and each end', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(1280, 728);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);

    await tester.pumpWidget(
      wrapWithMaterialApp(GameEndDialog(gameObject: _game(ends: 3))),
    );
    expect(tester.takeException(), isNull);

    expect(find.text('Game Report'), findsOneWidget);
    // Each name heads the result and its column.
    expect(find.text('Red'), findsNWidgets(2));
    expect(find.text('Yellow'), findsNWidgets(2));
    // Red scored two in ends 1 and 3, yellow one in end 2.
    expect(find.text('4'), findsOneWidget);
    // An end takes fifteen minutes; the third ends at forty-five.
    expect(find.text('15:00'), findsNWidgets(3));
    expect(find.text('00:45:00'), findsOneWidget);
    expect(find.text('Dismiss'), findsOneWidget);
  });

  testWidgets('GameEndDialog keeps a long team name on one line with '
      'readable text', (tester) async {
    tester.view.physicalSize = const Size(1280, 728);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);

    const longName = 'The Sweeping Beauties of Milwaukee';
    await tester.pumpWidget(
      wrapWithMaterialApp(GameEndDialog(gameObject: _game(team2: longName))),
    );
    expect(tester.takeException(), isNull);

    for (final name in find.text(longName).evaluate()) {
      final box = name.renderObject! as RenderBox;
      // One line of text is under twice its font size tall.
      expect(box.size.height, lessThan(44 * 2));
    }
    // On its yellow rock color the name is dark, not yellow on pale grey.
    final heading = tester.widget<DefaultTextStyle>(
      find
          .ancestor(
            of: find.text(longName).first,
            matching: find.byType(DefaultTextStyle),
          )
          .first,
    );
    expect(heading.style.color, Constants.textDefaultColor);
  });

  testWidgets('GameEndDialog fits a ten end game with an extra end', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(1280, 728);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);

    await tester.pumpWidget(
      wrapWithMaterialApp(GameEndDialog(gameObject: _game(ends: 11))),
    );
    expect(tester.takeException(), isNull);

    // The last end is above the Dismiss button, on screen.
    final lastEnd = tester.getRect(find.text('02:45:00'));
    final dismiss = tester.getRect(find.text('Dismiss'));
    expect(lastEnd.bottom, lessThan(dismiss.top));
    expect(dismiss.bottom, lessThan(728));
  });
}
