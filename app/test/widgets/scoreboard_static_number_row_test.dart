import 'package:curling_scoreboard_flutter/l10n/app_localizations.dart';
import 'package:curling_scoreboard_flutter/widgets/scoreboard/scoreboard_static_number_row.dart';
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
  testWidgets('ScoreboardStaticNumberRow renders numbers and extra end', (
    tester,
  ) async {
    var tappedNumber = 0;
    await tester.pumpWidget(
      wrapWithMaterialApp(
        ScoreboardStaticNumberRow(
          upperLimit: 3,
          needExtra: true,
          containerColor: Colors.blue,
          onPressed: (n) => tappedNumber = n,
        ),
      ),
    );
    // Should render 3 numbers and an extra end label (E)
    expect(find.text('1'), findsOneWidget);
    expect(find.text('2'), findsOneWidget);
    expect(find.text('3'), findsOneWidget);
    expect(find.text('E'), findsOneWidget);
    // Tap the second number
    await tester.tap(find.text('2'));
    expect(tappedNumber, 2);
  });
}
