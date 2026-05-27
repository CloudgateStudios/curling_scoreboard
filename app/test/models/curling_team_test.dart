import 'package:curling_scoreboard_flutter/models/curling_team.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('CurlingTeam', () {
    test('Constructor assigns properties correctly', () {
      final team = CurlingTeam(
        name: 'Red',
        color: Colors.red,
        textColor: Colors.white,
        hasHammer: true,
      );
      expect(team.name, 'Red');
      expect(team.color, Colors.red);
      expect(team.textColor, Colors.white);
      expect(team.hasHammer, isTrue);
    });

    test('Properties can be updated', () {
      final team =
          CurlingTeam(
              name: 'Yellow',
              color: Colors.yellow,
              textColor: Colors.black,
              hasHammer: false,
            )
            ..name = 'Blue'
            ..color = Colors.blue
            ..textColor = Colors.white
            ..hasHammer = true;
      expect(team.name, 'Blue');
      expect(team.color, Colors.blue);
      expect(team.textColor, Colors.white);
      expect(team.hasHammer, isTrue);
    });
  });
}
