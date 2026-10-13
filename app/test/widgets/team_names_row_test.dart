import 'package:curling_scoreboard/models/models.dart';
import 'package:curling_scoreboard/widgets/total_score/team_names_row.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

CurlingTeam _team(String name, Color color, Color textColor) => CurlingTeam(
  name: name,
  colorName: 'Rock',
  color: color,
  textColor: textColor,
  hasHammer: false,
);

void main() {
  testWidgets('TeamNamesRow shows each name on its rock color', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: SizedBox(
            height: 80,
            child: TeamNamesRow(
              team1: _team('Rockets', Colors.red, Colors.white),
              team2: _team('Comets', Colors.yellow, Colors.black),
            ),
          ),
        ),
      ),
    );

    for (final (name, color, textColor) in [
      ('Rockets', Colors.red, Colors.white),
      ('Comets', Colors.yellow, Colors.black),
    ]) {
      final text = tester.widget<Text>(find.text(name));
      expect(text.style?.color, textColor);
      final material = tester.widget<Material>(
        find
            .ancestor(of: find.text(name), matching: find.byType(Material))
            .first,
      );
      expect(material.color, color);
    }
    // The left team is on the left.
    expect(
      tester.getCenter(find.text('Rockets')).dx,
      lessThan(tester.getCenter(find.text('Comets')).dx),
    );
  });

  testWidgets('TeamNamesRow keeps a long name on one line', (tester) async {
    const longName = 'The Extraordinarily Long Named Curling Team of Champions';
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: SizedBox(
            width: 800,
            height: 60,
            child: TeamNamesRow(
              team1: _team(longName, Colors.red, Colors.white),
              team2: _team('Comets', Colors.yellow, Colors.black),
            ),
          ),
        ),
      ),
    );

    expect(tester.takeException(), isNull);
    expect(tester.getSize(find.text(longName)).width, greaterThan(0));
  });

  testWidgets('tapping TeamNamesRow calls onPressed', (tester) async {
    var pressed = 0;
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: SizedBox(
            height: 80,
            child: TeamNamesRow(
              team1: _team('Rockets', Colors.red, Colors.white),
              team2: _team('Comets', Colors.yellow, Colors.black),
              onPressed: () => pressed++,
            ),
          ),
        ),
      ),
    );

    await tester.tap(find.text('Comets'));
    expect(pressed, 1);
  });
}
