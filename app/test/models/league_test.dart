import 'package:curling_scoreboard/models/models.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  // Monday 5 October 2026.
  DateTime monday(int hour, [int minute = 0]) =>
      DateTime(2026, 10, 5, hour, minute);

  League mondayNight({
    bool active = true,
    String? seasonStart,
    String? seasonEnd,
  }) => League.tryParse('monday', {
    'name': 'Monday Night',
    'active': active,
    'seasonStart': ?seasonStart,
    'seasonEnd': ?seasonEnd,
    'draws': [
      {'day': 1, 'start': '18:30', 'end': '20:30'},
      {'day': 1, 'start': '20:45', 'end': '22:45'},
    ],
    'teams': [
      {'id': 't2', 'name': 'team smith', 'externalId': '1042'},
      {'id': 't1', 'name': 'Team Jones'},
    ],
  })!;

  group('League.tryParse', () {
    test('reads a league document, sorting teams by name', () {
      final league = mondayNight();
      expect(league.id, 'monday');
      expect(league.name, 'Monday Night');
      expect(league.draws, hasLength(2));
      expect(league.draws.first.startMinutes, 18 * 60 + 30);
      expect(league.teams.map((t) => t.name), ['Team Jones', 'team smith']);
      expect(league.teams.last.externalId, '1042');
      expect(league.teams.first.externalId, isNull);
    });

    test('leaves out draws and teams it cannot read', () {
      final league = League.tryParse('l', {
        'name': 'Patchy',
        'draws': [
          {'day': 8, 'start': '18:30', 'end': '20:30'},
          {'day': 1, 'start': '6:30pm', 'end': '20:30'},
          {'day': 1, 'start': '20:30', 'end': '18:30'},
          {'day': 2, 'start': '19:00', 'end': '21:00'},
        ],
        'teams': [
          {'id': 't1', 'name': 'Good'},
          {'id': '', 'name': 'No ID'},
          {'id': 't3', 'name': ' '},
          'not a team',
        ],
      })!;
      expect(league.draws.single.day, 2);
      expect(league.teams.single.name, 'Good');
    });

    test('needs a name', () {
      expect(League.tryParse('l', {'teams': <Object>[]}), isNull);
      expect(League.tryParse('l', null), isNull);
    });

    test('survives a round trip through JSON', () {
      final league = mondayNight(seasonStart: '2026-10-01');
      final copy = League.tryParse(league.id, league.toJson())!;
      expect(copy.toJson(), league.toJson());
    });
  });

  group('League.isPlayingAt', () {
    test('is playing during a draw, on its day', () {
      final league = mondayNight();
      expect(league.isPlayingAt(monday(18, 30)), isTrue);
      expect(league.isPlayingAt(monday(19, 45)), isTrue);
      expect(league.isPlayingAt(monday(22, 45)), isTrue);
      // Tuesday at the same time.
      expect(league.isPlayingAt(DateTime(2026, 10, 6, 19, 45)), isFalse);
    });

    test('is offered half an hour before a draw, and not after it', () {
      final league = mondayNight();
      expect(league.isPlayingAt(monday(17, 59)), isFalse);
      expect(league.isPlayingAt(monday(18)), isTrue);
      expect(league.isPlayingAt(monday(22, 46)), isFalse);
    });

    test('is not playing outside its season', () {
      final league = mondayNight(
        seasonStart: '2026-10-05',
        seasonEnd: '2027-03-29',
      );
      expect(league.isPlayingAt(monday(19)), isTrue);
      // The Monday before the season, and the one after it.
      expect(league.isPlayingAt(DateTime(2026, 9, 28, 19)), isFalse);
      expect(league.isPlayingAt(DateTime(2027, 3, 29, 19)), isTrue);
      expect(league.isPlayingAt(DateTime(2027, 4, 5, 19)), isFalse);
    });

    test('is never playing when inactive or without a schedule', () {
      expect(mondayNight(active: false).isPlayingAt(monday(19)), isFalse);
      final unscheduled = League.tryParse('l', {'name': 'Any Time'})!;
      expect(unscheduled.isPlayingAt(monday(19)), isFalse);
    });
  });
}
