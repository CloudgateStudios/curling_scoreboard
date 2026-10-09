import 'package:flutter/material.dart';

class CurlingTeam {
  CurlingTeam({
    required this.name,
    required this.color,
    required this.textColor,
    required this.hasHammer,
    this.hadLastStoneFirstEnd = false,
    String? colorName,
  }) : colorName = colorName ?? name;

  factory CurlingTeam.fromJson(Map<String, dynamic> json) => CurlingTeam(
    name: json['name'] as String,
    color: _colorFromArgb32(json['color'] as int),
    textColor: _colorFromArgb32(json['textColor'] as int),
    hasHammer: json['hasHammer'] as bool,
    hadLastStoneFirstEnd: json['hadLastStoneFirstEnd'] as bool? ?? false,
    colorName: json['colorName'] as String?,
  );

  String name;

  /// What the team's rock color is called. The same as [name] unless the
  /// team has a name of its own.
  String colorName;
  Color color;
  Color textColor;
  bool hasHammer;
  bool hadLastStoneFirstEnd;

  Map<String, dynamic> toJson() => {
    'name': name,
    'colorName': colorName,
    'color': color.toARGB32(),
    'textColor': textColor.toARGB32(),
    'hasHammer': hasHammer,
    'hadLastStoneFirstEnd': hadLastStoneFirstEnd,
  };

  static Color _colorFromArgb32(int v) => Color.fromARGB(
    (v >> 24) & 0xFF,
    (v >> 16) & 0xFF,
    (v >> 8) & 0xFF,
    v & 0xFF,
  );
}
