import 'dart:async';

import 'package:curling_scoreboard/services/league_service.dart';
import 'package:curling_scoreboard/services/registration_service.dart';
import 'package:fake_async/fake_async.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

const _paired = <String, Object>{'clubId': 'club-a', 'sheetId': 'sheet-1'};

const _documents = <String, Map<String, dynamic>>{
  'thursday': {
    'name': 'Thursday Doubles',
    'active': true,
    'draws': <Object>[],
    'teams': [
      {'id': 't3', 'name': 'Stone Cold'},
    ],
  },
  'monday': {
    'name': 'Monday Night',
    'active': true,
    'draws': [
      {'day': 1, 'start': '18:30', 'end': '20:30'},
    ],
    'teams': [
      {'id': 't1', 'name': 'Team Smith', 'externalId': '1042'},
      {'id': 't2', 'name': 'Team Jones'},
    ],
  },
  'broken': {'active': true},
};

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  late List<String> watchedClubs;
  late StreamController<Map<String, Map<String, dynamic>>> documents;

  Stream<Map<String, Map<String, dynamic>>> watch(String clubId) {
    watchedClubs.add(clubId);
    documents = StreamController<Map<String, Map<String, dynamic>>>();
    return documents.stream;
  }

  Future<(LeagueService, SharedPreferences)> build(
    Map<String, Object> stored,
  ) async {
    SharedPreferences.setMockInitialValues(stored);
    final prefs = await SharedPreferences.getInstance();
    final service = LeagueService(
      prefs,
      RegistrationService(prefs),
      watch: watch,
    );
    addTearDown(service.dispose);
    return (service, prefs);
  }

  setUp(() => watchedClubs = []);

  test('an unpaired scoreboard has no leagues and watches nothing', () async {
    final (service, _) = await build({});
    service.start();

    expect(service.leagues.value, isEmpty);
    expect(watchedClubs, isEmpty);
  });

  test('a paired scoreboard picks up its club leagues, by name', () async {
    final (service, _) = await build(_paired);
    service.start();
    expect(watchedClubs, ['club-a']);

    documents.add(_documents);
    await pumpEventQueue();

    // The league that could not be read is left out.
    expect(service.leagues.value.map((l) => l.name), [
      'Monday Night',
      'Thursday Doubles',
    ]);
    expect(service.leagues.value.first.teams, hasLength(2));
  });

  test('remembered leagues are there before the club is reached', () async {
    final (first, prefs) = await build(_paired);
    first.start();
    documents.add(_documents);
    await pumpEventQueue();

    // The next start of the app, with no connection.
    final restarted = LeagueService(
      prefs,
      RegistrationService(prefs),
      watch: watch,
    );
    addTearDown(restarted.dispose);
    expect(restarted.leagues.value.map((l) => l.id), ['monday', 'thursday']);
    expect(restarted.leagues.value.first.teams.last.externalId, '1042');
    expect(restarted.leagues.value.first.draws.single.day, 1);
  });

  test('leagues the club removes go away', () async {
    final (service, _) = await build(_paired);
    service.start();
    documents.add(_documents);
    await pumpEventQueue();

    documents.add({});
    await pumpEventQueue();

    expect(service.leagues.value, isEmpty);
  });

  test('disconnecting drops the leagues', () async {
    final (service, prefs) = await build(_paired);
    service.start();
    documents.add(_documents);
    await pumpEventQueue();

    // What RegistrationService.disconnect does to the saved pairing.
    await prefs.remove('clubId');
    await prefs.remove('sheetId');
    service.start();
    await pumpEventQueue();

    expect(service.leagues.value, isEmpty);
    expect(prefs.getString('leagues'), isNull);
  });

  test('a refused read keeps the remembered leagues and is retried', () {
    fakeAsync((async) {
      late LeagueService service;
      unawaited(build(_paired).then((built) => service = built.$1));
      async.flushMicrotasks();

      service.start();
      documents.add(_documents);
      async.flushMicrotasks();

      documents.addError(Exception('permission-denied'));
      async.flushMicrotasks();
      expect(service.leagues.value, hasLength(2));
      expect(watchedClubs, hasLength(1));

      async.elapse(LeagueService.retryDelay);
      expect(watchedClubs, hasLength(2));
    });
  });
}
