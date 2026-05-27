import 'package:curling_scoreboard_flutter/constants.dart';
import 'package:curling_scoreboard_flutter/l10n/app_localizations.dart';
import 'package:curling_scoreboard_flutter/models/curling_end.dart';
import 'package:curling_scoreboard_flutter/models/curling_game.dart';
import 'package:curling_scoreboard_flutter/models/curling_team.dart';
import 'package:curling_scoreboard_flutter/widgets/game_end/game_end_dialog.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

Widget wrapWithMaterialApp(Widget child) {
  return MaterialApp(
    localizationsDelegates: AppLocalizations.localizationsDelegates,
    supportedLocales: AppLocalizations.supportedLocales,
    home: Scaffold(body: child),
  );
}

void main() {
  testWidgets('GameEndDialog renders with title and summary', (
    tester,
  ) async {
    final game = CurlingGame(
      team1: CurlingTeam(
        name: 'Red',
        color: Constants.redTeamColor,
        textColor: Constants.textHighContrastColor,
        hasHammer: true,
      ),
      team2: CurlingTeam(
        name: 'Yellow',
        color: Constants.yellowTeamColor,
        textColor: Constants.textDefaultColor,
        hasHammer: false,
      ),
      numberOfEnds: 2,
      numberOfPlayersPerTeam: 4,
      ends: [
        CurlingEnd(endNumber: 1, scoringTeamName: 'Red', score: 2),
        CurlingEnd(endNumber: 2, scoringTeamName: 'Yellow', score: 1),
      ],
    );
    await tester.pumpWidget(
      wrapWithMaterialApp(GameEndDialog(gameObject: game)),
    );
    expect(find.text('Game Report'), findsOneWidget);
    expect(find.text('Red'), findsOneWidget);
    expect(find.text('Yellow'), findsOneWidget);
    expect(find.text('2'), findsWidgets); // score and end number
    expect(find.text('1'), findsWidgets); // score and end number
  });
}
