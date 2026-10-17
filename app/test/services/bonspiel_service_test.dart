import 'dart:async';

import 'package:curling_scoreboard/services/bonspiel_service.dart';
import 'package:curling_scoreboard/services/registration_service.dart';
import 'package:fake_async/fake_async.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

const _paired = <String, Object>{'clubId': 'club-a', 'sheetId': 'sheet-1'};

Map<String, dynamic> _plan(String name, String startDate) => {
  'name': name,
  'active': true,
  'startDate': startDate,
  'endDate': startDate,
  'numberOfEnds': 8,
  'events': [
    {'id': 'a', 'name': 'A Event'},
  ],
  'teams': [
    {'id': 't1', 'name': 'Smith'},
    {'id': 't2', 'name': 'Jones'},
  ],
  'draws': [
    {'id': 'd1', 'label': 'Draw 1', 'start': '${startDate}T19:00'},
  ],
  'games': [
    {
      'id': 'g1',
      'label': 'A1',
      'drawId': 'd1',
      'sheetId': 'sheet-1',
      'eventId': 'a',
      'team1': null,
      'team2': {'teamId': 't2'},
    },
  ],
};

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  late List<String> watchedClubs;
  late StreamController<Map<String, Map<String, dynamic>>> plans;
  late Map<String, StreamController<Map<String, dynamic>?>> states;

  Stream<Map<String, Map<String, dynamic>>> watch(String clubId) {
    watchedClubs.add(clubId);
    plans = StreamController<Map<String, Map<String, dynamic>>>();
    return plans.stream;
  }

  Stream<Map<String, dynamic>?> watchState(String clubId, String id) {
    final controller = StreamController<Map<String, dynamic>?>();
    states[id] = controller;
    return controller.stream;
  }

  Future<(BonspielService, SharedPreferences)> build(
    Map<String, Object> stored,
  ) async {
    SharedPreferences.setMockInitialValues(stored);
    final prefs = await SharedPreferences.getInstance();
    final service = BonspielService(
      prefs,
      RegistrationService(prefs),
      watch: watch,
      watchState: watchState,
    );
    addTearDown(service.dispose);
    return (service, prefs);
  }

  setUp(() {
    watchedClubs = [];
    states = {};
  });

  test('an unpaired scoreboard has no bonspiels and watches nothing', () async {
    final (service, _) = await build({});
    service.start();

    expect(service.bonspiels.value, isEmpty);
    expect(watchedClubs, isEmpty);
  });

  test(
    'a paired scoreboard follows its club bonspiels and their state',
    () async {
      final (service, _) = await build(_paired);
      service.start();
      plans.add({
        'spring': _plan('Spring Spiel', '2027-04-09'),
        'fall': _plan('Fall Spiel', '2026-11-06'),
        'broken': {'active': true},
      });
      await pumpEventQueue();

      // The earliest first; the one that could not be read is left out.
      expect(service.bonspiels.value.map((b) => b.name), [
        'Fall Spiel',
        'Spring Spiel',
      ]);
      expect(states.keys, containsAll(['fall', 'spring']));
      var fall = service.bonspiels.value.first;
      expect(fall.teamsOf(fall.games.single).$1, isNull);

      // The functions work out who the first team is.
      states['fall']!.add({
        'g1': {
          'status': 'ready',
          'team1': {'teamId': 't1', 'name': 'Smith'},
          'team2': {'teamId': 't2', 'name': 'Jones'},
        },
      });
      await pumpEventQueue();
      fall = service.bonspiels.value.first;
      expect(fall.teamsOf(fall.games.single).$1?.name, 'Smith');
    },
  );

  test('remembered bonspiels are there before the club is reached', () async {
    final (first, prefs) = await build(_paired);
    first.start();
    plans.add({'fall': _plan('Fall Spiel', '2026-11-06')});
    await pumpEventQueue();
    states['fall']!.add({
      'g1': {
        'status': 'ready',
        'team1': {'teamId': 't1', 'name': 'Smith'},
        'team2': {'teamId': 't2', 'name': 'Jones'},
      },
    });
    await pumpEventQueue();

    // The next start of the app, with no connection.
    final restarted = BonspielService(
      prefs,
      RegistrationService(prefs),
      watch: watch,
      watchState: watchState,
    );
    addTearDown(restarted.dispose);
    final fall = restarted.bonspiels.value.single;
    expect(fall.draws.single.start, DateTime(2026, 11, 6, 19));
    expect(fall.teamsOf(fall.games.single).$1?.name, 'Smith');
  });

  test('stops following a bonspiel the club makes inactive', () async {
    final (service, _) = await build(_paired);
    service.start();
    plans.add({'fall': _plan('Fall Spiel', '2026-11-06')});
    await pumpEventQueue();
    final state = states['fall']!;

    plans.add({});
    await pumpEventQueue();

    expect(service.bonspiels.value, isEmpty);
    expect(state.hasListener, isFalse);
  });

  test('disconnecting drops the bonspiels', () async {
    final (service, prefs) = await build(_paired);
    service.start();
    plans.add({'fall': _plan('Fall Spiel', '2026-11-06')});
    await pumpEventQueue();

    // What RegistrationService.disconnect does to the saved pairing.
    await prefs.remove('clubId');
    await prefs.remove('sheetId');
    service.start();
    await pumpEventQueue();

    expect(service.bonspiels.value, isEmpty);
    expect(prefs.getString('bonspiels'), isNull);
  });

  test('a refused read keeps the remembered bonspiels and is retried', () {
    fakeAsync((async) {
      late BonspielService service;
      unawaited(build(_paired).then((built) => service = built.$1));
      async.flushMicrotasks();

      service.start();
      plans.add({'fall': _plan('Fall Spiel', '2026-11-06')});
      async.flushMicrotasks();

      plans.addError(Exception('permission-denied'));
      async.flushMicrotasks();
      expect(service.bonspiels.value, hasLength(1));
      expect(watchedClubs, hasLength(1));

      async.elapse(BonspielService.retryDelay);
      expect(watchedClubs, hasLength(2));
    });
  });
}
