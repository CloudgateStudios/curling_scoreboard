import 'package:curling_scoreboard/widgets/total_score/team_total_score_widget.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets('TeamTotalScoreWidget renders score and background', (
    tester,
  ) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: Scaffold(
          body: TeamTotalScoreWidget(
            score: '5',
            backgroundColor: Colors.red,
            textColor: Colors.white,
          ),
        ),
      ),
    );
    expect(find.text('5'), findsOneWidget);
    final container = tester.widget<Container>(find.byType(Container).first);
    expect(
      (container.decoration as BoxDecoration?)?.color ?? container.color,
      Colors.red,
    );
  });

  testWidgets('TeamTotalScoreWidget shows hammer icon on right', (
    tester,
  ) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: Scaffold(
          body: TeamTotalScoreWidget(
            score: '2',
            backgroundColor: Colors.blue,
            textColor: Colors.yellow,
            shouldShowHammerIcon: true,
          ),
        ),
      ),
    );
    expect(find.byIcon(Icons.hardware_sharp), findsOneWidget);
  });

  testWidgets('TeamTotalScoreWidget shows hammer icon on left', (tester) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: Scaffold(
          body: TeamTotalScoreWidget(
            score: '3',
            backgroundColor: Colors.green,
            shouldShowHammerIcon: true,
            hammerIconPosition: TeamHammerIconPosition.left,
          ),
        ),
      ),
    );
    expect(find.byIcon(Icons.hardware_sharp), findsOneWidget);
  });

  group('sizing', () {
    // One team's half of a wide scoreboard. The test font's digits are
    // square, so this leaves the height as the limit, as on a real display.
    const block = Size(960, 500);

    Future<void> pump(WidgetTester tester, TeamTotalScoreWidget widget) async {
      tester.view
        ..physicalSize = const Size(1920, 1080)
        ..devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: Align(
              alignment: Alignment.topLeft,
              child: SizedBox.fromSize(size: block, child: widget),
            ),
          ),
        ),
      );
    }

    testWidgets('a score fills the height of its space', (tester) async {
      await pump(
        tester,
        const TeamTotalScoreWidget(score: '5', backgroundColor: Colors.red),
      );

      expect(tester.getSize(find.text('5')).height, block.height);
    });

    testWidgets('a team name takes nothing from the score', (tester) async {
      await pump(
        tester,
        const TeamTotalScoreWidget(score: '5', backgroundColor: Colors.red),
      );
      final without = tester.getRect(find.text('5'));

      await pump(
        tester,
        const TeamTotalScoreWidget(
          score: '5',
          backgroundColor: Colors.red,
          teamName: 'Team Henderson',
        ),
      );

      expect(tester.getRect(find.text('5')), without);
      // Below the digits, which stand on the baseline about four fifths of
      // the way down the score's line.
      expect(
        tester.getTopLeft(find.text('Team Henderson')).dy,
        greaterThan(without.top + without.height * 0.75),
      );
      expect(
        tester.getBottomLeft(find.text('Team Henderson')).dy,
        lessThanOrEqualTo(block.height),
      );
    });

    testWidgets('a two digit score and a long name stay clear of the icons', (
      tester,
    ) async {
      const longName =
          'The Extraordinarily Long Named Curling Team of Champions';
      await pump(
        tester,
        const TeamTotalScoreWidget(
          score: '12',
          backgroundColor: Colors.red,
          shouldShowHammerIcon: true,
          shouldShowLSFEIcon: true,
          hammerIconPosition: TeamHammerIconPosition.left,
          lsfeIconPosition: LSFEIconPosition.left,
          teamName: longName,
          innerClearance: 80,
        ),
      );

      expect(tester.takeException(), isNull);
      final hammer = tester.getRect(find.byIcon(Icons.hardware_sharp));
      final lsfe = tester.getRect(find.byIcon(Icons.emergency));
      for (final text in [find.text('12'), find.text(longName)]) {
        final rect = tester.getRect(text);
        expect(rect.left, greaterThanOrEqualTo(hammer.right));
        expect(rect.left, greaterThanOrEqualTo(lsfe.right));
        // Clear of the end number on the inner edge.
        expect(rect.right, lessThanOrEqualTo(block.width - 80));
      }
    });

    testWidgets('tapping the team name calls onTeamNamePressed', (
      tester,
    ) async {
      var pressed = 0;
      await pump(
        tester,
        TeamTotalScoreWidget(
          score: '5',
          backgroundColor: Colors.red,
          teamName: 'Team Henderson',
          onTeamNamePressed: () => pressed++,
        ),
      );

      await tester.tap(find.text('Team Henderson'));
      expect(pressed, 1);
    });
  });
}
