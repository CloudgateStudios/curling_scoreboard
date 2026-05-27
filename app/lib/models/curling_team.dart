import 'package:flutter/material.dart';

class CurlingTeam {
  CurlingTeam({
    required this.name,
    required this.color,
    required this.textColor,
    required this.hasHammer,
    this.hadLastStoneFirstEnd = false,
  });

  factory CurlingTeam.fromJson(Map<String, dynamic> json) => CurlingTeam(
    name: json['name'] as String,
    color: _colorFromArgb32(json['color'] as int),
    textColor: _colorFromArgb32(json['textColor'] as int),
    hasHammer: json['hasHammer'] as bool,
    hadLastStoneFirstEnd: json['hadLastStoneFirstEnd'] as bool? ?? false,
  );

  String name;
  Color color;
  Color textColor;
  bool hasHammer;
  bool hadLastStoneFirstEnd;

  Map<String, dynamic> toJson() => {
    'name': name,
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
