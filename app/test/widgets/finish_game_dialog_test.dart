import 'package:curling_scoreboard_flutter/l10n/app_localizations.dart';
import 'package:curling_scoreboard_flutter/widgets/app_bar/finish_game_dialog.dart';
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
  testWidgets('FinishGameDialog renders confirmation and buttons', (
    tester,
  ) async {
    var finished = false;
    await tester.pumpWidget(
      wrapWithMaterialApp(
        FinishGameDialog(
          finishGameAction: (_) => finished = true,
        ),
      ),
    );
    expect(find.textContaining('Are you sure'), findsOneWidget);
    expect(find.text('Yes'), findsOneWidget);
    expect(find.text('No'), findsOneWidget);
    await tester.tap(find.text('Yes'));
    expect(finished, isTrue);
  });
}
