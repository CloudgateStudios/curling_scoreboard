import 'package:flutter/foundation.dart';

/// One regular time a league plays each week, in local time.
@immutable
class LeagueDraw {
  const LeagueDraw({
    required this.day,
    required this.startMinutes,
    required this.endMinutes,
  });

  /// Reads `{day, start: 'HH:mm', end: 'HH:mm'}`, or returns null.
  static LeagueDraw? tryParse(Object? json) {
    if (json is! Map) return null;
    final day = json['day'];
    final start = _minutesOf(json['start']);
    final end = _minutesOf(json['end']);
    if (day is! int || day < 1 || day > 7) return null;
    if (start == null || end == null || end <= start) return null;
    return LeagueDraw(day: day, startMinutes: start, endMinutes: end);
  }

  static final _timePattern = RegExp(r'^(\d{2}):(\d{2})$');

  static int? _minutesOf(Object? time) {
    if (time is! String) return null;
    final match = _timePattern.firstMatch(time);
    if (match == null) return null;
    final hours = int.parse(match.group(1)!);
    final minutes = int.parse(match.group(2)!);
    if (hours > 23 || minutes > 59) return null;
    return hours * 60 + minutes;
  }

  static String _timeOf(int minutes) =>
      '${(minutes ~/ 60).toString().padLeft(2, '0')}:'
      '${(minutes % 60).toString().padLeft(2, '0')}';

  /// 1 (Monday) to 7 (Sunday), the same numbering as [DateTime.weekday].
  final int day;

  /// Minutes after midnight.
  final int startMinutes;
  final int endMinutes;

  Map<String, dynamic> toJson() => {
    'day': day,
    'start': _timeOf(startMinutes),
    'end': _timeOf(endMinutes),
  };
}

/// A team in a league.
@immutable
class LeagueTeam {
  const LeagueTeam({required this.id, required this.name, this.externalId});

  static LeagueTeam? tryParse(Object? json) {
    if (json is! Map) return null;
    final id = json['id'];
    final name = json['name'];
    final externalId = json['externalId'];
    if (id is! String || id.isEmpty) return null;
    if (name is! String || name.trim().isEmpty) return null;
    return LeagueTeam(
      id: id,
      name: name.trim(),
      externalId: externalId is String && externalId.isNotEmpty
          ? externalId
          : null,
    );
  }

  /// Stays the same when the team is renamed.
  final String id;
  final String name;

  /// The team's ID in the club's own league software, if it gave one.
  final String? externalId;

  Map<String, dynamic> toJson() => {
    'id': id,
    'name': name,
    'externalId': ?externalId,
  };
}

/// A league at the paired club, with the teams that play in it.
@immutable
class League {
  const League({
    required this.id,
    required this.name,
    this.active = true,
    this.seasonStart,
    this.seasonEnd,
    this.draws = const [],
    this.teams = const [],
  });

  /// Reads a league document. Draws and teams that cannot be read are left
  /// out, so one bad entry does not hide the rest of the league. Returns
  /// null only when the league has no name.
  static League? tryParse(String id, Object? json) {
    if (json is! Map) return null;
    final name = json['name'];
    if (name is! String || name.trim().isEmpty) return null;
    final seasonStart = json['seasonStart'];
    final seasonEnd = json['seasonEnd'];
    final draws = json['draws'];
    final teams = json['teams'];
    return League(
      id: id,
      name: name.trim(),
      active: json['active'] != false,
      seasonStart: seasonStart is String ? seasonStart : null,
      seasonEnd: seasonEnd is String ? seasonEnd : null,
      draws: [
        if (draws is List)
          for (final draw in draws) ?LeagueDraw.tryParse(draw),
      ],
      teams: [
        if (teams is List)
          for (final team in teams) ?LeagueTeam.tryParse(team),
      ]..sort((a, b) => compareNames(a.name, b.name)),
    );
  }

  /// Orders names the way a person would list them: ignoring case, and with
  /// numbers by value, so "Team 2" comes before "Team 10".
  static int compareNames(String a, String b) {
    final partsA = _nameParts.allMatches(a.toLowerCase()).toList();
    final partsB = _nameParts.allMatches(b.toLowerCase()).toList();
    for (var i = 0; i < partsA.length && i < partsB.length; i++) {
      final partA = partsA[i].group(0)!;
      final partB = partsB[i].group(0)!;
      final numberA = BigInt.tryParse(partA);
      final numberB = BigInt.tryParse(partB);
      final order = numberA != null && numberB != null
          ? numberA.compareTo(numberB)
          : partA.compareTo(partB);
      if (order != 0) return order;
    }
    final order = partsA.length.compareTo(partsB.length);
    // Names that only differ by case or leading zeros still need a fixed
    // order, so the list never shuffles between loads.
    return order != 0 ? order : a.compareTo(b);
  }

  // Runs of digits, and the runs of everything else between them.
  static final _nameParts = RegExp(r'\d+|\D+');

  /// How long before a draw's start time its league is already offered, to
  /// cover a game set up while the teams are still arriving.
  static const leadTime = Duration(minutes: 30);

  final String id;
  final String name;
  final bool active;

  /// `YYYY-MM-DD`, inclusive. Null means no limit on that side.
  final String? seasonStart;
  final String? seasonEnd;
  final List<LeagueDraw> draws;

  /// Sorted by name, see [compareNames].
  final List<LeagueTeam> teams;

  /// Whether the league is in one of its draws at [now], which is the
  /// scoreboard's local time. A league with no schedule is never playing; it
  /// can still be picked by hand.
  bool isPlayingAt(DateTime now) {
    if (!active) return false;

    // ISO dates compare correctly as text.
    final today =
        '${now.year.toString().padLeft(4, '0')}-'
        '${now.month.toString().padLeft(2, '0')}-'
        '${now.day.toString().padLeft(2, '0')}';
    if (seasonStart != null && today.compareTo(seasonStart!) < 0) return false;
    if (seasonEnd != null && today.compareTo(seasonEnd!) > 0) return false;

    final minutes = now.hour * 60 + now.minute;
    return draws.any(
      (draw) =>
          draw.day == now.weekday &&
          minutes >= draw.startMinutes - leadTime.inMinutes &&
          minutes <= draw.endMinutes,
    );
  }

  Map<String, dynamic> toJson() => {
    'name': name,
    'active': active,
    'seasonStart': ?seasonStart,
    'seasonEnd': ?seasonEnd,
    'draws': [for (final draw in draws) draw.toJson()],
    'teams': [for (final team in teams) team.toJson()],
  };
}

/// The league a game was played in, kept with the game.
@immutable
class GameLeague {
  const GameLeague({required this.id, required this.name});

  factory GameLeague.fromJson(Map<String, dynamic> json) =>
      GameLeague(id: json['id'] as String, name: json['name'] as String);

  final String id;
  final String name;

  Map<String, dynamic> toJson() => {'id': id, 'name': name};
}
