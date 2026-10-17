import 'package:curling_scoreboard/models/models.dart';
import 'package:flutter_test/flutter_test.dart';

// Four teams on two sheets: two A event semis on Friday evening, then the A
// final and a B game for their losers on Saturday morning.
const _plan = <String, dynamic>{
  'name': 'Fall Spiel',
  'active': true,
  'startDate': '2026-11-06',
  'endDate': '2026-11-08',
  'numberOfEnds': 8,
  'events': [
    {'id': 'a', 'name': 'A Event'},
    {'id': 'b', 'name': 'B Event', 'numberOfEnds': 6},
  ],
  'teams': [
    {'id': 't1', 'name': 'Smith'},
    {'id': 't2', 'name': 'Jones', 'externalId': 'J-7'},
    {'id': 't3', 'name': 'Brown'},
    {'id': 't4', 'name': 'Lee'},
  ],
  'draws': [
    {'id': 'd2', 'label': 'Draw 2', 'start': '2026-11-07T09:00'},
    {'id': 'd1', 'label': 'Draw 1', 'start': '2026-11-06T19:00'},
  ],
  'games': [
    {
      'id': 'a1',
      'label': 'A1',
      'drawId': 'd1',
      'sheetId': 's1',
      'eventId': 'a',
      'team1': {'teamId': 't1'},
      'team2': {'teamId': 't2'},
    },
    {
      'id': 'a2',
      'label': 'A2',
      'drawId': 'd1',
      'sheetId': 's2',
      'eventId': 'a',
      'team1': {'teamId': 't3'},
      'team2': {'teamId': 't4'},
    },
    {
      'id': 'a3',
      'label': 'A Final',
      'drawId': 'd2',
      'sheetId': 's1',
      'eventId': 'a',
      'team1': {'from': 'a1', 'result': 'winner'},
      'team2': {'from': 'a2', 'result': 'winner'},
    },
    {
      'id': 'b1',
      'label': 'B Final',
      'drawId': 'd2',
      'sheetId': 's2',
      'eventId': 'b',
      'team1': {'from': 'a1', 'result': 'loser'},
      'team2': null,
    },
    {'label': 'no id'},
  ],
};

Bonspiel _bonspiel([Map<String, dynamic>? state]) =>
    Bonspiel.tryParse('fall', _plan, state)!;

void main() {
  test('reads a plan, leaving out what cannot be read', () {
    final bonspiel = _bonspiel();
    expect(bonspiel.name, 'Fall Spiel');
    expect(bonspiel.games.map((g) => g.id), ['a1', 'a2', 'a3', 'b1']);
    // Draws in the order they are played.
    expect(bonspiel.draws.map((d) => d.label), ['Draw 1', 'Draw 2']);
    expect(bonspiel.draws.first.start, DateTime(2026, 11, 6, 19));
    expect(bonspiel.games[2].team1, isA<LinkedSide>());
    expect(bonspiel.games[3].team2, isNull);
    expect(Bonspiel.tryParse('x', {'name': 'No dates'}), isNull);
  });

  test('is on during its dates, and only while active', () {
    final bonspiel = _bonspiel();
    expect(bonspiel.isOnAt(DateTime(2026, 11, 5, 23, 59)), isFalse);
    expect(bonspiel.isOnAt(DateTime(2026, 11, 6, 8)), isTrue);
    expect(bonspiel.isOnAt(DateTime(2026, 11, 8, 23)), isTrue);
    expect(bonspiel.isOnAt(DateTime(2026, 11, 9)), isFalse);
    final inactive = Bonspiel.tryParse('x', {..._plan, 'active': false})!;
    expect(inactive.isOnAt(DateTime(2026, 11, 7)), isFalse);
  });

  test('moves to the next draw half an hour before it starts', () {
    final bonspiel = _bonspiel();
    String? draw(DateTime now) => bonspiel.currentDraw(now)?.label;
    // Before the first draw, the first.
    expect(draw(DateTime(2026, 11, 6, 9)), 'Draw 1');
    expect(draw(DateTime(2026, 11, 6, 21)), 'Draw 1');
    expect(draw(DateTime(2026, 11, 7, 8, 29)), 'Draw 1');
    expect(draw(DateTime(2026, 11, 7, 8, 30)), 'Draw 2');
    expect(draw(DateTime(2026, 11, 7, 15)), 'Draw 2');
  });

  test("finds a sheet's games", () {
    final bonspiel = _bonspiel();
    expect(bonspiel.gameOn(bonspiel.draws[1], 's2')?.label, 'B Final');
    expect(bonspiel.gameOn(bonspiel.draws[1], 's3'), isNull);
    expect(bonspiel.gamesOnSheet('s1').map((g) => g.label), ['A1', 'A Final']);
  });

  test('takes the ends from the event, or the bonspiel', () {
    final bonspiel = _bonspiel();
    expect(bonspiel.endsOf(bonspiel.gameById('a3')!), 8);
    expect(bonspiel.endsOf(bonspiel.gameById('b1')!), 6);
  });

  test('knows the placed teams, and those the state has worked out', () {
    var bonspiel = _bonspiel();
    var (team1, team2) = bonspiel.teamsOf(bonspiel.gameById('a1')!);
    expect([team1?.name, team2?.externalId], ['Smith', 'J-7']);
    (team1, team2) = bonspiel.teamsOf(bonspiel.gameById('a3')!);
    expect([team1, team2], [null, null]);

    bonspiel = _bonspiel({
      'a1': {
        'status': 'final',
        'team1': {'teamId': 't1', 'name': 'Smith'},
        'team2': {'teamId': 't2', 'name': 'Jones'},
      },
      'a3': {
        'status': 'waiting',
        'team1': {'teamId': 't2', 'name': 'Jones'},
        'team2': null,
      },
    });
    (team1, team2) = bonspiel.teamsOf(bonspiel.gameById('a3')!);
    // The plan's team, with its external ID.
    expect(team1?.externalId, 'J-7');
    expect(team2, isNull);
    expect(bonspiel.state['a1']!.isFinal, isTrue);
  });

  test('offers the teams of the games a side comes from first', () {
    final bonspiel = _bonspiel();
    expect(bonspiel.likelyTeams(bonspiel.gameById('a3')!).map((t) => t.name), [
      'Smith',
      'Jones',
      'Brown',
      'Lee',
    ]);
    // B Final: the loser of A1 is Smith or Jones; the other side is open,
    // but the two of them are enough to start from.
    expect(bonspiel.likelyTeams(bonspiel.gameById('b1')!).map((t) => t.name), [
      'Smith',
      'Jones',
    ]);
  });

  test('offers teams not busy elsewhere in the draw for an open game', () {
    final bonspiel = Bonspiel.tryParse('x', {
      ..._plan,
      'games': [
        {
          'id': 'g1',
          'label': 'G1',
          'drawId': 'd1',
          'sheetId': 's1',
          'team1': {'teamId': 't1'},
          'team2': {'teamId': 't2'},
        },
        {'id': 'g2', 'label': 'G2', 'drawId': 'd1', 'sheetId': 's2'},
      ],
    })!;
    expect(bonspiel.likelyTeams(bonspiel.gameById('g2')!).map((t) => t.name), [
      'Brown',
      'Lee',
    ]);
  });

  test("reads a place in a pool, and offers the pool's teams for it", () {
    final bonspiel = Bonspiel.tryParse('x', {
      ..._plan,
      'games': [
        ...(_plan['games'] as List).take(2),
        {
          'id': 'p1',
          'label': 'Playoff',
          'drawId': 'd2',
          'sheetId': 's1',
          'eventId': 'b',
          'team1': {'rank': 1, 'eventId': 'a'},
          'team2': {'rank': 0, 'eventId': 'a'},
        },
      ],
    })!;
    final playoff = bonspiel.gameById('p1')!;
    expect(playoff.team1, isA<RankSide>());
    expect((playoff.team1! as RankSide).rank, 1);
    expect(playoff.team1!.toJson(), {'rank': 1, 'eventId': 'a'});
    // No place 0.
    expect(playoff.team2, isNull);
    expect(bonspiel.eventById('a')?.name, 'A Event');
    expect(bonspiel.likelyTeams(playoff).map((t) => t.name), [
      'Smith',
      'Jones',
      'Brown',
      'Lee',
    ]);
  });

  test('round trips through the cache', () {
    final bonspiel = _bonspiel({
      'a3': {
        'status': 'ready',
        'team1': {'teamId': 't2', 'name': 'Jones'},
        'team2': {'teamId': 't3', 'name': 'Brown'},
      },
    });
    final cached = Bonspiel.fromJson('fall', bonspiel.toJson())!;
    expect(cached.toJson(), bonspiel.toJson());
    expect(cached.teamsOf(cached.gameById('a3')!).$2?.name, 'Brown');
    expect(cached.draws.first.start, DateTime(2026, 11, 6, 19));
  });

  test('keeps the bonspiel game a game was played as', () {
    const tag = GameBonspiel(id: 'fall', name: 'Fall Spiel', gameId: 'a3');
    expect(GameBonspiel.fromJson(tag.toJson()).gameId, 'a3');
  });
}
