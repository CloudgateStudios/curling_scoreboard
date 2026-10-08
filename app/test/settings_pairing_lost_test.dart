import 'package:curling_scoreboard/main.dart';
import 'package:curling_scoreboard/services/registration_service.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'helpers/pump_app.dart';

const _warning = 'Disconnected. This scoreboard is no longer paired';

Future<RegistrationService> _pumpPairedAppWithSettingsOpen(
  WidgetTester tester,
) async {
  tester.view.physicalSize = scoreboardTestSurfaceSize;
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);

  SharedPreferences.setMockInitialValues({
    'clubId': 'club-a',
    'sheetId': 'sheet-1',
    'clubName': 'Windy City CC',
    'sheetName': 'Sheet 1',
  });
  final registration = RegistrationService(
    await SharedPreferences.getInstance(),
  );

  await tester.pumpWidget(
    CurlingScoreboardApp(registrationService: registration),
  );
  await tester.pumpAndSettle();
  await tester.tap(find.text('Start Game'));
  await tester.pumpAndSettle();
  await tester.tap(find.byIcon(Icons.settings));
  await tester.pumpAndSettle();
  return registration;
}

void main() {
  testWidgets('settings shows a paired scoreboard without a warning', (
    tester,
  ) async {
    await _pumpPairedAppWithSettingsOpen(tester);

    expect(find.text('Club: Windy City CC'), findsOneWidget);
    expect(find.textContaining(_warning), findsNothing);
  });

  testWidgets('settings warns once the sheet stops accepting writes', (
    tester,
  ) async {
    final registration = await _pumpPairedAppWithSettingsOpen(tester);

    // The dialog is already open, as it would be if a write were refused
    // while someone was looking at it.
    registration.pairingLost.value = true;
    await tester.pump();
    expect(find.textContaining(_warning), findsOneWidget);
    expect(find.text('Disconnect'), findsOneWidget);

    registration.pairingLost.value = false;
    await tester.pump();
    expect(find.textContaining(_warning), findsNothing);
  });
}
