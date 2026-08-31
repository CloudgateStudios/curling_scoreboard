import 'package:curling_scoreboard/main.dart';
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
}
