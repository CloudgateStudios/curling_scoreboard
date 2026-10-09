import 'package:curling_scoreboard/constants.dart';
import 'package:curling_scoreboard/l10n/app_localizations_en.dart';
import 'package:curling_scoreboard/models/models.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('RockColor', () {
    test('parses a name and hex color', () {
      final color = RockColor.tryParse({'name': ' Blue ', 'hex': '#2196f3'});
      expect(color?.name, 'Blue');
      expect(color?.color, const Color(0xFF2196F3));
      expect(color?.hex, '#2196F3');
    });

    test('rejects anything that is not a usable color', () {
      expect(RockColor.tryParse(null), isNull);
      expect(RockColor.tryParse('blue'), isNull);
      expect(RockColor.tryParse({'name': 'Blue'}), isNull);
      expect(RockColor.tryParse({'name': '', 'hex': '#2196F3'}), isNull);
      expect(RockColor.tryParse({'name': 'Blue', 'hex': '2196F3'}), isNull);
      expect(RockColor.tryParse({'name': 'Blue', 'hex': '#21F'}), isNull);
      expect(RockColor.tryParse({'name': 'Blue', 'hex': 0x2196F3}), isNull);
    });

    test('picks text that reads on the color', () {
      RockColor rock(Color color) => RockColor(name: 'x', color: color);
      expect(rock(Colors.yellow).textColor, Constants.textDefaultColor);
      expect(rock(Colors.red).textColor, Constants.textHighContrastColor);
      expect(rock(Colors.black).textColor, Constants.textHighContrastColor);
    });
  });

  group('RockColors', () {
    test('defaults to red and yellow, as the scoreboard always has', () {
      final colors = RockColors.defaults(AppLocalizationsEn());
      expect(colors.team1.name, 'Red');
      expect(colors.team1.color, Constants.redTeamColor);
      expect(colors.team1.textColor, Constants.textHighContrastColor);
      expect(colors.team2.name, 'Yellow');
      expect(colors.team2.color, Constants.yellowTeamColor);
      expect(colors.team2.textColor, Constants.textDefaultColor);
    });

    test('survives a round trip through JSON', () {
      const colors = RockColors(
        team1: RockColor(name: 'Blue', color: Color(0xFF2196F3)),
        team2: RockColor(name: 'Green', color: Color(0xFF4CAF50)),
      );
      expect(RockColors.tryParse(colors.toJson()), colors);
    });

    test('needs both colors', () {
      expect(
        RockColors.tryParse({
          'team1': {'name': 'Blue', 'hex': '#2196F3'},
        }),
        isNull,
      );
      expect(RockColors.tryParse(null), isNull);
    });

    test('reads the colors a game was started with', () {
      final team1 = CurlingTeam(
        name: 'Team Smith',
        colorName: 'Blue',
        color: const Color(0xFF2196F3),
        textColor: Colors.white,
        hasHammer: true,
      );
      final team2 = CurlingTeam(
        name: 'Green',
        color: const Color(0xFF4CAF50),
        textColor: Colors.white,
        hasHammer: false,
      );
      final colors = RockColors.ofTeams(team1, team2);
      expect(colors.team1.name, 'Blue');
      // A team without a name of its own is called by its color.
      expect(colors.team2.name, 'Green');
      expect(colors.team2.color, const Color(0xFF4CAF50));
    });
  });
}
