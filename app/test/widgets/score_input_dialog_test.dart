import 'package:curling_scoreboard_flutter/l10n/app_localizations.dart';
import 'package:curling_scoreboard_flutter/widgets/app_bar/score_input_dialog.dart';
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
  testWidgets('ScoreInputDialog renders with score and team options', (
    tester,
  ) async {
    await tester.pumpWidget(
      wrapWithMaterialApp(
        const ScoreInputDialog(
          defaultTeam: 'Red',
          defaultScore: 0,
          end: 1,
        ),
      ),
    );
    // Check for dialog title
    expect(find.textContaining('End'), findsOneWidget);
    // Check for score options
    for (var i = 0; i <= 8; i++) {
      expect(find.text(i.toString()), findsWidgets);
    }
    // Check for team options
    expect(find.text('Red'), findsOneWidget);
    expect(find.text('Yellow '), findsOneWidget);
  });

  testWidgets('ScoreInputDialog defaults to 0 and no team selected', (
    tester,
  ) async {
    await tester.pumpWidget(
      wrapWithMaterialApp(
        const ScoreInputDialog(
          defaultScore: 0,
          end: 1,
        ),
      ),
    );

    // Verify score 0 is selected
    // We can check if the button is enabled/disabled.
    // With score 0 and no team, button should be enabled (for blank end).
    final enterButton = find.widgetWithText(ElevatedButton, 'Enter');
    expect(tester.widget<ElevatedButton>(enterButton).enabled, isTrue);
  });

  testWidgets('ScoreInputDialog disables team selection when score is 0', (
    tester,
  ) async {
    await tester.pumpWidget(
      wrapWithMaterialApp(
        const ScoreInputDialog(
          defaultScore: 0,
          end: 1,
        ),
      ),
    );

    // Find the team selection widget (AbsorbPointer)
    // We look for the AbsorbPointer inside the Opacity widget
    // within the AlertDialog
    final dialogFinder = find.byType(AlertDialog);
    final opacityFinder = find.descendant(
      of: dialogFinder,
      matching: find.byType(Opacity),
    );
    final absorbPointer = find.descendant(
      of: opacityFinder,
      matching: find.byType(AbsorbPointer),
    );

    expect(absorbPointer, findsOneWidget);
    expect(tester.widget<AbsorbPointer>(absorbPointer).absorbing, isTrue);
  });

  testWidgets('ScoreInputDialog enables team selection when score > 0', (
    tester,
  ) async {
    await tester.pumpWidget(
      wrapWithMaterialApp(
        const ScoreInputDialog(
          defaultScore: 0,
          end: 1,
        ),
      ),
    );

    // Select score 1
    await tester.tap(find.text('1'));
    await tester.pump();

    // Verify team selection is enabled
    final dialogFinder = find.byType(AlertDialog);
    final opacityFinder = find.descendant(
      of: dialogFinder,
      matching: find.byType(Opacity),
    );
    final absorbPointer = find.descendant(
      of: opacityFinder,
      matching: find.byType(AbsorbPointer),
    );
    expect(tester.widget<AbsorbPointer>(absorbPointer).absorbing, isFalse);
  });

  testWidgets(
    'ScoreInputDialog disables Enter button if score > 0 and no team selected',
    (
      tester,
    ) async {
      await tester.pumpWidget(
        wrapWithMaterialApp(
          const ScoreInputDialog(
            defaultScore: 0,
            end: 1,
          ),
        ),
      );

      // Select score 1
      await tester.tap(find.text('1'));
      await tester.pump();

      // Verify Enter button is disabled
      final enterButton = find.widgetWithText(ElevatedButton, 'Enter');
      expect(tester.widget<ElevatedButton>(enterButton).enabled, isFalse);
    },
  );

  testWidgets(
    'ScoreInputDialog enables Enter button if score > 0 and team selected',
    (
      tester,
    ) async {
      await tester.pumpWidget(
        wrapWithMaterialApp(
          const ScoreInputDialog(
            defaultScore: 0,
            end: 1,
          ),
        ),
      );

      // Select score 1
      await tester.tap(find.text('1'));
      await tester.pump();

      // Select team Red
      await tester.tap(find.text('Red'));
      await tester.pump();

      // Verify Enter button is enabled
      final enterButton = find.widgetWithText(ElevatedButton, 'Enter');
      expect(tester.widget<ElevatedButton>(enterButton).enabled, isTrue);
    },
  );
}
