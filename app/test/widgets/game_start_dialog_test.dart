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

  Future<CurlingGame?> startGameWith(
    WidgetTester tester,
    RockColors? rockColors,
  ) async {
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
                builder: (_) => GameStartDialog(rockColors: rockColors),
              );
            },
            child: const Text('open'),
          ),
        ),
      ),
    );
    await tester.tap(find.text('open'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Start Game'));
    await tester.pumpAndSettle();
    return started;
  }

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
