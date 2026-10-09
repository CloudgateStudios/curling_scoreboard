import 'package:curling_scoreboard/l10n/app_localizations.dart';
import 'package:curling_scoreboard/main.dart';
import 'package:curling_scoreboard/models/models.dart';
import 'package:curling_scoreboard/services/registration_service.dart';
import 'package:curling_scoreboard/widgets/widgets.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Sizes the scoreboard is realistically run at, plus the default test
/// surface. The dialog used to overflow on everything below about 2100
/// logical pixels wide.
const _displaySizes = <String, Size>{
  'default test surface': Size(800, 600),
  '720p': Size(1280, 720),
  'iPad Pro 12.9': Size(1366, 1024),
  '1080p': Size(1920, 1080),
  '1440p': Size(2560, 1440),
};

void main() {
  group('GameStartDialog layout', () {
    _displaySizes.forEach((label, size) {
      testWidgets('does not overflow at $label', (tester) async {
        tester.view.physicalSize = size;
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.reset);

        SharedPreferences.setMockInitialValues({});
        final prefs = await SharedPreferences.getInstance();

        await tester.pumpWidget(
          CurlingScoreboardApp(registrationService: RegistrationService(prefs)),
        );
        await tester.pumpAndSettle();

        expect(find.byType(GameStartDialog), findsOneWidget);
        expect(tester.takeException(), isNull);

        // The Start Game button has to be reachable to begin a game.
        await tester.tap(find.text('Start Game'));
        await tester.pumpAndSettle();

        expect(tester.takeException(), isNull);
        expect(find.byType(GameStartDialog), findsNothing);
      });
    });
  });

  group('GameStartDialog layout for a league game', () {
    // Long names and a long list, which is what stretches the dialog and
    // the team picker.
    final league = League.tryParse('monday', {
      'name': 'Monday Night Competitive League',
      'draws': [
        {'day': 1, 'start': '18:30', 'end': '20:30'},
      ],
      'teams': [
        for (var i = 1; i <= 24; i++)
          {
            'id': 't$i',
            'name':
                'Team ${i.toString().padLeft(2, '0')} of '
                'the Sweeping Beauties',
          },
      ],
    })!;

    _displaySizes.forEach((label, size) {
      testWidgets('does not overflow at $label', (tester) async {
        tester.view.physicalSize = size;
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.reset);

        await tester.pumpWidget(
          MaterialApp(
            localizationsDelegates: AppLocalizations.localizationsDelegates,
            supportedLocales: AppLocalizations.supportedLocales,
            home: GameStartDialog(
              leagues: [league],
              now: () => DateTime(2026, 10, 5, 19),
            ),
          ),
        );

        Future<void> tap(String text) async {
          await tester.tap(find.text(text));
          await tester.pumpAndSettle();
          expect(tester.takeException(), isNull);
        }

        await tap('League');
        await tap('Pick Red Team');
        await tap('Team 01 of the Sweeping Beauties');
        await tap('Pick Yellow Team');
        await tap('Team 02 of the Sweeping Beauties');

        // Both names are on their buttons and the game can be started.
        expect(find.text('Team 01 of the Sweeping Beauties'), findsOneWidget);
        expect(
          tester
              .widget<ElevatedButton>(
                find.widgetWithText(ElevatedButton, 'Start Game'),
              )
              .enabled,
          isTrue,
        );
      });
    });
  });
}
