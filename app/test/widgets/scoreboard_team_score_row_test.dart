import 'package:curling_scoreboard/widgets/scoreboard/scoreboard_team_score_row.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets('ScoreboardTeamScoreRow renders scores and handles tap', (
    tester,
  ) async {
    var tappedEnd = 0;
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: ScoreboardTeamScoreRow(
            upperLimit: 3,
            needExtra: true,
            scores: const [2, 0, 1],
            emptyScoreBackgroundColor: Colors.white,
            filledScoreBackgroundColor: Colors.red,
            scoreTextColor: Colors.black,
            scoreTextHighContrastColor: Colors.white,
            onPressed: (end) => tappedEnd = end,
          ),
        ),
      ),
    );
    expect(find.text('2'), findsOneWidget);
    expect(find.text('0'), findsOneWidget);
    expect(find.text('1'), findsOneWidget);
    // Tap the first score
    await tester.tap(find.text('2'));
    expect(tappedEnd, 1);
  });

  testWidgets('ScoreboardTeamScoreRow does not report taps on unplayed ends', (
    tester,
  ) async {
    var tappedEnd = 0;
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: ScoreboardTeamScoreRow(
            upperLimit: 3,
            needExtra: true,
            scores: const [2],
            emptyScoreBackgroundColor: Colors.white,
            filledScoreBackgroundColor: Colors.red,
            scoreTextColor: Colors.black,
            scoreTextHighContrastColor: Colors.white,
            onPressed: (end) => tappedEnd = end,
          ),
        ),
      ),
    );

    final placeholders = find.byWidgetPredicate(
      (widget) => widget is ScoreContainer && widget.score == -1,
    );
    expect(placeholders, findsNWidgets(3));

    await tester.tap(placeholders.first, warnIfMissed: false);
    await tester.pumpAndSettle();

    expect(tappedEnd, 0);
  });
}
