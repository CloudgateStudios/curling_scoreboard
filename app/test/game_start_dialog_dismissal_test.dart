import 'package:curling_scoreboard/widgets/widgets.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

import 'helpers/pump_app.dart';

Future<void> pressSystemBackButton(WidgetTester tester) async {
  await tester.binding.defaultBinaryMessenger.handlePlatformMessage(
    'flutter/navigation',
    const JSONMethodCodec().encodeMethodCall(const MethodCall('popRoute')),
    (_) {},
  );
  await tester.pumpAndSettle();
}

void main() {
  group('game start dialog', () {
    testWidgets('cannot be dismissed with the system back button', (
      tester,
    ) async {
      await pumpScoreboardApp(tester);
      expect(find.byType(GameStartDialog), findsOneWidget);

      await pressSystemBackButton(tester);

      expect(tester.takeException(), isNull);
      expect(find.byType(GameStartDialog), findsOneWidget);
    });

    testWidgets('still starts a game normally after a back press', (
      tester,
    ) async {
      await pumpScoreboardApp(tester);
      await pressSystemBackButton(tester);

      await tester.tap(find.text('Start Game'));
      await tester.pumpAndSettle();

      expect(tester.takeException(), isNull);
      expect(find.byType(GameStartDialog), findsNothing);
      expect(find.text('Add Score'), findsOneWidget);

      // The game clock is running, which only happens once a game has started.
      await tester.pump(const Duration(seconds: 1));
      expect(find.textContaining('00:00:01'), findsOneWidget);
    });
  });
}
