import 'package:curling_scoreboard/constants.dart';
import 'package:curling_scoreboard/l10n/app_localizations.dart';
import 'package:curling_scoreboard/models/curling_team.dart';
import 'package:flutter/material.dart';

/// One color of rocks: what it is called and how it is drawn.
@immutable
class RockColor {
  const RockColor({required this.name, required this.color});

  /// Reads `{name, hex}` as a club stores it. Returns null for anything that
  /// is not a usable color, so a bad value falls back to the defaults
  /// instead of breaking the scoreboard.
  static RockColor? tryParse(Object? json) {
    if (json is! Map) return null;
    final name = json['name'];
    final hex = json['hex'];
    if (name is! String || name.trim().isEmpty || hex is! String) return null;
    if (!_hexPattern.hasMatch(hex)) return null;
    return RockColor(
      name: name.trim(),
      color: Color(0xFF000000 | int.parse(hex.substring(1), radix: 16)),
    );
  }

  static final _hexPattern = RegExp(r'^#[0-9a-fA-F]{6}$');

  final String name;
  final Color color;

  /// Black or white, whichever reads better on [color].
  Color get textColor =>
      ThemeData.estimateBrightnessForColor(color) == Brightness.dark
      ? Constants.textHighContrastColor
      : Constants.textDefaultColor;

  /// The color as `#RRGGBB`.
  String get hex {
    final rgb = color.toARGB32() & 0xFFFFFF;
    return '#${rgb.toRadixString(16).padLeft(6, '0').toUpperCase()}';
  }

  Map<String, dynamic> toJson() => {'name': name, 'hex': hex};

  @override
  bool operator ==(Object other) =>
      other is RockColor && other.name == name && other.color == color;

  @override
  int get hashCode => Object.hash(name, color);
}

/// The two colors of rocks on a sheet. Team 1 throws [team1].
@immutable
class RockColors {
  const RockColors({required this.team1, required this.team2});

  /// Red and yellow, which the scoreboard uses whenever a club has not said
  /// otherwise. These need nothing from the backend.
  factory RockColors.defaults(AppLocalizations l10n) => RockColors(
    team1: RockColor(name: l10n.teamNameRed, color: Constants.redTeamColor),
    team2: RockColor(
      name: l10n.teamNameYellow,
      color: Constants.yellowTeamColor,
    ),
  );

  /// The colors [team1] and [team2] are playing with, which were fixed when
  /// their game started.
  factory RockColors.ofTeams(CurlingTeam team1, CurlingTeam team2) =>
      RockColors(
        team1: RockColor(name: team1.colorName, color: team1.color),
        team2: RockColor(name: team2.colorName, color: team2.color),
      );

  /// Reads `{team1: {name, hex}, team2: {name, hex}}`. Returns null unless
  /// both colors are usable.
  static RockColors? tryParse(Object? json) {
    if (json is! Map) return null;
    final team1 = RockColor.tryParse(json['team1']);
    final team2 = RockColor.tryParse(json['team2']);
    if (team1 == null || team2 == null) return null;
    return RockColors(team1: team1, team2: team2);
  }

  final RockColor team1;
  final RockColor team2;

  Map<String, dynamic> toJson() => {
    'team1': team1.toJson(),
    'team2': team2.toJson(),
  };

  @override
  bool operator ==(Object other) =>
      other is RockColors && other.team1 == team1 && other.team2 == team2;

  @override
  int get hashCode => Object.hash(team1, team2);
}
