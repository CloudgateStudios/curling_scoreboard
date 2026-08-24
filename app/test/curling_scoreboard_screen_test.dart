import 'package:curling_scoreboard/widgets/widgets.dart';
import 'package:flutter_test/flutter_test.dart';

import 'helpers/pump_app.dart';

void main() {
  group('editing an end that has not been played', () {
    testWidgets('tapping an end number with no score does not crash', (
      tester,
    ) async {
      await pumpScoreboardAppAndStartGame(tester);

      await tester.tap(
        find.descendant(
          of: find.byType(ScoreboardStaticNumberRow),
          matching: find.text('1'),
        ),
      );
      await tester.pumpAndSettle();

      expect(tester.takeException(), isNull);
      expect(find.byType(ScoreInputDialog), findsNothing);
    });

    testWidgets('tapping an empty score cell does not crash', (tester) async {
      await pumpScoreboardAppAndStartGame(tester);

      final emptyCells = find.byWidgetPredicate(
        (widget) => widget is ScoreContainer && widget.score == -1,
      );
      expect(emptyCells, findsWidgets);

      await tester.tap(emptyCells.first, warnIfMissed: false);
      await tester.pumpAndSettle();

      expect(tester.takeException(), isNull);
      expect(find.byType(ScoreInputDialog), findsNothing);
    });

    testWidgets('tapping the extra end before it is played does not crash', (
      tester,
    ) async {
      await pumpScoreboardAppAndStartGame(tester);

      await tester.tap(
        find.descendant(
          of: find.byType(ScoreboardStaticNumberRow),
          matching: find.text('E'),
        ),
      );
      await tester.pumpAndSettle();

      expect(tester.takeException(), isNull);
      expect(find.byType(ScoreInputDialog), findsNothing);
    });
  });

  testWidgets('a played end can still be edited', (tester) async {
    await pumpScoreboardAppAndStartGame(tester);

    // Enter a score for end 1 so there is something to edit.
    await tester.tap(find.text('Add Score'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Enter'));
    await tester.pumpAndSettle();

    await tester.tap(
      find.descendant(
        of: find.byType(ScoreboardStaticNumberRow),
        matching: find.text('1'),
      ),
    );
    await tester.pumpAndSettle();

    expect(tester.takeException(), isNull);
    expect(find.byType(ScoreInputDialog), findsOneWidget);
  });

  group('dismissing a score dialog', () {
    testWidgets('tapping outside the enter score dialog does not crash', (
      tester,
    ) async {
      await pumpScoreboardAppAndStartGame(tester);

      await tester.tap(find.text('Add Score'));
      await tester.pumpAndSettle();
      expect(find.byType(ScoreInputDialog), findsOneWidget);

      await tester.tapAt(const Offset(5, 5));
      await tester.pumpAndSettle();

      expect(tester.takeException(), isNull);
      expect(find.byType(ScoreInputDialog), findsNothing);
      // Nothing was entered, so the scoreboard is untouched.
      expect(find.text('Add Score'), findsOneWidget);
    });

    testWidgets(
      'tapping outside the edit score dialog leaves the score alone',
      (
        tester,
      ) async {
        await pumpScoreboardAppAndStartGame(tester);

        // Record a score for end 1 so there is something to edit.
        await tester.tap(find.text('Add Score'));
        await tester.pumpAndSettle();
        await tester.tap(
          find.descendant(
            of: find.byType(ScoreInputDialog),
            matching: find.text('3'),
          ),
        );
        await tester.pumpAndSettle();
        await tester.tap(find.text('Enter'));
        await tester.pumpAndSettle();

        await tester.tap(
          find.descendant(
            of: find.byType(ScoreboardStaticNumberRow),
            matching: find.text('1'),
          ),
        );
        await tester.pumpAndSettle();
        expect(find.byType(ScoreInputDialog), findsOneWidget);

        await tester.tapAt(const Offset(5, 5));
        await tester.pumpAndSettle();

        expect(tester.takeException(), isNull);
        expect(find.byType(ScoreInputDialog), findsNothing);
      },
    );
  });
}
