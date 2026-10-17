import 'package:curling_scoreboard/models/league.dart';
import 'package:flutter/foundation.dart';

/// Where one side of a bonspiel game gets its team: placed by the
/// coordinator, or out of an earlier game. A side still to be decided is
/// null.
@immutable
sealed class BonspielSide {
  const BonspielSide();

  static BonspielSide? tryParse(Object? json) {
    if (json is! Map) return null;
    final teamId = json['teamId'];
    if (teamId is String && teamId.isNotEmpty) return PlacedSide(teamId);
    final from = json['from'];
    final result = json['result'];
    if (from is String && from.isNotEmpty && result is String) {
      if (result == 'winner') return LinkedSide(from, winner: true);
      if (result == 'loser') return LinkedSide(from, winner: false);
    }
    return null;
  }

  Map<String, dynamic> toJson();
}

/// A team the coordinator put in the game.
class PlacedSide extends BonspielSide {
  const PlacedSide(this.teamId);

  final String teamId;

  @override
  Map<String, dynamic> toJson() => {'teamId': teamId};
}

/// The winner or loser of the game [from].
class LinkedSide extends BonspielSide {
  const LinkedSide(this.from, {required this.winner});

  final String from;
  final bool winner;

  @override
  Map<String, dynamic> toJson() => {
    'from': from,
    'result': winner ? 'winner' : 'loser',
  };
}

/// A part of a bonspiel with its own final: "A Event".
@immutable
class BonspielEvent {
  const BonspielEvent({required this.id, required this.name, this.ends});

  static BonspielEvent? tryParse(Object? json) {
    if (json is! Map) return null;
    final id = json['id'];
    final name = json['name'];
    final ends = json['numberOfEnds'];
    if (id is! String || id.isEmpty || name is! String) return null;
    return BonspielEvent(id: id, name: name, ends: ends is int ? ends : null);
  }

  final String id;
  final String name;

  /// For this event's games, in place of the bonspiel's.
  final int? ends;

  Map<String, dynamic> toJson() => {
    'id': id,
    'name': name,
    'numberOfEnds': ?ends,
  };
}

/// When a round of the bonspiel's games is played, in local time.
@immutable
class BonspielDraw {
  const BonspielDraw({
    required this.id,
    required this.label,
    required this.start,
  });

  /// Reads `{id, label, start: 'YYYY-MM-DDTHH:mm'}`, or returns null.
  static BonspielDraw? tryParse(Object? json) {
    if (json is! Map) return null;
    final id = json['id'];
    final label = json['label'];
    final start = json['start'];
    if (id is! String || id.isEmpty || label is! String) return null;
    if (start is! String) return null;
    final match = _startPattern.firstMatch(start);
    if (match == null) return null;
    final parts = [for (var i = 1; i <= 5; i++) int.parse(match.group(i)!)];
    return BonspielDraw(
      id: id,
      label: label,
      start: DateTime(parts[0], parts[1], parts[2], parts[3], parts[4]),
    );
  }

  static final _startPattern = RegExp(
    r'^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$',
  );

  final String id;
  final String label;
  final DateTime start;

  Map<String, dynamic> toJson() {
    String two(int n) => n.toString().padLeft(2, '0');
    return {
      'id': id,
      'label': label,
      'start':
          '${start.year.toString().padLeft(4, '0')}-${two(start.month)}-'
          '${two(start.day)}T${two(start.hour)}:${two(start.minute)}',
    };
  }
}

/// One game of a bonspiel, as planned.
@immutable
class BonspielGame {
  const BonspielGame({
    required this.id,
    required this.label,
    required this.drawId,
    required this.sheetId,
    required this.eventId,
    this.team1,
    this.team2,
  });

  static BonspielGame? tryParse(Object? json) {
    if (json is! Map) return null;
    final id = json['id'];
    final label = json['label'];
    final drawId = json['drawId'];
    final sheetId = json['sheetId'];
    final eventId = json['eventId'];
    if (id is! String || id.isEmpty || label is! String) return null;
    if (drawId is! String || sheetId is! String) return null;
    return BonspielGame(
      id: id,
      label: label,
      drawId: drawId,
      sheetId: sheetId,
      eventId: eventId is String ? eventId : '',
      team1: BonspielSide.tryParse(json['team1']),
      team2: BonspielSide.tryParse(json['team2']),
    );
  }

  final String id;

  /// What everyone calls the game: "A7".
  final String label;
  final String drawId;
  final String sheetId;
  final String eventId;

  /// Throws the first rock color.
  final BonspielSide? team1;
  final BonspielSide? team2;

  Map<String, dynamic> toJson() => {
    'id': id,
    'label': label,
    'drawId': drawId,
    'sheetId': sheetId,
    'eventId': eventId,
    'team1': team1?.toJson(),
    'team2': team2?.toJson(),
  };
}

/// Who is in a game as the functions last worked it out, from the plan and
/// the results so far.
@immutable
class BonspielGameState {
  const BonspielGameState({this.team1, this.team2, this.isFinal = false});

  static BonspielGameState? tryParse(Object? json) {
    if (json is! Map) return null;
    return BonspielGameState(
      team1: _team(json['team1']),
      team2: _team(json['team2']),
      isFinal: json['status'] == 'final',
    );
  }

  // `{teamId, name}`. Only a team the plan has can be picked, so one a
  // scoreboard recorded without an ID is treated as not known.
  static LeagueTeam? _team(Object? json) =>
      json is Map ? LeagueTeam.tryParse({...json, 'id': json['teamId']}) : null;

  static Map<String, dynamic>? _teamJson(LeagueTeam? team) =>
      team == null ? null : {'teamId': team.id, 'name': team.name};

  final LeagueTeam? team1;
  final LeagueTeam? team2;

  /// Whether the game has been played.
  final bool isFinal;

  Map<String, dynamic> toJson() => {
    'status': isFinal ? 'final' : 'waiting',
    'team1': _teamJson(team1),
    'team2': _teamJson(team2),
  };
}

/// A bonspiel at the paired club: its plan, and who is in each game so far.
@immutable
class Bonspiel {
  const Bonspiel({
    required this.id,
    required this.name,
    required this.startDate,
    required this.endDate,
    required this.ends,
    this.active = true,
    this.events = const [],
    this.teams = const [],
    this.draws = const [],
    this.games = const [],
    this.state = const {},
  });

  /// Reads a bonspiel's plan, with the games of its state document, if it
  /// has been read. Entries that cannot be read are left out, so one bad
  /// game does not hide the rest. Returns null when the plan has no name or
  /// dates.
  static Bonspiel? tryParse(
    String id,
    Object? plan, [
    Map<String, dynamic>? stateGames,
  ]) {
    if (plan is! Map) return null;
    final name = plan['name'];
    final startDate = plan['startDate'];
    final endDate = plan['endDate'];
    final ends = plan['numberOfEnds'];
    if (name is! String || name.trim().isEmpty) return null;
    if (startDate is! String || endDate is! String) return null;
    List<T> list<T>(Object? items, T? Function(Object?) read) => [
      if (items is List)
        for (final item in items) ?read(item),
    ];
    return Bonspiel(
      id: id,
      name: name.trim(),
      active: plan['active'] != false,
      startDate: startDate,
      endDate: endDate,
      ends: ends is int && ends > 0 ? ends : 8,
      events: list(plan['events'], BonspielEvent.tryParse),
      teams: list(plan['teams'], LeagueTeam.tryParse),
      draws: list(plan['draws'], BonspielDraw.tryParse)
        ..sort((a, b) => a.start.compareTo(b.start)),
      games: list(plan['games'], BonspielGame.tryParse),
      state: {
        if (stateGames != null)
          for (final MapEntry(:key, :value) in stateGames.entries)
            key: ?BonspielGameState.tryParse(value),
      },
    );
  }

  /// How long before a draw's start time its games are offered, to cover a
  /// game set up while the teams are still arriving. The same as a league's.
  static const Duration leadTime = League.leadTime;

  final String id;
  final String name;
  final bool active;

  /// `YYYY-MM-DD`, inclusive.
  final String startDate;
  final String endDate;

  /// For every game unless its event says otherwise.
  final int ends;
  final List<BonspielEvent> events;

  /// In the order the coordinator listed them.
  final List<LeagueTeam> teams;

  /// In the order they are played.
  final List<BonspielDraw> draws;
  final List<BonspielGame> games;

  /// By game ID. Empty until the state has been read.
  final Map<String, BonspielGameState> state;

  /// Whether the bonspiel is on at [now], the scoreboard's local time.
  bool isOnAt(DateTime now) {
    if (!active) return false;
    // ISO dates compare correctly as text.
    final today =
        '${now.year.toString().padLeft(4, '0')}-'
        '${now.month.toString().padLeft(2, '0')}-'
        '${now.day.toString().padLeft(2, '0')}';
    return today.compareTo(startDate) >= 0 && today.compareTo(endDate) <= 0;
  }

  /// The draw a game set up at [now] is most likely for: the one starting
  /// next, from [leadTime] before it starts until the same time before the
  /// draw after it. Before the first draw, the first.
  BonspielDraw? currentDraw(DateTime now) {
    BonspielDraw? current;
    for (final draw in draws) {
      if (!now.isBefore(draw.start.subtract(leadTime))) current = draw;
    }
    return current ?? draws.firstOrNull;
  }

  BonspielDraw? drawOf(BonspielGame game) =>
      draws.where((d) => d.id == game.drawId).firstOrNull;

  /// The game on [sheetId] in [draw], if there is one.
  BonspielGame? gameOn(BonspielDraw draw, String sheetId) => games
      .where((g) => g.drawId == draw.id && g.sheetId == sheetId)
      .firstOrNull;

  /// [sheetId]'s games, in draw order.
  List<BonspielGame> gamesOnSheet(String sheetId) {
    final order = {for (final (i, d) in draws.indexed) d.id: i};
    return games.where((g) => g.sheetId == sheetId).toList()
      ..sort((a, b) => (order[a.drawId] ?? 0).compareTo(order[b.drawId] ?? 0));
  }

  /// [draw]'s games, in the order of their sheets' IDs.
  List<BonspielGame> gamesIn(BonspielDraw draw) =>
      games.where((g) => g.drawId == draw.id).toList();

  BonspielGame? gameById(String id) =>
      games.where((g) => g.id == id).firstOrNull;

  LeagueTeam? teamById(String id) => teams.where((t) => t.id == id).firstOrNull;

  /// How many ends [game] is played to.
  int endsOf(BonspielGame game) =>
      events.where((e) => e.id == game.eventId).firstOrNull?.ends ?? ends;

  /// The team on each side of [game], where it is known: who the functions
  /// worked out from the results, or the team the coordinator placed.
  (LeagueTeam?, LeagueTeam?) teamsOf(BonspielGame game) {
    final known = state[game.id];
    LeagueTeam? side(BonspielSide? planned, LeagueTeam? worked) {
      if (worked != null) return teamById(worked.id) ?? worked;
      if (planned is PlacedSide) return teamById(planned.teamId);
      return null;
    }

    return (side(game.team1, known?.team1), side(game.team2, known?.team2));
  }

  /// The teams most likely to be on a side of [game] not known yet, to offer
  /// first when picking them: those in the games it comes from, or else any
  /// team not already in another game of its draw.
  List<LeagueTeam> likelyTeams(BonspielGame game) {
    final likely = <LeagueTeam>[];
    void add(LeagueTeam? team) {
      if (team != null && !likely.any((t) => t.id == team.id)) {
        likely.add(teamById(team.id) ?? team);
      }
    }

    final (team1, team2) = teamsOf(game);
    for (final (side, known) in [(game.team1, team1), (game.team2, team2)]) {
      if (known != null) {
        add(known);
      } else if (side case LinkedSide(:final from)) {
        final source = gameById(from);
        if (source == null) continue;
        final (a, b) = teamsOf(source);
        add(a);
        add(b);
      }
    }
    if (likely.length >= 2) return likely;
    freeTeams(game).forEach(add);
    return likely;
  }

  /// The teams not in another game of [game]'s draw, as far as is known.
  List<LeagueTeam> freeTeams(BonspielGame game) {
    final busy = {
      for (final other in games)
        if (other.drawId == game.drawId && other.id != game.id)
          ...switch (teamsOf(other)) {
            (final a, final b) => [?a?.id, ?b?.id],
          },
    };
    return [
      for (final team in teams)
        if (!busy.contains(team.id)) team,
    ];
  }

  /// The plan and the games of the state, as read, for the scoreboard's
  /// cache.
  Map<String, dynamic> toJson() => {
    'plan': {
      'name': name,
      'active': active,
      'startDate': startDate,
      'endDate': endDate,
      'numberOfEnds': ends,
      'events': [for (final e in events) e.toJson()],
      'teams': [for (final t in teams) t.toJson()],
      'draws': [for (final d in draws) d.toJson()],
      'games': [for (final g in games) g.toJson()],
    },
    'state': {
      for (final MapEntry(:key, :value) in state.entries) key: value.toJson(),
    },
  };

  static Bonspiel? fromJson(String id, Object? json) {
    if (json is! Map) return null;
    final state = json['state'];
    return tryParse(
      id,
      json['plan'],
      state is Map<String, dynamic> ? state : null,
    );
  }
}

/// The bonspiel game a game was played as, kept with the game. The
/// functions put its result into the bonspiel's brackets.
@immutable
class GameBonspiel {
  const GameBonspiel({
    required this.id,
    required this.name,
    required this.gameId,
  });

  factory GameBonspiel.fromJson(Map<String, dynamic> json) => GameBonspiel(
    id: json['id'] as String,
    name: json['name'] as String,
    gameId: json['gameId'] as String,
  );

  final String id;
  final String name;

  /// The game's ID in the bonspiel's plan.
  final String gameId;

  Map<String, dynamic> toJson() => {'id': id, 'name': name, 'gameId': gameId};
}
