import 'package:curling_scoreboard_flutter/widgets/total_score/total_score_row.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets(
    'TotalScoreRow renders both team scores, hammer icons, and end number',
    (tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: TotalScoreRow(
              team1Score: 5,
              team1Color: Colors.red,
              team1TextColor: Colors.white,
              team1HasHammer: true,
              team1HasLSFE: true,
              team2Score: 3,
              team2Color: Colors.yellow,
              team2TextColor: Colors.black,
              team2HasHammer: false,
              team2HasLSFE: false,
              endNumber: '2',
            ),
          ),
        ),
      );
      expect(find.text('5'), findsOneWidget);
      expect(find.text('3'), findsOneWidget);
      expect(find.text('2'), findsOneWidget); // end number
      expect(
        find.byIcon(Icons.hardware_sharp),
        findsOneWidget,
      ); // hammer icon for team1
    },
  );
}
