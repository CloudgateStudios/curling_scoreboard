import 'package:curling_scoreboard_flutter/widgets/scoreboard/scoreboard_team_score_row.dart';
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
}
