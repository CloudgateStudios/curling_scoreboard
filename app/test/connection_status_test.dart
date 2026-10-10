import 'package:curling_scoreboard/main.dart';
import 'package:curling_scoreboard/services/registration_service.dart';
import 'package:curling_scoreboard/widgets/widgets.dart';
import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'helpers/pump_app.dart';

const _connectedAs = 'Connected as Windy City CC – Sheet 1';
const _pairingLost = 'Disconnected. This scoreboard is no longer paired';

/// Stands in for the unpairSheet function, which accepts 4821.
class _FakeRegistrationService extends RegistrationService {
  _FakeRegistrationService(this._store) : super(_store);

  final SharedPreferences _store;
  final pinsTried = <String>[];

  @override
  Future<void> disconnect({required String pin}) async {
    pinsTried.add(pin);
    if (pin != '4821') throw const IncorrectAdminPinException();
    await _store.clear();
  }
}

Future<_FakeRegistrationService> _pumpApp(
  WidgetTester tester, {
  bool paired = true,
}) async {
  tester.view.physicalSize = scoreboardTestSurfaceSize;
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);

  SharedPreferences.setMockInitialValues({
    if (paired) ...{
      'clubId': 'club-a',
      'sheetId': 'sheet-1',
      'clubName': 'Windy City CC',
      'sheetName': 'Sheet 1',
    },
  });
  final registration = _FakeRegistrationService(
    await SharedPreferences.getInstance(),
  );

  await tester.pumpWidget(
    CurlingScoreboardApp(registrationService: registration),
  );
  await tester.pumpAndSettle();
  return registration;
}

// An animation is only done once its time has passed, not on the moment.
const _justOver = Duration(milliseconds: 50);

/// Puts a finger on the connection, and waits for the hold to start
/// counting.
Future<TestGesture> _press(WidgetTester tester) async {
  final gesture = await tester.startGesture(
    tester.getCenter(find.text(_connectedAs)),
  );
  // The press is only known not to be a drag once the press timeout passes,
  // and the ring's first frame sets its start time.
  await tester.pump(kPressTimeout);
  await tester.pump();
  return gesture;
}

/// Presses and holds the connection on the setup screen for [duration].
Future<void> _hold(WidgetTester tester, Duration duration) async {
  final gesture = await _press(tester);
  await tester.pump(duration);
  await gesture.up();
  await tester.pumpAndSettle();
}

Future<void> _openConnectionDialog(WidgetTester tester) =>
    _hold(tester, ConnectionStatus.holdDuration + _justOver);

void main() {
  testWidgets('an unconnected scoreboard offers to connect on setup', (
    tester,
  ) async {
    await _pumpApp(tester, paired: false);

    expect(find.textContaining('Connected as'), findsNothing);
    await tester.tap(find.text('Connection'));
    await tester.pumpAndSettle();
    expect(find.byType(ConnectToClubDialog), findsOneWidget);
  });

  testWidgets('a connected scoreboard only says where it is connected', (
    tester,
  ) async {
    await _pumpApp(tester);

    expect(find.text(_connectedAs), findsOneWidget);
    expect(find.text('Connection'), findsNothing);

    await tester.tap(find.text(_connectedAs));
    await tester.pumpAndSettle();
    expect(find.byType(ConnectionDialog), findsNothing);
  });

  testWidgets('letting go early does not open the connection', (tester) async {
    await _pumpApp(tester);

    await _hold(tester, const Duration(seconds: 3));
    expect(find.byType(ConnectionDialog), findsNothing);
  });

  testWidgets('holding fills a ring, then opens the connection', (
    tester,
  ) async {
    await _pumpApp(tester);

    final gesture = await _press(tester);
    await tester.pump(const Duration(seconds: 2));
    final ring = tester.widget<CircularProgressIndicator>(
      find.byType(CircularProgressIndicator),
    );
    expect(ring.value, closeTo(0.5, 0.01));

    await tester.pump(const Duration(seconds: 2) + _justOver);
    await gesture.up();
    await tester.pumpAndSettle();

    expect(find.byType(ConnectionDialog), findsOneWidget);
    expect(find.text('Club: Windy City CC'), findsOneWidget);
    expect(find.text('Sheet: Sheet 1'), findsOneWidget);
    expect(find.textContaining(_pairingLost), findsNothing);
  });

  testWidgets('disconnecting takes the admin PIN', (tester) async {
    final registration = await _pumpApp(tester);
    await _openConnectionDialog(tester);

    await tester.tap(find.text('Disconnect'));
    await tester.pumpAndSettle();
    expect(find.byType(DisconnectDialog), findsOneWidget);

    await tester.enterText(find.byType(TextField), '1234');
    await tester.tap(find.widgetWithText(TextButton, 'Disconnect').last);
    await tester.pumpAndSettle();
    expect(find.text('Incorrect PIN. Please try again.'), findsOneWidget);
    expect(registration.isRegistered, isTrue);

    await tester.enterText(find.byType(TextField), '4821');
    await tester.tap(find.widgetWithText(TextButton, 'Disconnect').last);
    await tester.pumpAndSettle();

    expect(registration.pinsTried, ['1234', '4821']);
    expect(find.byType(DisconnectDialog), findsNothing);
    expect(find.byType(ConnectionDialog), findsNothing);
    expect(find.text(_connectedAs), findsNothing);
    expect(find.text('Connection'), findsOneWidget);
  });

  testWidgets('cancelling the PIN leaves the scoreboard connected', (
    tester,
  ) async {
    final registration = await _pumpApp(tester);
    await _openConnectionDialog(tester);

    await tester.tap(find.text('Disconnect'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Cancel'));
    await tester.pumpAndSettle();

    expect(registration.pinsTried, isEmpty);
    expect(find.byType(ConnectionDialog), findsOneWidget);
  });

  testWidgets('the PIN field takes up to eight digits only', (tester) async {
    await _pumpApp(tester);
    await _openConnectionDialog(tester);
    await tester.tap(find.text('Disconnect'));
    await tester.pumpAndSettle();

    await tester.enterText(find.byType(TextField), '12ab345678901');
    expect(
      tester.widget<TextField>(find.byType(TextField)).controller!.text,
      '12345678',
    );
  });

  testWidgets('a lost pairing shows on setup and in the connection', (
    tester,
  ) async {
    final registration = await _pumpApp(tester);

    expect(
      find.text('Scores are not syncing. Press and hold to fix.'),
      findsNothing,
    );
    registration.pairingLost.value = true;
    await tester.pump();
    expect(
      find.text('Scores are not syncing. Press and hold to fix.'),
      findsOneWidget,
    );

    await _openConnectionDialog(tester);
    expect(find.textContaining(_pairingLost), findsOneWidget);
  });

  testWidgets('settings no longer show the club connection', (tester) async {
    await _pumpApp(tester);
    await tester.tap(find.text('Start Game'));
    await tester.pumpAndSettle();
    await tester.tap(find.byIcon(Icons.settings));
    await tester.pumpAndSettle();

    expect(find.text('Scoreboard Style'), findsOneWidget);
    expect(find.textContaining('Windy City CC'), findsNothing);
    expect(find.text('Disconnect'), findsNothing);
  });
}
