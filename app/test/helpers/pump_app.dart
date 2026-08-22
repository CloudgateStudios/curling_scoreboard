import 'package:curling_scoreboard/main.dart';
import 'package:curling_scoreboard/services/registration_service.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// The scoreboard is built for a large, landscape display. The default test
/// surface is far smaller than any real device, so tests that drive the whole
/// screen size the view up first. This is deliberately wider than 1920 because
/// the game start dialog currently overflows below roughly 2100 logical
/// pixels; that layout bug is tracked separately and is not what these tests
/// are exercising.
const scoreboardTestSurfaceSize = Size(2400, 1400);

/// Pumps the full app and starts a game with the default dialog settings so
/// tests can drive the scoreboard screen itself.
Future<void> pumpScoreboardAppAndStartGame(WidgetTester tester) async {
  tester.view.physicalSize = scoreboardTestSurfaceSize;
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);

  SharedPreferences.setMockInitialValues({});
  final prefs = await SharedPreferences.getInstance();

  await tester.pumpWidget(
    CurlingScoreboardApp(registrationService: RegistrationService(prefs)),
  );
  await tester.pumpAndSettle();

  await tester.tap(find.text('Start Game'));
  await tester.pumpAndSettle();
}
