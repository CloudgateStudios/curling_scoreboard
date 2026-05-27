import 'package:flutter/material.dart';

class CurlingTeam {
  CurlingTeam({
    required this.name,
    required this.color,
    required this.textColor,
    required this.hasHammer,
    this.hadLastStoneFirstEnd = false,
  });
  String name;
  Color color;
  Color textColor;
  bool hasHammer;
  bool hadLastStoneFirstEnd;
}
