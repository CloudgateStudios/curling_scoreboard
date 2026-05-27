import 'package:curling_scoreboard_flutter/widgets/total_score/team_total_score_widget.dart';
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

  testWidgets('TeamTotalScoreWidget shows hammer icon on left', (
    tester,
  ) async {
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
}
